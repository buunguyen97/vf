const { getDb } = require('../database/init');
const { getDistanceFromLatLonInKm } = require('./routingEngine');

function getNearbyChargers(lat, lng, radiusKm = 50) {
  const db = getDb();
  // Fetch all, then filter in JS since SQLite doesn't have native geo functions
  // and we don't have Spatialite loaded for this simple MVP.
  const stations = db.prepare('SELECT * FROM charging_stations').all();
  
  const stationsWithDistance = stations.map(station => {
    const distanceKm = getDistanceFromLatLonInKm(lat, lng, station.latitude, station.longitude);
    return { ...station, distanceKm };
  }).filter(station => station.distanceKm <= radiusKm);
  
  // Sort by closest first
  stationsWithDistance.sort((a, b) => a.distanceKm - b.distanceKm);
  
  return stationsWithDistance;
}

module.exports = { getNearbyChargers };
