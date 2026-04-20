const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, 'vinfast.db');

let db;

function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    initTables();
    normalizeTables();
  }
  return db;
}

function initTables() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS vehicles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      display_name TEXT NOT NULL,
      battery_capacity_kwh REAL NOT NULL,
      base_consumption_wh_km REAL NOT NULL,
      wltp_range_km INTEGER,
      image_url TEXT
    );

    CREATE TABLE IF NOT EXISTS charging_stations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      address TEXT,
      latitude REAL NOT NULL,
      longitude REAL NOT NULL,
      power_kw INTEGER DEFAULT 150,
      connector_type TEXT DEFAULT 'CCS2',
      status TEXT DEFAULT 'available',
      city TEXT
    );
  `);
}

function normalizeTables() {
  db.exec(`
    DELETE FROM charging_stations
    WHERE id NOT IN (
      SELECT MIN(id)
      FROM charging_stations
      GROUP BY name, latitude, longitude, power_kw
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_charging_stations_unique
    ON charging_stations (name, latitude, longitude, power_kw);
  `);
}

function closeDb() {
  if (db) {
    db.close();
    db = null;
  }
}

module.exports = { getDb, closeDb };
