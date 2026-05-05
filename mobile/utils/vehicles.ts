export const VEHICLE_ORDER = [
  'VF3',
  'VF5',
  'VFe34',
  'VF6_Eco',
  'VF6',
  'VF7_Eco',
  'VF7',
  'VF8_Eco',
  'VF8_Plus',
  'VF9_Eco',
  'VF9_Plus',
  'Minio_Green',
  'Herio_Green',
  'Nerio_Green',
  'Limo_Green',
  'EC_Van',
];

export function getVehicleOrder(vehicle: any) {
  const index = VEHICLE_ORDER.indexOf(vehicle?.name);
  return index === -1 ? VEHICLE_ORDER.length : index;
}

export function sortVehiclesByVinFastOrder(vehicles: any[] = []) {
  return [...vehicles].sort((a: any, b: any) => {
    const orderDiff = getVehicleOrder(a) - getVehicleOrder(b);
    if (orderDiff !== 0) return orderDiff;
    return (a.display_name || a.name || '').localeCompare(b.display_name || b.name || '', 'vi');
  });
}
