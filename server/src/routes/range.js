const express = require('express');
const router = express.Router();
const { getDb } = require('../database/init');
const { estimateRange } = require('../services/rangeEngine');

router.post('/estimate-range', (req, res) => {
  try {
    const { batteryPercent, vehicleId, temperature, speed, acOn, consumptionWhKm } = req.body;

    if (batteryPercent === undefined || batteryPercent === null || !vehicleId) {
      return res.status(400).json({ error: 'batteryPercent and vehicleId are required' });
    }

    const db = getDb();
    const vehicle = db.prepare('SELECT * FROM vehicles WHERE id = ?').get(vehicleId);

    if (!vehicle) {
      return res.status(404).json({ error: 'Vehicle not found' });
    }

    const result = estimateRange({
      batteryPercent,
      batteryCapacityKwh: vehicle.battery_capacity_kwh,
      baseConsumption: vehicle.base_consumption_wh_km,
      consumptionOverride: consumptionWhKm || null,
      temperature: temperature || 25,
      speed: speed || 60,
      acOn: acOn !== undefined ? acOn : true
    });

    res.json(result);
  } catch (error) {
    console.error('Error in /estimate-range:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
