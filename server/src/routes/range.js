const express = require('express');
const router = express.Router();
const { estimateRange } = require('../services/rangeEngine');
const { resolveVehicle } = require('../services/vehicleResolver');

router.post('/estimate-range', (req, res) => {
  try {
    const { batteryPercent, vehicleId, vehicleName, temperature, speed, acOn, consumptionWhKm } = req.body;

    if (batteryPercent === undefined || batteryPercent === null || !vehicleId) {
      return res.status(400).json({ error: 'batteryPercent and vehicleId are required' });
    }

    const vehicle = resolveVehicle({ vehicleId, vehicleName });

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
      acOn: acOn !== undefined ? acOn : true,
    });

    res.json(result);
  } catch (error) {
    console.error('Error in /estimate-range:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
