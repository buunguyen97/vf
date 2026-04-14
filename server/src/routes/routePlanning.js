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
      consumptionOverride: conditions?.consumptionWhKm || null,
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

    // Tight radius: only stations genuinely on/adjacent to the route
    // On highways, even 2-3km straight-line can mean a completely different road
    const MAX_DETOUR_KM = 1; // Only stations within 1km of route

    for (let i = 0; i < polylineCoords.length - 1; i++) {
      const p1 = polylineCoords[i];
      const p2 = polylineCoords[i + 1];
      const segDist = getDistance(p1[0], p1[1], p2[0], p2[1]);
      cumulativeDistance += segDist;

      // Check every point for tight 1km radius — can't afford to skip
      for (const st of allDbStations) {
        if (foundStationIds.has(st.id)) continue;

        const distToRoute = getDistance(p1[0], p1[1], st.latitude, st.longitude);
        if (distToRoute <= MAX_DETOUR_KM) {
          foundStationIds.add(st.id);
          allRouteStations.push({
            ...st,
            distanceFromStartKm: Math.round((cumulativeDistance) * 10) / 10,
            detourKm: Math.round(distToRoute * 1000) / 1000, // Precise to meter
          });
        }
      }
    }

    // Sort stations by distance from start
    allRouteStations.sort((a, b) => a.distanceFromStartKm - b.distanceFromStartKm);

    // ============================================================
    // PASS 2: Smart Multi-Station Route Planner
    // ============================================================
    // Strategy: At each charging stop, suggest 2-3 best alternatives.
    // Uses exact targetBattery as the hard minimum (no buffer).
    // Scoring factors: distance progress, route proximity, charger power,
    // and estimated charging time.
    // ============================================================

    const chargingStops = []; // Array of stop groups: [{ stopNumber, stations: [...] }]
    let currentBatteryPct = currentBattery;
    let currentPositionKm = 0;
    const minBatteryPct = Math.max(targetBattery, 5); // Exact threshold, never go below
    const chargeToPercent = 90;

    const candidateStations = allRouteStations.filter(st => {
      return st.distanceFromStartKm < totalDistanceKm;
    });

    let safetyCounter = 0;
    const maxStops = 20;

    while (safetyCounter < maxStops) {
      safetyCounter++;

      const maxRangeKm = batteryPctToKm(currentBatteryPct - minBatteryPct);
      const maxReachableKm = currentPositionKm + maxRangeKm;

      // Can we reach the destination with battery above threshold?
      const distToDestination = totalDistanceKm - currentPositionKm;
      const batteryNeededForDest = kmToBatteryPct(distToDestination);
      const batteryAtDestination = currentBatteryPct - batteryNeededForDest;

      if (batteryAtDestination >= minBatteryPct) {
        break; // We can make it!
      }

      // Need a charging stop — find ALL stations in the sweet spot range
      // Sweet spot: battery on arrival between targetBattery% and targetBattery+10%
      const sweetSpotMax = minBatteryPct + 10;
      const matchingStations = [];

      for (let i = 0; i < candidateStations.length; i++) {
        const st = candidateStations[i];

        // Skip stations behind us
        if (st.distanceFromStartKm <= currentPositionKm) continue;

        // Can we reach this station?
        const distToStation = st.distanceFromStartKm - currentPositionKm;
        const batteryNeeded = kmToBatteryPct(distToStation);
        const batteryOnArrival = currentBatteryPct - batteryNeeded;

        // Only include stations where we arrive in the sweet spot range
        if (batteryOnArrival >= minBatteryPct && batteryOnArrival <= sweetSpotMax) {
          // Score for sorting (best recommendation first)
          const detourPenalty = st.detourKm * 20;
          const powerBonus = Math.min(st.power_kw / 10, 15);
          const progressScore = (st.distanceFromStartKm / totalDistanceKm) * 50;
          const score = progressScore - detourPenalty + powerBonus;

          matchingStations.push({
            ...st,
            batteryAtStation: Math.round(batteryOnArrival),
            score,
          });
        }
      }

      // If no station in sweet spot, fallback: find any reachable station
      if (matchingStations.length === 0) {
        for (let i = 0; i < candidateStations.length; i++) {
          const st = candidateStations[i];
          if (st.distanceFromStartKm <= currentPositionKm) continue;

          const distToStation = st.distanceFromStartKm - currentPositionKm;
          const batteryNeeded = kmToBatteryPct(distToStation);
          const batteryOnArrival = currentBatteryPct - batteryNeeded;

          if (batteryOnArrival >= minBatteryPct) {
            const detourPenalty = st.detourKm * 20;
            const powerBonus = Math.min(st.power_kw / 10, 15);
            const progressScore = (st.distanceFromStartKm / totalDistanceKm) * 50;
            const score = progressScore - detourPenalty + powerBonus;

            matchingStations.push({
              ...st,
              batteryAtStation: Math.round(batteryOnArrival),
              score,
            });
          }
        }
        // Take only the best one as fallback
        matchingStations.sort((a, b) => b.score - a.score);
        matchingStations.splice(1);
      }

      if (matchingStations.length === 0) {
        console.warn(`[RoutePlanner] No reachable station from km ${currentPositionKm.toFixed(1)}, battery ${currentBatteryPct.toFixed(1)}%`);
        break;
      }

      // Sort by score descending — best recommendation first
      matchingStations.sort((a, b) => b.score - a.score);

      const alternatives = matchingStations;

      const stopNumber = chargingStops.length + 1;

      // Mark stations
      alternatives.forEach((st, idx) => {
        st.isOptimal = true;
        st.stopNumber = stopNumber;
        st.isRecommended = idx === 0; // First one is the top recommendation
        st.alternativeIndex = idx;
      });

      chargingStops.push({
        stopNumber,
        stations: alternatives,
      });

      // For the next iteration, assume we go to the RECOMMENDED station (best score)
      const recommended = alternatives[0];
      currentPositionKm = recommended.distanceFromStartKm;
      currentBatteryPct = chargeToPercent;
    }

    // Build flat optimalStations list (all alternatives from all stops)
    const optimalStations = chargingStops.flatMap(stop => stop.stations);

    // ============================================================
    // PASS 3: Emergency — Battery too low? Find nearest station!
    // ============================================================
    const maxRangeFromStart = batteryPctToKm(currentBattery - minBatteryPct);
    const canReachDestination = maxRangeFromStart >= totalDistanceKm;
    let emergencyStation = null;
    let insufficientBattery = false;

    if (chargingStops.length === 0 && !canReachDestination) {
      insufficientBattery = true;

      let nearestDist = Infinity;
      for (const st of allDbStations) {
        const dist = getDistance(origin[0], origin[1], st.latitude, st.longitude) * 1.3;
        const batteryNeeded = kmToBatteryPct(dist);
        const batteryOnArrival = currentBattery - batteryNeeded;

        if (dist < nearestDist && batteryOnArrival >= 0) {
          nearestDist = dist;
          emergencyStation = {
            ...st,
            distanceFromStartKm: Math.round(dist * 10) / 10,
            batteryAtStation: Math.max(0, Math.round(batteryOnArrival)),
            isEmergency: true,
            isOptimal: true,
            stopNumber: 1,
            isRecommended: true,
            alternativeIndex: 0,
          };
        }
      }

      if (emergencyStation) {
        chargingStops.push({ stopNumber: 1, stations: [emergencyStation] });
        optimalStations.push(emergencyStation);
        console.log(`[RoutePlanner] Emergency: nearest station "${emergencyStation.name}" at ${nearestDist.toFixed(1)}km`);
      } else {
        console.warn(`[RoutePlanner] Emergency: NO reachable station at all with ${currentBattery}% battery!`);
      }
    }

    // Calculate battery at each route station for display
    // Use the recommended station path for battery simulation
    const recommendedPath = chargingStops.map(stop => stop.stations[0]);

    const displayStations = allRouteStations.map(st => {
      const distFromStart = st.distanceFromStartKm;

      let segmentStartKm = 0;
      let segmentStartBattery = currentBattery;

      for (const optSt of recommendedPath) {
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
        optimalStations,
        chargingStops, // New: grouped stops with alternatives
        insufficientBattery,
        emergencyStation: emergencyStation || null,
    });

  } catch (error) {
    console.error('Error in /optimal-route:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;

