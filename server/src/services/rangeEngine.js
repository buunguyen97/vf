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

function softenFactor(factor = 1) {
  return 1 + ((factor - 1) / 2);
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
  let temperatureFactor = 1;
  let speedFactor = 1;

  if (acOn) {
    if (temperature >= 40) {
      temperatureFactor = 1.1;
    } else if (temperature >= 35) {
      temperatureFactor = 1.075;
    } else if (temperature >= 30) {
      temperatureFactor = 1.04;
    } else if (temperature >= 25) {
      temperatureFactor = 1.015;
    } else if (temperature >= 15) {
      temperatureFactor = 1.005;
    } else if (temperature >= 5) {
      temperatureFactor = 1.125;
    } else if (temperature >= -5) {
      temperatureFactor = 1.175;
    } else {
      temperatureFactor = 1.225;
    }
  } else if (temperature >= 40) {
    temperatureFactor = 1.04;
  } else if (temperature >= 35) {
    temperatureFactor = 1.025;
  } else if (temperature >= 15 && temperature <= 30) {
    temperatureFactor = 1.0;
  } else if (temperature >= 5) {
    temperatureFactor = 1.05;
  } else if (temperature >= -5) {
    temperatureFactor = 1.1;
  } else {
    temperatureFactor = 1.15;
  }

  if (speed >= 120) {
    speedFactor = 1.175;
  } else if (speed >= 100) {
    speedFactor = 1.11;
  } else if (speed >= 80) {
    speedFactor = 1.05;
  } else if (speed >= 60) {
    speedFactor = 1.0;
  } else if (speed >= 40) {
    speedFactor = 0.975;
  } else {
    speedFactor = 0.96;
  }

  consumption *= softenFactor(temperatureFactor);
  consumption *= softenFactor(speedFactor);

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
