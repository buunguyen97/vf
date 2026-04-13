function estimateRange({ batteryPercent, batteryCapacityKwh, baseConsumption, consumptionOverride, temperature, speed, acOn }) {
  // Use user-provided consumption if available, otherwise fall back to vehicle default
  let consumption = consumptionOverride || baseConsumption; // Wh/km
  
  // Temperature adjustment
  if (temperature > 35) {
    consumption *= 1.10; // +10%
  } else if (temperature < 10) {
    consumption *= 1.15; // +15% (cold weather impacts battery more)
  }
  
  // AC adjustment
  if (acOn) {
    consumption *= 1.05; // +5%
  }
  
  // Speed adjustment (highway driving uses more energy)
  if (speed > 100) {
    consumption *= 1.25; // +25%
  } else if (speed > 80) {
    consumption *= 1.15; // +15%
  }
  
  // Available energy in Watt-hours
  const availableEnergy = (batteryPercent / 100) * batteryCapacityKwh * 1000;
  
  // Implement a 10% safety buffer so users don't completely drain
  const safeAvailableEnergy = availableEnergy * 0.90;
  
  const estimatedRangeKm = safeAvailableEnergy / consumption;
  
  return {
    estimatedRangeKm: Math.max(0, Math.round(estimatedRangeKm)),
    adjustedConsumptionWhKm: Math.round(consumption)
  };
}

module.exports = { estimateRange };
