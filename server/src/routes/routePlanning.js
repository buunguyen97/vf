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

    // 2. Fetch Vehicle
    const db = getDb();
    const vehicle = db.prepare('SELECT * FROM vehicles WHERE id = ?').get(vehicleId);
    if (!vehicle) return res.status(404).json({ error: 'Vehicle not found' });

    // Use rangeEngine to get consumption (Wh/km)
    const { adjustedConsumptionWhKm } = estimateRange({
      batteryPercent: 100,
      batteryCapacityKwh: vehicle.battery_capacity_kwh,
      baseConsumption: vehicle.base_consumption_wh_km,
      temperature: conditions?.temperature || 32,
      speed: conditions?.speed || 60,
      acOn: conditions?.acOn !== undefined ? conditions.acOn : true
    });

    const energyCapacityWh = vehicle.battery_capacity_kwh * 1000;
    const stations = db.prepare('SELECT * FROM charging_stations').all();
    
    const optimalStations = [];
    const allRouteStations = [];
    const rejectedStationIds = new Set(); // Prevent checking same trapped station again

    // Helper: Distance between two points
    function getDistance(lat1, lon1, lat2, lon2) {
      const R = 6371;
      const dLat = (lat2 - lat1) * Math.PI / 180;
      const dLon = (lon2 - lon1) * Math.PI / 180;
      const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon/2) * Math.sin(dLon/2);
      return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    }

    let currentDistance = 0;
    let simulatedBattery = currentBattery;
    let lastChargingDistance = 0;
    
    const targetHigh = targetBattery + 15; // Slightly wider window to catch stations
    const targetLow = targetBattery;

    // Simulate Driving
    let skipUntilDistance = 0;

    for (let i = 0; i < polylineCoords.length - 1; i++) {
        const p1 = polylineCoords[i];
        const p2 = polylineCoords[i+1];
        const segmentDist = getDistance(p1[0], p1[1], p2[0], p2[1]);
        currentDistance += segmentDist;
        
        // Skip iterations if we recently found a charger to avoid finding multiple in same cluster
        if (currentDistance < skipUntilDistance) {
            simulatedBattery -= (segmentDist * adjustedConsumptionWhKm / energyCapacityWh * 100);
            continue;
        }

        const batteryPctLoss = (segmentDist * adjustedConsumptionWhKm) / energyCapacityWh * 100;
        simulatedBattery -= batteryPctLoss;
        
        // Collect ALL stations near the route exactly when passing by them
        if (i % 20 === 0 || i === polylineCoords.length - 2) {
            for (const st of stations) {
                if (allRouteStations.find(s => s.id === st.id)) continue;

                const distToStation = getDistance(p1[0], p1[1], st.latitude, st.longitude);
                // Allow up to 10km search radius so we don't miss highway stops
                if (distToStation <= 10) { 
                    const stationObj = { 
                        ...st, 
                        distanceFromStartKm: currentDistance + distToStation,
                        batteryAtStation: Math.round(simulatedBattery - (distToStation * adjustedConsumptionWhKm / energyCapacityWh * 100))
                    };
                    
                    if(stationObj.batteryAtStation > 0) {
                        allRouteStations.push(stationObj);
                    }
                }
            }
        }
        
        // Check Optimal Charing Zones
        if (simulatedBattery <= targetHigh && simulatedBattery >= 0) {
            // Find BEST station nearby
            let bestStation = null;
            let bestDist = Infinity;
            
            for (const st of stations) {
                if (optimalStations.find(s => s.id === st.id)) continue;
                if (rejectedStationIds.has(st.id)) continue;
                
                const distToStation = getDistance(p1[0], p1[1], st.latitude, st.longitude);
                // Expand radius to 3km, but we will verify actual DRIVING distance
                if (distToStation <= 3.0 && distToStation < bestDist) {
                    bestDist = distToStation;
                    bestStation = st;
                }
            }
            
            if (bestStation) {
                // VERIFICATION: Check real driving distance to prevent Highway Traps!
                try {
                    const verifyUrl = `http://router.project-osrm.org/route/v1/driving/${p1[1]},${p1[0]};${bestStation.longitude},${bestStation.latitude}?overview=false`;
                    const verifyRes = await fetch(verifyUrl);
                    if (verifyRes.ok) {
                        const verifyData = await verifyRes.json();
                        if (verifyData.code === 'Ok' && verifyData.routes.length > 0) {
                            const realDrivingDistKm = verifyData.routes[0].distance / 1000;
                            // If driving distance is > 5km, it means we are on a highway with no exit nearby!
                            if (realDrivingDistKm > 5) {
                                rejectedStationIds.add(bestStation.id);
                                bestStation = null; // Reject and continue searching next loop natively
                            } else {
                                bestDist = realDrivingDistKm; // Update with accurate consumption driving distance
                            }
                        }
                    }
                } catch(e) {
                   console.error("Verification failed", e);
                }

                if (bestStation) {
                    const stationExpectedBattery = Math.round(simulatedBattery - (bestDist * adjustedConsumptionWhKm / energyCapacityWh * 100));
                    
                    if (stationExpectedBattery > 0) {
                        const finalSt = {
                            ...bestStation,
                            batteryAtStation: stationExpectedBattery,
                            isOptimal: true
                        };
                        optimalStations.push(finalSt);
                        
                        // RECHARGE ASSUMPTION
                        // User charges to 90%
                        simulatedBattery = 90;
                        lastChargingDistance = currentDistance;
                        skipUntilDistance = currentDistance + 50; // Skip next 50km
                    }
                }
            }
        }
        
        // Critical safeguard (if we drop below 0, reset just to keep simulation alive)
        if (simulatedBattery <= 0) {
            simulatedBattery = 80;
            skipUntilDistance = currentDistance + 10;
        }
    }

    res.json({
        totalDistanceKm: Math.round(totalDistanceKm),
        polylineCoords,
        allRouteStations,
        optimalStations
    });

  } catch (error) {
    console.error('Error in /optimal-route:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
