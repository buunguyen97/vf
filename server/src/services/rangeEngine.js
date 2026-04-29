/**
 * EV Range Estimation Engine
 *
 * Uses real-world data on how temperature, AC, and speed affect EV consumption.
 */

function softenFactor(factor = 1) {
  return 1 + ((factor - 1) / 2);
}

function getConditionRangeLossPercent({ speed = 60, temperature = 32, acOn = true } = {}) {
  let speedFactor = 1.0;
  if (speed <= 70) speedFactor = 1.0;
  else if (speed <= 80) speedFactor = 1.05;
  else if (speed <= 90) speedFactor = 1.12;
  else if (speed <= 100) speedFactor = 1.2;
  else if (speed <= 110) speedFactor = 1.3;
  else speedFactor = 1.4;

  let tempFactor = 1.0;
  if (temperature >= 20 && temperature <= 30) tempFactor = 1.0;
  else if (temperature >= 31 && temperature <= 35) tempFactor = 1.05;
  else if (temperature > 35) tempFactor = 1.1;
  else if (temperature >= 10 && temperature <= 19) tempFactor = 1.08;
  else tempFactor = 1.15;

  const acFactor = acOn ? 1.05 : 1.0;
  const lossPercent = ((softenFactor(speedFactor) * softenFactor(tempFactor) * acFactor) - 1) * 100 / 2.5;

  return Math.max(0, Number(lossPercent.toFixed(1)));
}

function estimateRange({
  batteryPercent,
  batteryCapacityKwh,
  baseConsumption,
  consumptionOverride,
  temperature,
  speed,
  acOn,
}) {
  let consumption = consumptionOverride || baseConsumption;
  const lossPercent = getConditionRangeLossPercent({ speed, temperature, acOn });
  const kmPerPercentMultiplier = Math.max(0.1, 1 - (lossPercent / 100));
  consumption /= kmPerPercentMultiplier;

  const availableEnergy = (batteryPercent / 100) * batteryCapacityKwh * 1000;
  const safeAvailableEnergy = availableEnergy * 0.9;
  const estimatedRangeKm = safeAvailableEnergy / consumption;

  return {
    estimatedRangeKm: Math.max(0, Math.round(estimatedRangeKm)),
    adjustedConsumptionWhKm: Math.round(consumption),
    conditionRangeLossPercent: lossPercent,
  };
}

module.exports = { estimateRange, getConditionRangeLossPercent };
