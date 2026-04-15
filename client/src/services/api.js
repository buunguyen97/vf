import axios from 'axios';

const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:3001') + '/api';

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
    const response = await axios.post(`${API_URL}/optimal-route`, params);
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
