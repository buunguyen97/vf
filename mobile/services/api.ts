import axios from 'axios';
import { Platform } from 'react-native';

// For physical devices or Expo Go, localhost won't work.
// You should set EXPO_PUBLIC_API_URL in a .env file, e.g., EXPO_PUBLIC_API_URL=http://192.168.1.X:3001/api
// Fallback logic for Android Emulator (10.0.2.2) and iOS Simulator (localhost)
const getApiUrl = () => {
  if (process.env.EXPO_PUBLIC_API_URL) {
    return process.env.EXPO_PUBLIC_API_URL;
  }
  if (Platform.OS === 'android') {
    return 'http://10.0.2.2:3001/api'; // Android Emulator
  }
  return 'http://localhost:3001/api'; // iOS Simulator
};

const API_URL = getApiUrl();
const OSRM_BASES = [
  'https://router.project-osrm.org',
  'http://router.project-osrm.org',
];

// Haversine distance (km)
export function getDistance(lat1: number, lon1: number, lat2: number, lon2: number) {
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

function interpolateMinVietnamLon(lat: number) {
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

function isLikelyVietnamDrivingPoint([lon, lat]: [number, number]) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;
  if (lat < 8.2 || lat > 23.7 || lon < 102.0 || lon > 110.1) return false;

  // OSRM has no "avoid countries" option. This approximates Vietnam's west
  // border enough to reject obvious Cambodia/Laos detours while allowing
  // normal roads near border provinces.
  return lon >= interpolateMinVietnamLon(lat) - 0.28;
}

function getForeignRouteRatio(route: any) {
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

function isVietnamOnlyRoute(route: any) {
  return getForeignRouteRatio(route) <= 0.025;
}

function selectCorridorWaypoints(corridor: number[][], from: [number, number], to: [number, number]) {
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

function buildCorridorRouteCoords(origin: [number, number], destination: [number, number], waypoint: [number, number] | null, corridor: number[][]) {
  const anchors = waypoint ? [origin, waypoint, destination] : [origin, destination];
  const coords = [origin];

  for (let i = 0; i < anchors.length - 1; i++) {
    const from = anchors[i];
    const to = anchors[i + 1];
    const waypoints = selectCorridorWaypoints(corridor, from, to);

    waypoints.forEach((point) => {
      const last = coords[coords.length - 1];
      if (getDistance(last[0], last[1], point[0], point[1]) > 8) {
        coords.push(point as [number, number]);
      }
    });

    coords.push(to);
  }

  return coords;
}

function addUniqueRoute(routes: any[], route: any) {
  if (!route || !isVietnamOnlyRoute(route)) return;

  const isDuplicate = routes.some((existing) => (
    Math.abs(existing.distance - route.distance) < 5000
  ));
  if (!isDuplicate) routes.push(route);
}

async function fetchRoutes(coords: [number, number][], alternatives = false) {
  const coordStr = coords.map(c => `${c[1]},${c[0]}`).join(';');
  const alternativesParam = alternatives ? '3' : 'false';

  for (const baseUrl of OSRM_BASES) {
    const url = `${baseUrl}/route/v1/driving/${coordStr}?overview=full&geometries=geojson&alternatives=${alternativesParam}&continue_straight=false`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    try {
      const res = await fetch(url, {
        signal: controller.signal,
        headers: { 'User-Agent': 'VFRangeAssistant/1.0' }
      });

      if (!res.ok) {
        console.log('OSRM Error:', baseUrl, res.status, res.statusText);
        continue;
      }

      const data = await res.json();
      if (data.code === 'Ok' && data.routes?.length > 0) return data.routes;

      console.log('OSRM route not found:', baseUrl, data.code, data.message || '');
    } catch (error: any) {
      console.log('OSRM fetch failed:', baseUrl, error?.message || error);
    } finally {
      clearTimeout(timeoutId);
    }
  }

  return [];
}

// Fetch a single OSRM route, returns route object or null
async function fetchOneRoute(coords: [number, number][]) {
  const routes = await fetchRoutes(coords, false);
  return routes[0] || null;
}

async function fetchVietnamCorridorRoutes(origin: [number, number], destination: [number, number], waypoint: [number, number] | null) {
  const candidates = await Promise.all(
    VIETNAM_ROUTE_CORRIDORS.map((corridor) => (
      fetchOneRoute(buildCorridorRouteCoords(origin, destination, waypoint, corridor))
    )),
  );

  return candidates.filter(Boolean);
}

// Fetch main route + alternative routes from OSRM
async function fetchOSRMRoutes(origin: [number, number], destination: [number, number], waypoint: [number, number] | null) {
  const mainCoords = waypoint
    ? [origin, waypoint, destination]
    : [origin, destination];
  const totalDistApprox = getDistance(origin[0], origin[1], destination[0], destination[1]);

  const mainRoutes = await fetchRoutes(mainCoords, !waypoint);
  const hasVietnamMainRoute = mainRoutes.some((route: any) => isVietnamOnlyRoute(route));
  const shouldFetchCorridors = !hasVietnamMainRoute || totalDistApprox > 250;
  const corridorRoutes = shouldFetchCorridors
    ? await fetchVietnamCorridorRoutes(origin, destination, waypoint)
    : [];

  if (!mainRoutes.length && !corridorRoutes.length) {
    throw new Error('Không tìm thấy đường đi giữa hai điểm này.');
  }

  const routes: any[] = [];
  mainRoutes.forEach((route: any) => addUniqueRoute(routes, route));
  corridorRoutes.forEach((route) => addUniqueRoute(routes, route));

  if (!routes.length) {
    throw new Error('Không tìm được tuyến chỉ đi trong Việt Nam. Bạn thử thêm một điểm trung gian trong Việt Nam.');
  }

  return routes
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 3);
}

// Downsample coordinate array to maxPoints while keeping first/last.
export function downsampleCoordinates(coordinates: number[][], maxPoints = 3000) {
  if (!coordinates || coordinates.length <= maxPoints) return coordinates;

  const result = [coordinates[0]]; // always keep start
  const step = (coordinates.length - 1) / (maxPoints - 1);

  for (let i = 1; i < maxPoints - 1; i++) {
    result.push(coordinates[Math.round(i * step)]);
  }

  result.push(coordinates[coordinates.length - 1]); // always keep end
  return result;
}

function normalizeMapsInputUrl(rawValue: string) {
  const raw = `${rawValue || ''}`.trim();
  if (!raw) return '';

  const matchedUrl = raw.match(/https?:\/\/[^\s]+|(?:maps\.app\.goo\.gl|goo\.gl|g\.co|google\.[^\s/]+)[^\s]*/i);
  let normalized = (matchedUrl ? matchedUrl[0] : raw).trim();

  normalized = normalized.replace(/[)\]>]+$/g, '');
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(normalized)) {
    normalized = `https://${normalized}`;
  }

  normalized = normalized.replace(/[?&]g_st=[^&]*/g, '');
  normalized = normalized.replace(/[?&]g_ep=[^&]*/g, '');
  normalized = normalized.replace(/[?&]lucs=[^&]*/g, '');
  normalized = normalized.replace(/[?&]skid=[^&]*/g, '');

  return normalized;
}

function toValidVietnamCoordinatePair(lat: number, lng: number) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < 8 || lat > 24 || lng < 102 || lng > 110) return null;
  return [lat, lng];
}

function normalizeParsedCoordinates(result: any) {
  if (!result || result.error) return result;

  const normalized = {
    origin: result.origin || null,
    destination: result.destination || null,
  };

  if (normalized.origin && !normalized.destination) {
    normalized.destination = normalized.origin;
    normalized.origin = null;
  }

  if (normalized.origin && normalized.destination) {
    const latDiff = Math.abs(normalized.origin[0] - normalized.destination[0]);
    const lngDiff = Math.abs(normalized.origin[1] - normalized.destination[1]);
    const distanceApproxMeters = Math.sqrt((latDiff * latDiff) + (lngDiff * lngDiff)) * 111000;
    if (distanceApproxMeters < 100) {
      normalized.origin = null;
    }
  }

  return normalized;
}

function isPlaceOnlyGoogleMapsUrl(urlStr: string) {
  try {
    const parsed = new URL(urlStr);
    const path = parsed.pathname.toLowerCase();
    return path.includes('/maps/place/') || (path.includes('/place/') && !path.includes('/dir/'));
  } catch {
    return false;
  }
}

function extractCoordinatePairsFromText(text: string) {
  const pairs: number[][] = [];

  const d34Matches = [...text.matchAll(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/g)];
  d34Matches.forEach((match) => {
    const pair = toValidVietnamCoordinatePair(parseFloat(match[1]), parseFloat(match[2]));
    if (pair) pairs.push(pair);
  });

  const d12Matches = [...text.matchAll(/!1d(-?\d+\.\d+)!2d(-?\d+\.\d+)/g)];
  d12Matches.forEach((match) => {
    const pair = toValidVietnamCoordinatePair(parseFloat(match[2]), parseFloat(match[1]));
    if (pair) pairs.push(pair);
  });

  const bracketMatches = [...text.matchAll(/\[(-?\d+\.\d+),(-?\d+\.\d+)\]/g)];
  bracketMatches.forEach((match) => {
    const first = parseFloat(match[1]);
    const second = parseFloat(match[2]);
    const latLng = toValidVietnamCoordinatePair(first, second);
    const lngLat = toValidVietnamCoordinatePair(second, first);
    if (latLng) pairs.push(latLng);
    else if (lngLat) pairs.push(lngLat);
  });

  const rawMatches = [...text.matchAll(/(-?\d{1,2}\.\d{5,})\s*,\s*(-?\d{1,3}\.\d{5,})/g)];
  rawMatches.forEach((match) => {
    const pair = toValidVietnamCoordinatePair(parseFloat(match[1]), parseFloat(match[2]));
    if (pair) pairs.push(pair);
  });

  return pairs;
}

function extractCoordinatesFromGoogleMapsUrl(urlStr: string) {
  let origin: number[] | null = null;
  let destination: number[] | null = null;

  try {
    const parsedUrl = new URL(urlStr);
    const isPlaceOnlyUrl = isPlaceOnlyGoogleMapsUrl(urlStr);
    const pathParts = parsedUrl.pathname.split('/').filter(Boolean);

    if (pathParts[0] === 'maps' && pathParts[1] === 'dir') {
      const coordRegex = /^(-?\d+\.\d+),(-?\d+\.\d+)$/;
      const originMatch = pathParts[2]?.match(coordRegex);
      const destinationMatch = pathParts[3]?.match(coordRegex);

      if (originMatch) origin = toValidVietnamCoordinatePair(parseFloat(originMatch[1]), parseFloat(originMatch[2]));
      if (destinationMatch) destination = toValidVietnamCoordinatePair(parseFloat(destinationMatch[1]), parseFloat(destinationMatch[2]));
    }

    const queryCoordinateParams = [
      ['origin', 'origin'],
      ['saddr', 'origin'],
      ['destination', 'destination'],
      ['daddr', 'destination'],
      ['q', 'destination'],
    ];

    queryCoordinateParams.forEach(([param, target]) => {
      const value = parsedUrl.searchParams.get(param);
      if (!value) return;

      const match = value.match(/(-?\d+\.\d+)[,\s]+(-?\d+\.\d+)/);
      if (!match) return;

      const pair = toValidVietnamCoordinatePair(parseFloat(match[1]), parseFloat(match[2]));
      if (!pair) return;

      if (target === 'origin' && !origin) origin = pair;
      if (target === 'destination' && !destination) destination = pair;
    });

    const atMatch = urlStr.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
    if (atMatch && !destination && !origin) {
      destination = toValidVietnamCoordinatePair(parseFloat(atMatch[1]), parseFloat(atMatch[2]));
    }

    const pathMatch = parsedUrl.pathname.match(/\/(-?\d+\.\d+),(-?\d+\.\d+)/);
    if (pathMatch && !destination && !origin) {
      destination = toValidVietnamCoordinatePair(parseFloat(pathMatch[1]), parseFloat(pathMatch[2]));
    }

    const extractedPairs = extractCoordinatePairsFromText(urlStr);
    if (extractedPairs.length >= 2 && !isPlaceOnlyUrl) {
      if (!origin) origin = extractedPairs[0];
      if (!destination) destination = extractedPairs[extractedPairs.length - 1];
    } else if (extractedPairs.length > 0) {
      if (!destination) destination = extractedPairs[extractedPairs.length - 1];
    }

    if (!origin && !destination) {
      return { error: 'Không tìm thấy tọa độ trong link.' };
    }

    return normalizeParsedCoordinates({ origin, destination });
  } catch (error: any) {
    return { error: error?.message || 'URL không hợp lệ.' };
  }
}

async function fetchTextWithTimeout(url: string, timeoutMs = 15000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 VFRangeAssistant/1.0',
        'Accept-Language': 'vi-vn',
      },
    });

    return {
      finalUrl: response.url || url,
      text: await response.text(),
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

async function parseGoogleMapsLinkOnDevice(url: string) {
  const normalizedUrl = normalizeMapsInputUrl(url);
  if (!normalizedUrl) {
    return { success: false, origin: null, destination: null, message: 'URL không hợp lệ.' };
  }

  const directExtracted = normalizeParsedCoordinates(extractCoordinatesFromGoogleMapsUrl(normalizedUrl));
  if (!directExtracted.error && directExtracted.destination) {
    return {
      success: true,
      origin: directExtracted.origin,
      destination: directExtracted.destination,
      resolvedUrl: normalizedUrl,
    };
  }

  try {
    const { finalUrl, text } = await fetchTextWithTimeout(normalizedUrl);
    const finalExtracted = normalizeParsedCoordinates(extractCoordinatesFromGoogleMapsUrl(finalUrl));
    if (!finalExtracted.error && finalExtracted.destination) {
      return {
        success: true,
        origin: finalExtracted.origin,
        destination: finalExtracted.destination,
        resolvedUrl: finalUrl,
      };
    }

    const htmlPairs = extractCoordinatePairsFromText(text);
    if (htmlPairs.length > 0) {
      return {
        success: true,
        origin: null,
        destination: htmlPairs[htmlPairs.length - 1],
        resolvedUrl: finalUrl,
        warning: 'Đã đọc tọa độ trực tiếp trên điện thoại do API server không phản hồi.',
      };
    }
  } catch (error) {
    // Keep the UI calm: callers receive a useful message instead of a blocking Alert.
  }

  return {
    success: false,
    origin: null,
    destination: null,
    resolvedUrl: normalizedUrl,
    message: 'Không tìm thấy thông tin tọa độ. Bạn thử mở link trên Google Maps rồi chia sẻ lại, hoặc dán link đầy đủ từ trình duyệt.',
  };
}

export const evApi = {
  getVehicles: async () => {
    const response = await axios.get(`${API_URL}/vehicles`);
    return response.data;
  },
  
  estimateRange: async (params: any) => {
    const response = await axios.post(`${API_URL}/estimate-range`, params);
    return response.data;
  },
  
  getChargers: async (lat: number, lng: number, radius = 50) => {
    const response = await axios.get(`${API_URL}/nearby-chargers`, {
      params: { lat, lng, radius }
    });
    return response.data;
  },
  
  checkReachability: async (params: any) => {
    const response = await axios.post(`${API_URL}/check-reachability`, params);
    return response.data;
  },

  getOptimalRoute: async (params: any) => {
    const { origin, destination, waypoint, prefetchedRoutes, ...serverParams } = params;

    const rawRoutes = prefetchedRoutes?.length
      ? prefetchedRoutes
      : await fetchOSRMRoutes(origin, destination, waypoint);

    const routes = rawRoutes.map((r: any) => {
      const sourceCoords = r.geometry?.coordinates || r.polylineCoords?.map(([lat, lng]: number[]) => [lng, lat]) || [];
      const rounded = sourceCoords.map((c: number[]) => [
        Math.round(c[0] * 10000) / 10000,
        Math.round(c[1] * 10000) / 10000,
      ]);
      return {
        distance: r.distance ?? (r.distanceKm * 1000),
        geometry: {
          coordinates: downsampleCoordinates(rounded, 3000),
        },
      };
    });

    const response = await axios.post(`${API_URL}/optimal-route`, {
      ...serverParams,
      routes,
    });
    return response.data;
  },

  searchLocation: async (query: string) => {
    const res = await axios.get(`${API_URL}/search-location`, {
      params: { q: query }
    });
    return res.data;
  },

  getNearbyAmenities: async (lat: number, lng: number, radius = 500) => {
    const res = await axios.get(`${API_URL}/nearby-amenities`, {
      params: { lat, lng, radius }
    });
    return res.data;
  },

  parseGoogleMapsLink: async (url: string) => {
    let apiResult: any = null;

    try {
      const response = await axios.post(`${API_URL}/parse-google-maps-link`, { url }, { timeout: 18000 });
      apiResult = response.data;
      if (apiResult?.destination) return apiResult;
    } catch (error) {
      apiResult = null;
    }

    const deviceResult = await parseGoogleMapsLinkOnDevice(url);
    if (deviceResult.destination) return deviceResult;

    return apiResult || deviceResult;
  }
};
