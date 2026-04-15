const express = require('express');
const router = express.Router();
const { getDb } = require('../database/init');
const { estimateRange } = require('../services/rangeEngine');

router.post('/check-reachability', async (req, res) => {
  try {
    const { currentLocation, destination, batteryPercent, vehicleId, temperature, speed, acOn, trafficJam, consumptionWhKm } = req.body;

    if (!currentLocation || !destination || !batteryPercent || !vehicleId) {
      return res.status(400).json({ error: 'currentLocation, destination, batteryPercent and vehicleId are required' });
    }

    const db = getDb();
    const vehicle = db.prepare('SELECT * FROM vehicles WHERE id = ?').get(vehicleId);

    if (!vehicle) {
      return res.status(404).json({ error: 'Vehicle not found' });
    }

    // 1. Calculate estimated range & consumption
    const { estimatedRangeKm, adjustedConsumptionWhKm } = estimateRange({
      batteryPercent,
      batteryCapacityKwh: vehicle.battery_capacity_kwh,
      baseConsumption: vehicle.base_consumption_wh_km,
      consumptionOverride: consumptionWhKm || null,
      temperature: temperature || 25,
      speed: speed || 60,
      acOn: acOn !== undefined ? acOn : true,
      trafficJam: trafficJam || 0,
    });

    // 2. Get REAL driving distance from OSRM
    let distanceKm;
    try {
      const osrmUrl = `http://router.project-osrm.org/route/v1/driving/${currentLocation[1]},${currentLocation[0]};${destination[1]},${destination[0]}?overview=false`;
      const osrmRes = await fetch(osrmUrl);
      const osrmData = await osrmRes.json();
      
      if (osrmData.code === 'Ok' && osrmData.routes.length > 0) {
        distanceKm = osrmData.routes[0].distance / 1000;
      } else {
        // Fallback to haversine if OSRM fails
        const { getDistanceFromLatLonInKm } = require('../services/routingEngine');
        distanceKm = getDistanceFromLatLonInKm(
          currentLocation[0], currentLocation[1],
          destination[0], destination[1]
        ) * 1.3; // Add 30% road correction factor
      }
    } catch (e) {
      const { getDistanceFromLatLonInKm } = require('../services/routingEngine');
      distanceKm = getDistanceFromLatLonInKm(
        currentLocation[0], currentLocation[1],
        destination[0], destination[1]
      ) * 1.3;
    }

    // 3. Determine if reachable
    const canReach = estimatedRangeKm >= distanceKm;
    
    // 4. Calculate remaining battery
    const energyUsedWh = distanceKm * adjustedConsumptionWhKm;
    const energyUsedKwh = energyUsedWh / 1000;
    const batteryUsedPercent = (energyUsedKwh / vehicle.battery_capacity_kwh) * 100;
    const batteryLeftPercent = Math.max(0, batteryPercent - batteryUsedPercent);

    res.json({
      canReach,
      distanceKm: Math.round(distanceKm * 10) / 10,
      estimatedRangeKm,
      batteryLeftPercent: Math.round(batteryLeftPercent)
    });

  } catch (error) {
    console.error('Error in /check-reachability:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;

