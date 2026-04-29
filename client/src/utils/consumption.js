export const DEFAULT_KM_PER_PERCENT_OFFSET = 0.2;
export const DEFAULT_KM_PER_PERCENT_LOSS_RATE = 0.065;

export function getEnergyPer1PercentWh(vehicle) {
  const batteryCapacityKwh = Number(vehicle?.battery_capacity_kwh) || 60;
  return batteryCapacityKwh * 1000 * 0.01;
}

export function getVehicleBaseConsumption(vehicle) {
  return Number(vehicle?.base_consumption_wh_km) || 150;
}

export function getDefaultKmPer1Percent(vehicle) {
  const energyPer1Percent = getEnergyPer1PercentWh(vehicle);
  const baseConsumption = getVehicleBaseConsumption(vehicle);
  const baseKmPer1Percent = energyPer1Percent / baseConsumption;
  const previousDefault = Math.max(0.5, parseFloat((baseKmPer1Percent - DEFAULT_KM_PER_PERCENT_OFFSET).toFixed(1)));
  const adjustedDefault = previousDefault * (1 - DEFAULT_KM_PER_PERCENT_LOSS_RATE);
  return Math.max(0.5, parseFloat(adjustedDefault.toFixed(1)));
}

export function getAdjustedDefaultConsumption(vehicle) {
  const energyPer1Percent = getEnergyPer1PercentWh(vehicle);
  const adjustedKmPer1Percent = getDefaultKmPer1Percent(vehicle);
  return Math.max(50, Math.min(350, Math.round(energyPer1Percent / adjustedKmPer1Percent)));
}

function softenFactor(factor = 1) {
  return 1 + ((factor - 1) / 2);
}

export function getConditionRangeLossPercent({ speed = 60, temperature = 32, acOn = true } = {}) {
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
