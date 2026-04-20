const { getDb } = require('../database/init');

function normalizeVehicleName(value) {
  if (value === undefined || value === null) return '';
  return String(value).trim();
}

function resolveVehicle({ vehicleId, vehicleName }) {
  const db = getDb();

  const numericVehicleId = Number(vehicleId);
  if (Number.isFinite(numericVehicleId)) {
    const vehicleById = db.prepare('SELECT * FROM vehicles WHERE id = ?').get(numericVehicleId);
    if (vehicleById) return vehicleById;
  }

  const normalizedName = normalizeVehicleName(vehicleName);
  if (normalizedName) {
    const vehicleByName = db.prepare('SELECT * FROM vehicles WHERE name = ?').get(normalizedName);
    if (vehicleByName) return vehicleByName;
  }

  return null;
}

module.exports = { resolveVehicle };
