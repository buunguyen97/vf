/**
 * EV Range Estimation Engine
 *
 * Uses real-world data on how temperature, AC, speed, and traffic affect EV consumption.
 */

function getTrafficJamPenaltyPercent(trafficJamMinutes = 0) {
  switch (trafficJamMinutes) {
    case 15:
      return 0.5;
    case 30:
      return 1;
    case 45:
      return 1.5;
    case 60:
      return 2;
    default:
      return 0;
  }
}

function estimateRange({
  batteryPercent,
  batteryCapacityKwh,
  baseConsumption,
  consumptionOverride,
  temperature,
  speed,
  acOn,
  trafficJam,
}) {
  let consumption = consumptionOverride || baseConsumption;

  if (acOn) {
    if (temperature >= 40) {
      consumption *= 1.2;
    } else if (temperature >= 35) {
      consumption *= 1.15;
    } else if (temperature >= 30) {
      consumption *= 1.08;
    } else if (temperature >= 25) {
      consumption *= 1.03;
    } else if (temperature >= 15) {
      consumption *= 1.01;
    } else if (temperature >= 5) {
      consumption *= 1.25;
    } else if (temperature >= -5) {
      consumption *= 1.35;
    } else {
      consumption *= 1.45;
    }
  } else if (temperature >= 40) {
    consumption *= 1.08;
  } else if (temperature >= 35) {
    consumption *= 1.05;
  } else if (temperature >= 15 && temperature <= 30) {
    consumption *= 1.0;
  } else if (temperature >= 5) {
    consumption *= 1.1;
  } else if (temperature >= -5) {
    consumption *= 1.2;
  } else {
    consumption *= 1.3;
  }

  if (speed >= 120) {
    consumption *= 1.35;
  } else if (speed >= 100) {
    consumption *= 1.22;
  } else if (speed >= 80) {
    consumption *= 1.1;
  } else if (speed >= 60) {
    consumption *= 1.0;
  } else if (speed >= 40) {
    consumption *= 0.95;
  } else {
    consumption *= 0.92;
  }

  const trafficJamPenaltyPercent = getTrafficJamPenaltyPercent(trafficJam);
  consumption *= 1 + trafficJamPenaltyPercent / 100;

  const availableEnergy = (batteryPercent / 100) * batteryCapacityKwh * 1000;
  const safeAvailableEnergy = availableEnergy * 0.9;
  const estimatedRangeKm = safeAvailableEnergy / consumption;

  return {
    estimatedRangeKm: Math.max(0, Math.round(estimatedRangeKm)),
    adjustedConsumptionWhKm: Math.round(consumption),
    trafficJamPenaltyPercent,
  };
}

module.exports = { estimateRange, getTrafficJamPenaltyPercent };
