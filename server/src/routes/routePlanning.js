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

function getNearestPointOnSegment(pointLat, pointLon, start, end) {
  const refLatRad = ((pointLat + start[0] + end[0]) / 3) * Math.PI / 180;
  const lonScale = 111.32 * Math.cos(refLatRad);
  const latScale = 110.574;

  const px = pointLon * lonScale;
  const py = pointLat * latScale;
  const ax = start[1] * lonScale;
  const ay = start[0] * latScale;
  const bx = end[1] * lonScale;
  const by = end[0] * latScale;

  const dx = bx - ax;
  const dy = by - ay;
  const lengthSquared = (dx * dx) + (dy * dy);
  const fraction = lengthSquared === 0
    ? 0
    : Math.max(0, Math.min(1, (((px - ax) * dx) + ((py - ay) * dy)) / lengthSquared));

  const nearestX = ax + (dx * fraction);
  const nearestY = ay + (dy * fraction);
  const nearestLat = nearestY / latScale;
  const nearestLon = nearestX / lonScale;
  const distanceKm = getDistance(pointLat, pointLon, nearestLat, nearestLon);

  return {
    latitude: nearestLat,
    longitude: nearestLon,
    distanceKm,
    fraction,
  };
}

function getRouteSideDisplayPoint(station, nearestRoutePoint, maxOffsetKm = 0.12) {
  if (!nearestRoutePoint.distanceKm) {
    return {
      latitude: nearestRoutePoint.latitude,
      longitude: nearestRoutePoint.longitude,
    };
  }

  // Show markers just off the route, toward the real station coordinate. This
  // keeps the marker visually tied to the route without flipping to the wrong
  // side of nearby/parallel roads.
  const offsetRatio = Math.min(1, maxOffsetKm / nearestRoutePoint.distanceKm);
  return {
    latitude: nearestRoutePoint.latitude + ((station.latitude - nearestRoutePoint.latitude) * offsetRatio),
    longitude: nearestRoutePoint.longitude + ((station.longitude - nearestRoutePoint.longitude) * offsetRatio),
  };
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
    const stationsById = new Map();
    let cumulativeDistance = 0;

    // Tight radius: only stations genuinely on/adjacent to the route
    // On highways, even 2-3km straight-line can mean a completely different road
    const MAX_DETOUR_KM = 1; // Only stations within 1km of route

    for (let i = 0; i < polylineCoords.length - 1; i++) {
      const p1 = polylineCoords[i];
      const p2 = polylineCoords[i + 1];
      const segDist = getDistance(p1[0], p1[1], p2[0], p2[1]);
      const segmentStartDistance = cumulativeDistance;

      // Snap marker display coordinates onto the selected route, but keep
      // station latitude/longitude untouched for navigation.
      for (const st of allDbStations) {
        const nearestRoutePoint = getNearestPointOnSegment(st.latitude, st.longitude, p1, p2);
        if (nearestRoutePoint.distanceKm <= MAX_DETOUR_KM) {
          const previousMatch = stationsById.get(st.id);
          if (previousMatch && previousMatch.detourKmRaw <= nearestRoutePoint.distanceKm) continue;
          const displayPoint = getRouteSideDisplayPoint(st, nearestRoutePoint);

          stationsById.set(st.id, {
            ...st,
            displayLatitude: displayPoint.latitude,
            displayLongitude: displayPoint.longitude,
            distanceFromStartKm: Math.round((segmentStartDistance + (segDist * nearestRoutePoint.fraction)) * 10) / 10,
            detourKm: Math.round(nearestRoutePoint.distanceKm * 1000) / 1000, // Precise to meter
            detourKmRaw: nearestRoutePoint.distanceKm,
          });
        }
      }

      cumulativeDistance += segDist;
    }

    allRouteStations.push(...stationsById.values());

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
    const enrichedCandidateStations = candidateStations.map(st => {
      const batteryNeeded = kmToBatteryPct(st.distanceFromStartKm);
      const batteryOnArrival = currentBattery - batteryNeeded;
      const batteryAtStation = Math.round(batteryOnArrival);
      const sweetSpotGap = batteryAtStation < minBatteryPct
        ? minBatteryPct - batteryAtStation
        : Math.max(0, batteryAtStation - sweetSpotMax);

      return {
        ...st,
        batteryAtStation,
        batteryAtStationRaw: batteryOnArrival,
        sweetSpotGap,
        isInTargetBatteryBand: batteryAtStation >= minBatteryPct && batteryAtStation <= sweetSpotMax,
        score: st.power_kw - (st.detourKm * 50),
      };
    });

    const matchingStations = enrichedCandidateStations.filter(st => st.isInTargetBatteryBand);

    const suggestedStations = enrichedCandidateStations
      .filter(st => st.batteryAtStation >= minBatteryPct)
      .sort((a, b) => {
        if (a.sweetSpotGap !== b.sweetSpotGap) return a.sweetSpotGap - b.sweetSpotGap;
        if (a.isInTargetBatteryBand !== b.isInTargetBatteryBand) return a.isInTargetBatteryBand ? -1 : 1;
        if (a.detourKm !== b.detourKm) return a.detourKm - b.detourKm;
        return b.power_kw - a.power_kw;
      })
      .slice(0, 3);

    if (suggestedStations.length > 0) {
      suggestedStations.forEach((st, idx) => {
        st.isOptimal = true;
        st.stopNumber = 1;
        st.isRecommended = idx === 0;
        st.isFallbackSuggested = !st.isInTargetBatteryBand;
        st.isSuggested = true;
        st.alternativeIndex = idx;
        optimalStations.push(st);
      });
      chargingStops.push({ stopNumber: 1, stations: suggestedStations });
    }

    let insufficientBattery = false;
    let emergencyStation = null;
    const canReachDestination = (currentBattery - kmToBatteryPct(totalDistanceKm)) >= minBatteryPct;
    
    if (matchingStations.length === 0 && !canReachDestination) {
        const reachableFallbackStations = enrichedCandidateStations
          .filter(st => st.batteryAtStation >= 5)
          .sort((a, b) => (
            (b.distanceFromStartKm * 6) + b.power_kw - (b.detourKm * 120)
          ) - (
            (a.distanceFromStartKm * 6) + a.power_kw - (a.detourKm * 120)
          ))
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
    const getStationKey = (st) => {
      if (st?.id !== undefined && st?.id !== null) return String(st.id);
      return `${Number(st?.latitude).toFixed(5)},${Number(st?.longitude).toFixed(5)}`;
    };
    const suggestedStationsByKey = new Map(optimalStations.map(st => [getStationKey(st), st]));

    const displayStations = allRouteStations.map(st => {
      const batteryNeeded = kmToBatteryPct(st.distanceFromStartKm);
      const batteryAtStationRaw = currentBattery - batteryNeeded;
      const batteryAtStation = Math.round(batteryAtStationRaw);
      const suggestedStation = suggestedStationsByKey.get(getStationKey(st));

      return {
        ...st,
        batteryAtStation,
        batteryAtStationRaw,
        isInTargetBatteryBand: batteryAtStation >= minBatteryPct && batteryAtStation <= sweetSpotMax,
        isSuggested: Boolean(suggestedStation),
        isFallbackSuggested: Boolean(suggestedStation?.isFallbackSuggested),
        isRecommended: Boolean(suggestedStation?.isRecommended),
        isOptimal: Boolean(suggestedStation?.isOptimal),
        stopNumber: suggestedStation?.stopNumber,
        alternativeIndex: suggestedStation?.alternativeIndex,
      };
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

