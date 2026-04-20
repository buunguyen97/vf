const express = require('express');
const router = express.Router();
const { getDb } = require('../database/init');
const { estimateRange } = require('../services/rangeEngine');
const { resolveVehicle } = require('../services/vehicleResolver');

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

function normalizeCoordinatePair(coords) {
  if (!Array.isArray(coords) || coords.length < 2) return null;

  const lat = Number(coords[0]);
  const lon = Number(coords[1]);

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return [lat, lon];
}

router.post('/optimal-route', async (req, res) => {
  try {
    const { routes, currentBattery, targetBattery, vehicleId, conditions } = req.body;
    const vehicleName = req.body.vehicleName;

    if (!routes || !routes.length || !currentBattery || targetBattery === undefined || !vehicleId) {
      return res.status(400).json({ error: 'Missing required parameters' });
    }

    const routeIndex = Number.isFinite(Number(req.body.routeIndex)) ? Number(req.body.routeIndex) : 0;

    // Routes are now provided by the client (fetched from OSRM in browser)
    let routesArray = routes;

    // Lọc trùng lặp do OSRM có thể nắn hai đường về cùng 1 đường cao tốc
    const uniqueRoutes = [];
    const seenDistances = new Set();
    for (const r of routesArray) {
       const val = Math.round(r.distance / 50); // Dung sai 50m
       if (!seenDistances.has(val)) {
          seenDistances.add(val);
          uniqueRoutes.push(r);
       }
    }
    routesArray = uniqueRoutes;

    const alternativeRoutes = routesArray.map((r, index) => ({
      index,
      distanceKm: r.distance / 1000,
      polylineCoords: r.geometry.coordinates.map(coord => [coord[1], coord[0]])
    }));

    const safeRouteIndex = routeIndex < routesArray.length ? routeIndex : 0;
    const route = routesArray[safeRouteIndex];
    const totalDistanceKm = route.distance / 1000;
    const polylineCoords = route.geometry.coordinates.map(coord => [coord[1], coord[0]]);

    // 2. Fetch Vehicle & compute consumption
    const db = getDb();
    const vehicle = resolveVehicle({ vehicleId, vehicleName });
    if (!vehicle) return res.status(404).json({ error: 'Vehicle not found' });

    const { adjustedConsumptionWhKm } = estimateRange({
      batteryPercent: 100,
      batteryCapacityKwh: vehicle.battery_capacity_kwh,
      baseConsumption: vehicle.base_consumption_wh_km,
      consumptionOverride: conditions?.consumptionWhKm || null,
      temperature: conditions?.temperature || 32,
      speed: conditions?.speed || 60,
      acOn: conditions?.acOn !== undefined ? conditions.acOn : true,
    });

    const energyCapacityWh = vehicle.battery_capacity_kwh * 1000;
    const allDbStations = db.prepare('SELECT * FROM charging_stations').all();

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
    // PASS 2: SINGLE-SHOT CHARGING SUGGESTION
    // ============================================================
    // Chỉ gợi ý NHỮNG trạm sạc mà khi xe đen nơi, mức pin nằm trong
    // khoảng [targetBattery, targetBattery + 10%] và KHÔNG giả lập sạc thêm.

    const chargingStops = [];
    const optimalStations = [];
    
    const minBatteryPct = Math.max(targetBattery, 5); 
    const sweetSpotMax = minBatteryPct + 10;

    const candidateStations = allRouteStations.filter(st => st.distanceFromStartKm < totalDistanceKm);
    const matchingStations = [];

    for (const st of candidateStations) {
      const batteryNeeded = kmToBatteryPct(st.distanceFromStartKm);
      const batteryOnArrival = currentBattery - batteryNeeded;

      if (batteryOnArrival >= minBatteryPct && batteryOnArrival <= sweetSpotMax) {
        matchingStations.push({
          ...st,
          batteryAtStation: Math.round(batteryOnArrival),
          score: st.power_kw - (st.detourKm * 50) // Sort by power and proximity
        });
      }
    }

    matchingStations.sort((a, b) => b.score - a.score);

    if (matchingStations.length > 0) {
       matchingStations.forEach((st, idx) => {
         st.isOptimal = true;
         st.stopNumber = 1;
         st.isRecommended = idx === 0;
         st.alternativeIndex = idx;
         optimalStations.push(st);
       });
       chargingStops.push({ stopNumber: 1, stations: optimalStations });
    }

    if (matchingStations.length === 0) {
      const fallbackStations = candidateStations
        .map(st => {
          const batteryNeeded = kmToBatteryPct(st.distanceFromStartKm);
          const batteryOnArrival = currentBattery - batteryNeeded;
          return {
            ...st,
            batteryAtStation: Math.round(batteryOnArrival),
            sweetSpotGap: Math.abs(batteryOnArrival - sweetSpotMax),
            score: (Math.abs(batteryOnArrival - sweetSpotMax) * -10) + st.power_kw - (st.detourKm * 80),
          };
        })
        .filter(st => st.batteryAtStation >= minBatteryPct)
        .sort((a, b) => {
          if (a.sweetSpotGap !== b.sweetSpotGap) return a.sweetSpotGap - b.sweetSpotGap;
          if (a.detourKm !== b.detourKm) return a.detourKm - b.detourKm;
          return b.power_kw - a.power_kw;
        })
        .slice(0, 3);

      if (fallbackStations.length > 0) {
        fallbackStations.forEach((st, idx) => {
          st.isOptimal = true;
          st.stopNumber = 1;
          st.isRecommended = idx === 0;
          st.isFallbackSuggested = true;
          st.alternativeIndex = idx;
          optimalStations.push(st);
        });
        chargingStops.push({ stopNumber: 1, stations: optimalStations });
      }
    }

    let insufficientBattery = false;
    let emergencyStation = null;
    const canReachDestination = (currentBattery - kmToBatteryPct(totalDistanceKm)) >= minBatteryPct;
    
    if (matchingStations.length === 0 && !canReachDestination) {
        const reachableFallbackStations = candidateStations
          .map(st => {
            const batteryNeeded = kmToBatteryPct(st.distanceFromStartKm);
            const batteryOnArrival = currentBattery - batteryNeeded;
            return {
              ...st,
              batteryAtStation: Math.round(batteryOnArrival),
              score: (st.distanceFromStartKm * 6) + st.power_kw - (st.detourKm * 120),
            };
          })
          .filter(st => st.batteryAtStation >= 5)
          .sort((a, b) => b.score - a.score)
          .slice(0, 1);

        if (reachableFallbackStations.length > 0) {
          emergencyStation = {
            ...reachableFallbackStations[0],
            isEmergency: true,
          };
        }

        insufficientBattery = true;
    }

    // ============================================================
    // PASS 3: Tính toán pin cho tất cả các trạm hiển thị
    // ============================================================
    // Bỏ qua giả lập sạc, hiển thị lượng pin thực tế nếu chạy một mạch
    const displayStations = allRouteStations.map(st => {
      const batteryNeeded = kmToBatteryPct(st.distanceFromStartKm);
      const batteryAtStation = Math.round(currentBattery - batteryNeeded);
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
        alternativeRoutes,
        selectedRouteIndex: routeIndex
    });

  } catch (error) {
    console.error('Error in /optimal-route:', error.stack || error.message || error);
    res.status(500).json({ error: 'Internal server error - Route Calculation Failed', details: error.message });
  }
});

module.exports = router;

