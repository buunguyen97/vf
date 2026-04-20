const express = require('express');
const router = express.Router();
const { estimateRange } = require('../services/rangeEngine');
const { resolveVehicle } = require('../services/vehicleResolver');

function normalizeCoordinatePair(coords) {
  if (!Array.isArray(coords) || coords.length < 2) return null;

  const lat = Number(coords[0]);
  const lng = Number(coords[1]);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return [lat, lng];
}

router.post('/check-reachability', async (req, res) => {
  try {
    const currentLocation = normalizeCoordinatePair(req.body.currentLocation);
    const destination = normalizeCoordinatePair(req.body.destination);
    const batteryPercent = Number(req.body.batteryPercent);
    const targetBattery = Number(req.body.targetBattery);
    const vehicleId = Number(req.body.vehicleId);
    const vehicleName = req.body.vehicleName;
    const temperature = Number(req.body.temperature);
    const speed = Number(req.body.speed);
    const acOn = req.body.acOn;
    const consumptionWhKm = req.body.consumptionWhKm;

    if (!currentLocation || !destination || !Number.isFinite(batteryPercent) || !Number.isFinite(vehicleId)) {
      return res.status(400).json({ error: 'currentLocation, destination, batteryPercent and vehicleId are required' });
    }

    const vehicle = resolveVehicle({ vehicleId, vehicleName });

    if (!vehicle) {
      return res.status(404).json({ error: 'Vehicle not found' });
    }

    // 1. Calculate estimated range & consumption
    const { estimatedRangeKm, adjustedConsumptionWhKm } = estimateRange({
      batteryPercent,
      batteryCapacityKwh: vehicle.battery_capacity_kwh,
      baseConsumption: vehicle.base_consumption_wh_km,
      consumptionOverride: consumptionWhKm || null,
      temperature: Number.isFinite(temperature) ? temperature : 25,
      speed: Number.isFinite(speed) ? speed : 60,
      acOn: acOn !== undefined ? acOn : true,
    });

    // 2. Get REAL driving distance from OSRM
    let distanceKm;
    let polylineCoords = null;
    try {
      const osrmUrl = `http://router.project-osrm.org/route/v1/driving/${currentLocation[1]},${currentLocation[0]};${destination[1]},${destination[0]}?overview=full&geometries=geojson`;
      const osrmRes = await fetch(osrmUrl);
      const osrmData = await osrmRes.json();
      
      if (osrmData.code === 'Ok' && osrmData.routes.length > 0) {
        const primaryRoute = osrmData.routes[0];
        distanceKm = primaryRoute.distance / 1000;
        polylineCoords = primaryRoute.geometry?.coordinates?.map((coord) => [coord[1], coord[0]]) || null;
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
    const minBatteryPercent = Math.max(Number.isFinite(targetBattery) ? targetBattery : 0, 5);
    
    // 4. Calculate remaining battery
    const energyUsedWh = distanceKm * adjustedConsumptionWhKm;
    const energyUsedKwh = energyUsedWh / 1000;
    const batteryUsedPercent = (energyUsedKwh / vehicle.battery_capacity_kwh) * 100;
    const batteryLeftPercent = Math.max(0, batteryPercent - batteryUsedPercent);
    const canReach = batteryLeftPercent >= minBatteryPercent;

    res.json({
      canReach,
      distanceKm: Math.round(distanceKm * 10) / 10,
      estimatedRangeKm,
      batteryLeftPercent: Math.round(batteryLeftPercent),
      minBatteryPercent,
      polylineCoords,
    });

  } catch (error) {
    console.error('Error in /check-reachability:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;

