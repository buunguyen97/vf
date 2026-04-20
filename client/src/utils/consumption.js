export const DEFAULT_KM_PER_PERCENT_OFFSET = 0.2;

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
  return Math.max(0.5, parseFloat((baseKmPer1Percent - DEFAULT_KM_PER_PERCENT_OFFSET).toFixed(1)));
}

export function getAdjustedDefaultConsumption(vehicle) {
  const energyPer1Percent = getEnergyPer1PercentWh(vehicle);
  const adjustedKmPer1Percent = getDefaultKmPer1Percent(vehicle);
  return Math.max(50, Math.min(350, Math.round(energyPer1Percent / adjustedKmPer1Percent)));
}
