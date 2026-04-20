import axios from 'axios';

const API_URL = '/api';

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

  getOptimalRoute: async (params) => {
    const payload = {
      ...params,
      origin: normalizeCoordinatePair(params?.origin),
      destination: normalizeCoordinatePair(params?.destination),
      waypoint: params?.waypoint ? normalizeCoordinatePair(params.waypoint) : null,
      currentBattery: params?.currentBattery !== undefined && params?.currentBattery !== null
        ? Number(params.currentBattery)
        : params?.currentBattery,
      targetBattery: params?.targetBattery !== undefined && params?.targetBattery !== null
        ? Number(params.targetBattery)
        : params?.targetBattery,
      vehicleId: params?.vehicleId !== undefined && params?.vehicleId !== null
        ? Number(params.vehicleId)
        : params?.vehicleId,
      vehicleName: params?.vehicleName || null,
      routeIndex: params?.routeIndex !== undefined && params?.routeIndex !== null
        ? Number(params.routeIndex)
        : 0,
    };

    const response = await axios.post(`${API_URL}/optimal-route`, payload);
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
