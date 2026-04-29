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

const VIETNAM_MIN_LON_BY_LAT = [
  [8.3, 104.4],
  [10.4, 104.45],
  [11.2, 105.55],
  [12.2, 106.4],
  [13.4, 107.05],
  [15.3, 107.1],
  [16.6, 106.0],
  [18.2, 104.6],
  [19.5, 103.5],
  [21.0, 102.2],
  [22.8, 102.0],
  [23.6, 103.0],
];

const VIETNAM_ROUTE_CORRIDORS = [
  // Coastal / QL1A spine, safest for long north-south routes.
  [
    [10.933, 108.100], // Phan Thiet
    [11.565, 108.991], // Phan Rang
    [12.239, 109.197], // Nha Trang
    [13.782, 109.219], // Quy Nhon
    [15.121, 108.804], // Quang Ngai
    [16.047, 108.206], // Da Nang
    [17.468, 106.622], // Dong Hoi
    [18.679, 105.681], // Vinh
    [20.253, 105.975], // Ninh Binh
  ],
  // Inland Vietnam corridor, useful when the coastal route is not ideal.
  [
    [11.535, 106.891], // Dong Xoai
    [12.667, 108.038], // Buon Ma Thuot
    [13.984, 108.000], // Pleiku
    [14.350, 108.000], // Kon Tum
    [16.047, 108.206], // Da Nang
    [17.468, 106.622], // Dong Hoi
    [18.679, 105.681], // Vinh
    [20.253, 105.975], // Ninh Binh
  ],
  // North-central inland corridor.
  [
    [11.535, 106.891],
    [12.667, 108.038],
    [13.984, 108.000],
    [16.463, 107.590], // Hue
    [18.679, 105.681],
    [19.807, 105.776], // Thanh Hoa
    [20.253, 105.975],
  ],
];

function interpolateMinVietnamLon(lat) {
  const points = VIETNAM_MIN_LON_BY_LAT;
  if (lat <= points[0][0]) return points[0][1];
  if (lat >= points[points.length - 1][0]) return points[points.length - 1][1];

  for (let i = 0; i < points.length - 1; i++) {
    const [latA, lonA] = points[i];
    const [latB, lonB] = points[i + 1];
    if (lat >= latA && lat <= latB) {
      const ratio = (lat - latA) / (latB - latA);
      return lonA + ((lonB - lonA) * ratio);
    }
  }

  return 104;
}

function isLikelyVietnamDrivingPoint([lon, lat]) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;
  if (lat < 8.2 || lat > 23.7 || lon < 102.0 || lon > 110.1) return false;

  // OSRM has no "avoid countries" option. This approximates Vietnam's west
  // border enough to reject obvious Cambodia/Laos detours while allowing
  // normal roads near border provinces.
  return lon >= interpolateMinVietnamLon(lat) - 0.28;
}

function getForeignRouteRatio(route) {
  const coords = route?.geometry?.coordinates || [];
  if (!coords.length) return 1;

  const step = Math.max(1, Math.floor(coords.length / 500));
  let checked = 0;
  let foreign = 0;

  for (let i = 0; i < coords.length; i += step) {
    checked += 1;
    if (!isLikelyVietnamDrivingPoint(coords[i])) {
      foreign += 1;
    }
  }

  return checked ? foreign / checked : 1;
}

function isVietnamOnlyRoute(route) {
  return getForeignRouteRatio(route) <= 0.025;
}

function selectCorridorWaypoints(corridor, from, to) {
  const latDirection = to[0] >= from[0] ? 1 : -1;
  const minLat = Math.min(from[0], to[0]) - 0.25;
  const maxLat = Math.max(from[0], to[0]) + 0.25;

  return corridor
    .filter((point) => (
      point[0] >= minLat &&
      point[0] <= maxLat &&
      getDistance(from[0], from[1], point[0], point[1]) > 25 &&
      getDistance(to[0], to[1], point[0], point[1]) > 25
    ))
    .sort((a, b) => latDirection * (a[0] - b[0]));
}

function buildCorridorRouteCoords(origin, destination, waypoint, corridor) {
  const anchors = waypoint ? [origin, waypoint, destination] : [origin, destination];
  const coords = [origin];

  for (let i = 0; i < anchors.length - 1; i++) {
    const from = anchors[i];
    const to = anchors[i + 1];
    const waypoints = selectCorridorWaypoints(corridor, from, to);

    waypoints.forEach((point) => {
      const last = coords[coords.length - 1];
      if (getDistance(last[0], last[1], point[0], point[1]) > 8) {
        coords.push(point);
      }
    });

    coords.push(to);
  }

  return coords;
}

function addUniqueRoute(routes, route) {
  if (!route || !isVietnamOnlyRoute(route)) return;

  const isDuplicate = routes.some((existing) => (
    Math.abs(existing.distance - route.distance) < 5000
  ));
  if (!isDuplicate) routes.push(route);
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

async function fetchVietnamCorridorRoutes(origin, destination, waypoint) {
  const candidates = await Promise.all(
    VIETNAM_ROUTE_CORRIDORS.map((corridor) => (
      fetchOneRoute(buildCorridorRouteCoords(origin, destination, waypoint, corridor))
    )),
  );

  return candidates.filter(Boolean);
}

// Fetch main route + alternative routes from OSRM (called from browser)
async function fetchOSRMRoutes(origin, destination, waypoint) {
  const mainCoords = waypoint
    ? [origin, waypoint, destination]
    : [origin, destination];
  const totalDistApprox = getDistance(origin[0], origin[1], destination[0], destination[1]);

  const mainRoute = await fetchOneRoute(mainCoords);
  const shouldFetchCorridors = !mainRoute || !isVietnamOnlyRoute(mainRoute) || totalDistApprox > 250;
  const corridorRoutes = shouldFetchCorridors
    ? await fetchVietnamCorridorRoutes(origin, destination, waypoint)
    : [];

  if (!mainRoute && !corridorRoutes.length) {
    throw new Error('Không tìm thấy đường đi giữa hai điểm này.');
  }

  const routes = [];
  addUniqueRoute(routes, mainRoute);
  corridorRoutes.forEach((route) => addUniqueRoute(routes, route));

  // Generate alternative routes if no waypoint
  if (!waypoint) {
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

        addUniqueRoute(routes, leftRoute);
        addUniqueRoute(routes, rightRoute);
      }
    }
  }

  if (!routes.length) {
    throw new Error('Không tìm được tuyến chỉ đi trong Việt Nam. Bạn thử thêm một điểm trung gian trong Việt Nam.');
  }

  return routes
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 3);
}

const normalizeCoordinatePair = (coords) => {
  if (!Array.isArray(coords) || coords.length < 2) return null;

  const lat = Number(coords[0]);
  const lng = Number(coords[1]);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return [lat, lng];
};

// Downsample coordinate array to maxPoints while keeping first/last.
// Server needs points roughly every ~500m for 1km-radius station search.
// A 1700km route from OSRM has ~50k points → downsample to ~3000.
function downsampleCoordinates(coordinates, maxPoints = 3000) {
  if (!coordinates || coordinates.length <= maxPoints) return coordinates;

  const result = [coordinates[0]]; // always keep start
  const step = (coordinates.length - 1) / (maxPoints - 1);

  for (let i = 1; i < maxPoints - 1; i++) {
    result.push(coordinates[Math.round(i * step)]);
  }

  result.push(coordinates[coordinates.length - 1]); // always keep end
  return result;
}

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
    const { origin, destination, waypoint, prefetchedRoutes, ...serverParams } = params;

    // Reuse routes already shown on the map when switching alternatives, so
    // route buttons feel instant and we avoid another OSRM round-trip.
    const rawRoutes = prefetchedRoutes?.length
      ? prefetchedRoutes
      : await fetchOSRMRoutes(origin, destination, waypoint);

    // Strip to only what server needs: distance + coordinates (reduced precision)
    // Then downsample to avoid 413 Payload Too Large on long routes (e.g. SG→HN ~50k pts)
    const routes = rawRoutes.map(r => {
      const sourceCoords = r.geometry?.coordinates || r.polylineCoords?.map(([lat, lng]) => [lng, lat]) || [];
      const rounded = sourceCoords.map(c => [
        Math.round(c[0] * 10000) / 10000,  // ~11m precision, sufficient for 1km station search
        Math.round(c[1] * 10000) / 10000,
      ]);
      return {
        distance: r.distance ?? (r.distanceKm * 1000),
        geometry: {
          coordinates: downsampleCoordinates(rounded, 3000),
        },
      };
    });

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
