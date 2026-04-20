import axios from 'axios';

const API_URL = '/api';
const OSRM_BASE = 'https://router.project-osrm.org';

// Haversine distance (km)
function getDistance(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon/2) * Math.sin(dLon/2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

// Fetch a single OSRM route, returns route object or null
async function fetchOneRoute(coords) {
  const coordStr = coords.map(c => `${c[1]},${c[0]}`).join(';');
  const url = `${OSRM_BASE}/route/v1/driving/${coordStr}?overview=full&geometries=geojson&continue_straight=true`;
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);
    if (!res.ok) return null;
    const data = await res.json();
    if (data.code === 'Ok' && data.routes?.length > 0) return data.routes[0];
    return null;
  } catch {
    return null;
  }
}

// Fetch main route + alternative routes from OSRM (called from browser)
async function fetchOSRMRoutes(origin, destination, waypoint) {
  const mainCoords = waypoint
    ? [origin, waypoint, destination]
    : [origin, destination];

  const mainRoute = await fetchOneRoute(mainCoords);
  if (!mainRoute) {
    throw new Error('Không tìm thấy đường đi giữa hai điểm này.');
  }

  const routes = [mainRoute];

  // Generate alternative routes if no waypoint
  if (!waypoint) {
    const totalDistApprox = getDistance(origin[0], origin[1], destination[0], destination[1]);

    if (totalDistApprox > 3) {
      const midLat = (origin[0] + destination[0]) / 2;
      const midLon = (origin[1] + destination[1]) / 2;
      const dx = destination[1] - origin[1];
      const dy = destination[0] - origin[0];
      const len = Math.sqrt(dx*dx + dy*dy);

      if (len > 0) {
        const nx = -dy / len;
        const ny = dx / len;
        const shiftKm = Math.min(totalDistApprox * 0.2, 30);
        const shiftDeg = shiftKm / 111.0;

        const leftWp = [midLat + ny * shiftDeg, midLon + nx * shiftDeg];
        const rightWp = [midLat - ny * shiftDeg, midLon - nx * shiftDeg];

        const [leftRoute, rightRoute] = await Promise.all([
          fetchOneRoute([origin, leftWp, destination]),
          fetchOneRoute([origin, rightWp, destination]),
        ]);

        if (leftRoute && leftRoute.distance < mainRoute.distance * 1.35) {
          routes.push(leftRoute);
        }
        if (rightRoute && rightRoute.distance < mainRoute.distance * 1.35) {
          routes.push(rightRoute);
        }
      }
    }
  }

  return routes;
}

const normalizeCoordinatePair = (coords) => {
  if (!Array.isArray(coords) || coords.length < 2) return null;

  const lat = Number(coords[0]);
  const lng = Number(coords[1]);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return [lat, lng];
};

export const evApi = {
  getVehicles: async () => {
    const response = await axios.get(`${API_URL}/vehicles`);
    return response.data;
  },
  
  estimateRange: async (params) => {
    const response = await axios.post(`${API_URL}/estimate-range`, params);
    return response.data;
  },
  
  getChargers: async (lat, lng, radius = 50) => {
    const response = await axios.get(`${API_URL}/nearby-chargers`, {
      params: { lat, lng, radius }
    });
    return response.data;
  },
  
  checkReachability: async (params) => {
    const response = await axios.post(`${API_URL}/check-reachability`, params);
    return response.data;
  },

  // Step 1: Fetch routes from OSRM (browser-side, no IP blocking)
  // Step 2: Send only essential data to server for battery/station calculations
  getOptimalRoute: async (params) => {
    const { origin, destination, waypoint, ...serverParams } = params;

    // Fetch routes from OSRM directly in browser
    const rawRoutes = await fetchOSRMRoutes(origin, destination, waypoint);

    // Strip to only what server needs: distance + coordinates (reduced precision)
    const routes = rawRoutes.map(r => ({
      distance: r.distance,
      geometry: {
        coordinates: r.geometry.coordinates.map(c => [
          Math.round(c[0] * 100000) / 100000,  // ~1m precision, saves bytes
          Math.round(c[1] * 100000) / 100000,
        ]),
      },
    }));

    // Send pre-fetched routes to server for station/battery analysis
    const response = await axios.post(`${API_URL}/optimal-route`, {
      ...serverParams,
      routes,
    });
    return response.data;
  },

  searchLocation: async (query) => {
    const res = await axios.get(`${API_URL}/search-location`, {
      params: { q: query }
    });
    return res.data;
  },

  getNearbyAmenities: async (lat, lng, radius = 500) => {
    const res = await axios.get(`${API_URL}/nearby-amenities`, {
      params: { lat, lng, radius }
    });
    return res.data;
  },

  parseGoogleMapsLink: async (url) => {
    const response = await axios.post(`${API_URL}/parse-google-maps-link`, { url });
    return response.data;
  }
};
