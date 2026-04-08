const express = require('express');
const router = express.Router();
const { getDb } = require('../database/init');
const { estimateRange } = require('../services/rangeEngine');
const { getDistanceFromLatLonInKm } = require('../services/routingEngine');

router.post('/check-reachability', (req, res) => {
  try {
    const { currentLocation, destination, batteryPercent, vehicleId, temperature, speed, acOn } = req.body;

    if (!currentLocation || !destination || !batteryPercent || !vehicleId) {
      return res.status(400).json({ error: 'currentLocation, destination, batteryPercent and vehicleId are required' });
    }

    const db = getDb();
    const vehicle = db.prepare('SELECT * FROM vehicles WHERE id = ?').get(vehicleId);

    if (!vehicle) {
      return res.status(404).json({ error: 'Vehicle not found' });
    }

    // 1. Calculate estimated range
    const { estimatedRangeKm, adjustedConsumptionWhKm } = estimateRange({
      batteryPercent,
      batteryCapacityKwh: vehicle.battery_capacity_kwh,
      baseConsumption: vehicle.base_consumption_wh_km,
      temperature: temperature || 25,
      speed: speed || 60,
      acOn: acOn !== undefined ? acOn : true
    });

    // 2. Calculate distance to destination
    const distanceKm = getDistanceFromLatLonInKm(
      currentLocation[0], currentLocation[1],
      destination[0], destination[1]
    );

    // 3. Determine if reachable
    // We already added a 10% safety buffer in estimateRange, so we just compare directly
    const canReach = estimatedRangeKm >= distanceKm;
    
    // 4. Calculate remaining battery if they make it
    // Energy used = distance * consumption (in Wh)
    const energyUsedWh = distanceKm * adjustedConsumptionWhKm;
    const energyUsedKwh = energyUsedWh / 1000;
    
    // Convert energy used to battery percentage
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
