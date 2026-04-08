// This is a simple implementation using the Haversine formula for distance.
// In a full production app, you would integrate OSRM or Google Maps Directions API here.

function getDistanceFromLatLonInKm(lat1, lon1, lat2, lon2) {
  const R = 6371; // Radius of the earth in km
  const dLat = deg2rad(lat2 - lat1);  // deg2rad below
  const dLon = deg2rad(lon2 - lon1); 
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) * 
    Math.sin(dLon/2) * Math.sin(dLon/2)
    ; 
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); 
  const d = R * c; // Distance in km
  
  // Multiply by 1.3 to estimate driving distance vs straight line
  return d * 1.3;
}

function deg2rad(deg) {
  return deg * (Math.PI/180);
}

module.exports = { getDistanceFromLatLonInKm };
