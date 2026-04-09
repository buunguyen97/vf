const express = require('express');
const router = express.Router();
const { getDb } = require('../database/init');
const { estimateRange } = require('../services/rangeEngine');

router.post('/optimal-route', async (req, res) => {
  try {
    const { origin, destination, currentBattery, targetBattery, vehicleId, conditions } = req.body;

    if (!origin || !destination || !currentBattery || targetBattery === undefined || !vehicleId) {
      return res.status(400).json({ error: 'Missing required parameters' });
    }

    // 1. Fetch Route from OSRM
    const osrmUrl = `http://router.project-osrm.org/route/v1/driving/${origin[1]},${origin[0]};${destination[1]},${destination[0]}?overview=full&geometries=geojson`;
    const routeRes = await fetch(osrmUrl);
    
    if (!routeRes.ok) {
        return res.status(500).json({ error: 'Failed to fetch route from OSRM' });
    }
    const routeData = await routeRes.json();
    
    if (routeData.code !== 'Ok' || routeData.routes.length === 0) {
        return res.status(404).json({ error: 'No route found' });
    }

    const route = routeData.routes[0];
    const totalDistanceKm = route.distance / 1000;
    const polylineCoords = route.geometry.coordinates.map(coord => [coord[1], coord[0]]);

    // 2. Fetch Vehicle & compute consumption
    const db = getDb();
    const vehicle = db.prepare('SELECT * FROM vehicles WHERE id = ?').get(vehicleId);
    if (!vehicle) return res.status(404).json({ error: 'Vehicle not found' });

    const { adjustedConsumptionWhKm } = estimateRange({
      batteryPercent: 100,
      batteryCapacityKwh: vehicle.battery_capacity_kwh,
      baseConsumption: vehicle.base_consumption_wh_km,
      temperature: conditions?.temperature || 32,
      speed: conditions?.speed || 60,
      acOn: conditions?.acOn !== undefined ? conditions.acOn : true
    });

    const energyCapacityWh = vehicle.battery_capacity_kwh * 1000;
    const allDbStations = db.prepare('SELECT * FROM charging_stations').all();

    // Helper: Haversine distance
    function getDistance(lat1, lon1, lat2, lon2) {
      const R = 6371;
      const dLat = (lat2 - lat1) * Math.PI / 180;
      const dLon = (lon2 - lon1) * Math.PI / 180;
      const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon/2) * Math.sin(dLon/2);
      return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    }

    // Helper: Convert km to battery % consumed
    function kmToBatteryPct(km) {
      return (km * adjustedConsumptionWhKm) / energyCapacityWh * 100;
    }

    // Helper: Convert battery % to range km
    function batteryPctToKm(pct) {
      return (pct / 100) * energyCapacityWh / adjustedConsumptionWhKm;
    }

    // ============================================================
    // PASS 1: Collect all stations along the route with distances
    // ============================================================
    // Sample route points at regular intervals to find nearby stations
    const allRouteStations = [];
    const foundStationIds = new Set();
    let cumulativeDistance = 0;

    for (let i = 0; i < polylineCoords.length - 1; i++) {
      const p1 = polylineCoords[i];
      const p2 = polylineCoords[i + 1];
      const segDist = getDistance(p1[0], p1[1], p2[0], p2[1]);
      cumulativeDistance += segDist;

      // Check every ~5 points to save CPU
      if (i % 5 !== 0 && i !== polylineCoords.length - 2) continue;

      for (const st of allDbStations) {
        if (foundStationIds.has(st.id)) continue;

        const distToRoute = getDistance(p1[0], p1[1], st.latitude, st.longitude);
        if (distToRoute <= 5) { // Within 5km of route
          foundStationIds.add(st.id);
          allRouteStations.push({
            ...st,
            distanceFromStartKm: Math.round((cumulativeDistance + distToRoute) * 10) / 10,
            detourKm: Math.round(distToRoute * 10) / 10,
          });
        }
      }
    }

    // Sort stations by distance from start
    allRouteStations.sort((a, b) => a.distanceFromStartKm - b.distanceFromStartKm);

    // ============================================================
    // PASS 2: Greedy "Gas Station" Algorithm
    // ============================================================
    // Strategy: Drive as far as possible. Only charge when you MUST 
    // (i.e., you can't reach the next station or destination without charging).
    // When choosing where to charge, pick the FARTHEST reachable station.
    // This minimizes total stops.
    // ============================================================

    const optimalStations = [];
    let currentBatteryPct = currentBattery;
    let currentPositionKm = 0;
    // Soft floor: target ±5% flexibility
    // e.g., target 25% → hard floor 20%, arrival battery ~20-30%
    const minBatteryPct = Math.max(targetBattery - 5, 5); 
    const chargeToPercent = 90; // Charge up to 90% at each stop

    // Filter route stations to only those reachable (positive battery remaining)
    const candidateStations = allRouteStations.filter(st => {
      // Must be reachable from origin with full starting battery
      return st.distanceFromStartKm < totalDistanceKm;
    });

    let safetyCounter = 0; // Prevent infinite loop
    const maxStops = 20;

    while (safetyCounter < maxStops) {
      safetyCounter++;

      // How far can we go from current position with current battery?
      const maxRangeKm = batteryPctToKm(currentBatteryPct - minBatteryPct);
      const maxReachableKm = currentPositionKm + maxRangeKm;

      // Can we reach the destination?
      if (maxReachableKm >= totalDistanceKm) {
        // We can make it without charging! 
        break;
      }

      // We CAN'T reach the destination. Find the FARTHEST station we can reach.
      // This is the greedy choice — go as far as possible before stopping.
      let bestStation = null;
      let bestStationIdx = -1;

      for (let i = 0; i < candidateStations.length; i++) {
        const st = candidateStations[i];
        
        // Skip stations behind us
        if (st.distanceFromStartKm <= currentPositionKm) continue;

        // Can we reach this station?
        const distToStation = st.distanceFromStartKm - currentPositionKm;
        const batteryNeeded = kmToBatteryPct(distToStation);
        const batteryOnArrival = currentBatteryPct - batteryNeeded;

        if (batteryOnArrival >= minBatteryPct) {
          // We can reach this station — keep looking for a farther one
          bestStation = { ...st, batteryAtStation: Math.round(batteryOnArrival) };
          bestStationIdx = i;
        }
      }

      if (!bestStation) {
        // No reachable station found — we're stuck. Break to avoid infinite loop.
        console.warn(`[RoutePlanner] No reachable station from km ${currentPositionKm.toFixed(1)}, battery ${currentBatteryPct.toFixed(1)}%`);
        break;
      }

      // Charge at this station
      bestStation.isOptimal = true;
      optimalStations.push(bestStation);

      // Update position and battery
      currentPositionKm = bestStation.distanceFromStartKm;
      currentBatteryPct = chargeToPercent; // Assume charging to 90%
    }

    // Calculate battery at each route station for display
    const displayStations = allRouteStations.map(st => {
      const distFromStart = st.distanceFromStartKm;
      
      // Find which charging segment this station is in
      let segmentStartKm = 0;
      let segmentStartBattery = currentBattery;
      
      for (const optSt of optimalStations) {
        if (optSt.distanceFromStartKm < distFromStart) {
          segmentStartKm = optSt.distanceFromStartKm;
          segmentStartBattery = chargeToPercent;
        } else {
          break;
        }
      }

      const distInSegment = distFromStart - segmentStartKm;
      const batteryUsed = kmToBatteryPct(distInSegment);
      const batteryAtStation = Math.round(segmentStartBattery - batteryUsed);

      return { ...st, batteryAtStation };
    }).filter(st => st.batteryAtStation > 0);

    res.json({
        totalDistanceKm: Math.round(totalDistanceKm),
        polylineCoords,
        allRouteStations: displayStations,
        optimalStations
    });

  } catch (error) {
    console.error('Error in /optimal-route:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;

