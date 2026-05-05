import React, { useEffect, useState, useRef, useMemo } from 'react';
import { StyleSheet, View, Text, ActivityIndicator, Dimensions, TouchableOpacity, Linking, Animated, PanResponder } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import MapView, { Marker, Polyline, Circle, PROVIDER_DEFAULT } from 'react-native-maps';
import * as Location from 'expo-location';
import BottomSheet, { BottomSheetScrollView } from '@gorhom/bottom-sheet';

import { evApi } from '../../services/api';
import { getAdjustedDefaultConsumption } from '../../utils/consumption';
import { sortVehiclesByVinFastOrder } from '../../utils/vehicles';
import PlannerControls from '../../components/PlannerControls';
import RouteItinerary from '../../components/RouteItinerary';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout>;

  return new Promise((resolve, reject) => {
    timeoutId = setTimeout(() => reject(new Error(message)), timeoutMs);
    promise
      .then(resolve)
      .catch(reject)
      .finally(() => clearTimeout(timeoutId));
  });
}

function toMapCoordinates(polylineCoords: number[][] = []) {
  return polylineCoords.map((c: number[]) => ({ latitude: c[0], longitude: c[1] }));
}

function roundKm(value: any) {
  const num = Number(value);
  if (!Number.isFinite(num)) return null;
  return Math.max(0, Math.round(num * 10) / 10);
}

function getCleanStationAddress(station: any) {
  const raw = `${station?.address || station?.name || ''}`.trim();
  if (!raw) return station?.name || 'Trạm sạc VinFast';

  let cleaned = raw;
  const cutMatch = cleaned.match(/(Công suất|Công sạc|Trạm sạc|Thời gian hoạt động|Gửi xe|Cập nhật lần cuối|Latitude|Longitude)\s*:/i);
  if (cutMatch?.index !== undefined) {
    cleaned = cleaned.slice(0, cutMatch.index).trim();
  }

  const specMatch = cleaned.match(/\d+\s*cổng[\s\S]*?(?:kW|KW)/i);
  if (specMatch?.index !== undefined) {
    cleaned = cleaned.slice(0, specMatch.index).trim();
  }

  const result = cleaned
    .replace(/^Địa\s*Chỉ:\s*/i, '')
    .replace(/^Địa\s*chỉ:\s*/i, '')
    .replace(/(?:,|\s)*(Công sạc|Cổng sạc|Công suất)\s*:?\s*$/i, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

  return result || station?.name || 'Trạm sạc VinFast';
}

function getChargingSpecCards(station: any) {
  const raw = `${station?.address || station?.name || ''}`;
  const parsedSpecs = [...raw.matchAll(/(\d+)\s*cổng\s*(\d+)\s*(?:kW|KW)/gi)].map((match) => ({
    count: Number(match[1]),
    power: Number(match[2]),
  }));

  if (parsedSpecs.length > 0) return parsedSpecs.slice(0, 4);
  if (station?.power_kw) return [{ count: station?.plugs?.length || 1, power: Number(station.power_kw) }];
  return [];
}

function getReachabilitySummaryParts(stationReachability: any) {
  if (!stationReachability) return null;

  const batteryLeftPercent = stationReachability.batteryLeftPercent;
  const minBatteryPercent = stationReachability.minBatteryPercent;

  if (batteryLeftPercent === undefined || batteryLeftPercent === null) return null;

  const prefix = 'Pin dự kiến khi đến Trạm Sạc: ';
  const batteryText = `${batteryLeftPercent}%`;

  if (minBatteryPercent === undefined || minBatteryPercent === null) {
    return { prefix, batteryText, suffix: '.' };
  }

  const sweetSpotMax = minBatteryPercent + 10;
  const band = `${minBatteryPercent}% -> ${sweetSpotMax}%`;

  if (batteryLeftPercent >= minBatteryPercent && batteryLeftPercent <= sweetSpotMax) {
    return { prefix, batteryText, suffix: ` (khoảng tối thiểu: ${band}).` };
  }

  if (batteryLeftPercent > sweetSpotMax) {
    return { prefix, batteryText, suffix: ` (cao hơn khoảng tối thiểu: ${band}).` };
  }

  return { prefix, batteryText, suffix: ` (thấp hơn khoảng tối thiểu: ${band}).` };
}

function getStationDistanceToStartKm(station: any, stationReachability: any) {
  return roundKm(
    station?.distanceFromStartKm ??
    station?.distanceToStationKm ??
    station?.distanceKm ??
    stationReachability?.distanceKm,
  );
}

function getStationDistanceToDestinationKm(station: any, data: any, distanceToStartKm: number | null) {
  const explicitDistance = roundKm(station?.distanceToDestinationKm);
  if (explicitDistance !== null) return explicitDistance;

  if (distanceToStartKm !== null && data?.totalDistanceKm !== undefined) {
    return roundKm(Number(data.totalDistanceKm) - distanceToStartKm);
  }

  return null;
}

export default function MapScreen() {
  // Location
  const [location, setLocation] = useState<Location.LocationObject | null>(null);
  const [loading, setLoading] = useState(true);
  const [locationName, setLocationName] = useState('');
  const mapRef = useRef<MapView>(null);
  const routeRequestIdRef = useRef(0);
  const stationCardPan = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const stationCardPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_event, gestureState) => (
        Math.abs(gestureState.dx) + Math.abs(gestureState.dy) > 3
      ),
      onPanResponderGrant: () => {
        stationCardPan.extractOffset();
      },
      onPanResponderMove: Animated.event(
        [null, { dx: stationCardPan.x, dy: stationCardPan.y }],
        { useNativeDriver: false },
      ),
      onPanResponderRelease: () => {
        stationCardPan.flattenOffset();
      },
      onPanResponderTerminate: () => {
        stationCardPan.flattenOffset();
      },
    }),
  ).current;

  // Routing State
  const [originOverride, setOriginOverride] = useState<any>(null);
  const [destination, setDestination] = useState<any>(null);
  const [routeError, setRouteError] = useState('');

  // Planner State
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [selectedVehicleId, setSelectedVehicleId] = useState<number | null>(null);
  const [batteryPercent, setBatteryPercent] = useState(80);
  const [targetBatteryPercent, setTargetBatteryPercent] = useState(25);
  const [conditions, setConditions] = useState({ speed: 60, temperature: 32, acOn: true, consumptionWhKm: null as number | null });

  // Range estimation
  const [estimatedRange, setEstimatedRange] = useState(0);
  const [isCalculating, setIsCalculating] = useState(false);

  // Route & Stations
  const [routeData, setRouteData] = useState<any>(null);
  const [isRouting, setIsRouting] = useState(false);
  const [isParsingLink, setIsParsingLink] = useState(false);
  const [selectedStation, setSelectedStation] = useState<any>(null);
  const [reachability, setReachability] = useState<any>(null);
  
  // Bottom Sheet
  const bottomSheetRef = useRef<BottomSheet>(null);
  const snapPoints = useMemo(() => ['15%', '50%', '100%'], []);
  const [sheetIndex, setSheetIndex] = useState(1);

  // Derived
  const selectedVehicle = useMemo(
    () => vehicles.find((v) => v.id === selectedVehicleId) || null,
    [vehicles, selectedVehicleId],
  );

  const routeChoices = useMemo(() => (
    (routeData?.alternativeRoutes || [])
      .slice()
      .sort((a: any, b: any) => a.index - b.index)
  ), [routeData]);

  const selectedRouteIndex = routeData?.selectedRouteIndex ?? 0;
  const showRouteChoiceBar = !!destination && routeChoices.length > 1 && !selectedStation;
  const activeOrigin = useMemo(() => (
    originOverride ||
    (location ? {
      latitude: location.coords.latitude,
      longitude: location.coords.longitude,
    } : null)
  ), [originOverride, location]);

  // Fetch weather + location name
  const fetchWeatherForLocation = (lat: number, lon: number) => {
    fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true`)
      .then(res => res.json())
      .then(data => {
        if (data.current_weather?.temperature !== undefined) {
          setConditions(prev => ({ ...prev, temperature: Math.round(data.current_weather.temperature) }));
        }
      }).catch(() => {});
    fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&zoom=10&accept-language=vi`)
      .then(res => res.json())
      .then(data => {
        const addr = data.address || {};
        let name = addr.state || addr.city || addr.town || addr.county || '';
        name = name.replace(/^Thành phố\s+/i, 'TP. ');
        if (name) setLocationName(name);
      }).catch(() => {});
  };

  useEffect(() => {
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          setLocationName('Chưa cấp quyền vị trí');
        } else {
          const servicesEnabled = await Location.hasServicesEnabledAsync();
          if (!servicesEnabled) {
            setLocationName('GPS đang tắt');
          } else {
            const lastKnownLocation = await Location.getLastKnownPositionAsync({
              maxAge: 5 * 60 * 1000,
              requiredAccuracy: 5000,
            });

            if (lastKnownLocation) {
              setLocation(lastKnownLocation);
              fetchWeatherForLocation(lastKnownLocation.coords.latitude, lastKnownLocation.coords.longitude);
            }

            try {
              const currentLocation = await withTimeout(
                Location.getCurrentPositionAsync({
                  accuracy: Location.Accuracy.Balanced,
                }),
                8000,
                'Current location timeout',
              );
              setLocation(currentLocation);
              fetchWeatherForLocation(currentLocation.coords.latitude, currentLocation.coords.longitude);
            } catch (error) {
              console.warn('Current location unavailable:', error);
              if (!lastKnownLocation) {
                setLocationName('Không lấy được vị trí hiện tại');
              }
            }
          }
        }
      } catch (error) {
        console.warn('Location permission/check failed:', error);
        setLocationName('Không lấy được vị trí hiện tại');
      }

      try {
        const v = await evApi.getVehicles();
        const sortedVehicles = sortVehiclesByVinFastOrder(v);
        setVehicles(sortedVehicles);
        if (sortedVehicles.length > 0) {
          setSelectedVehicleId(sortedVehicles[0].id);
          setConditions(prev => ({ ...prev, consumptionWhKm: getAdjustedDefaultConsumption(sortedVehicles[0]) }));
        }
      } catch (error) {
        console.error("API Fetch Error:", error);
      }
      setLoading(false);
    })();
  }, []);

  // Sync consumptionWhKm when vehicle changes
  useEffect(() => {
    if (!selectedVehicle) return;
    setConditions(prev => ({ ...prev, consumptionWhKm: getAdjustedDefaultConsumption(selectedVehicle) }));
  }, [selectedVehicle]);

  useEffect(() => {
    stationCardPan.setOffset({ x: 0, y: 0 });
    stationCardPan.setValue({ x: 0, y: 0 });
  }, [selectedStation?.id, stationCardPan]);

  // Estimate range
  useEffect(() => {
    if (!selectedVehicleId) return;
    if (selectedVehicle?.name === 'VF3') { setEstimatedRange(0); return; }
    setIsCalculating(true);
    const timer = setTimeout(() => {
      evApi.estimateRange({ batteryPercent, vehicleId: selectedVehicleId, ...conditions })
        .then(res => setEstimatedRange(res.estimatedRangeKm))
        .catch(console.error)
        .finally(() => setIsCalculating(false));
    }, 300);
    return () => clearTimeout(timer);
  }, [batteryPercent, selectedVehicleId, conditions]);

  const handleParseLink = async (link: string) => {
    if (!link) return;
    setIsParsingLink(true);
    try {
      const parsed = await evApi.parseGoogleMapsLink(link);
      const resolvedDestination = parsed.destination || parsed.origin || null;
      const parsedOrigin = parsed.origin && parsed.destination
        ? { latitude: parsed.origin[0], longitude: parsed.origin[1] }
        : null;

      if (resolvedDestination) {
        if (parsedOrigin) {
          setOriginOverride(parsedOrigin);
          fetchWeatherForLocation(parsedOrigin.latitude, parsedOrigin.longitude);
        } else {
          setOriginOverride(null);
        }
        setDestination({ latitude: resolvedDestination[0], longitude: resolvedDestination[1] });
        setRouteData(null);
        setSelectedStation(null);
        setReachability(null);
        setRouteError('');
        if (mapRef.current) {
          const coords = [
            ...(parsedOrigin ? [parsedOrigin] : []),
            { latitude: resolvedDestination[0], longitude: resolvedDestination[1] },
          ];
          mapRef.current.fitToCoordinates(coords, {
            edgePadding: { top: 80, right: 50, bottom: SCREEN_HEIGHT * 0.2, left: 50 },
            animated: true,
          });
        }
      } else {
        setRouteError(parsed.message || 'Không tìm thấy thông tin tọa độ. Vui lòng thử dùng link đầy đủ từ Google Maps.');
      }
    } catch (e) {
      console.log('Error parsing link', e);
      setRouteError('Lỗi khi phân tích link. Vui lòng kiểm tra server API hoặc thử link đầy đủ từ Google Maps.');
    } finally {
      setIsParsingLink(false);
    }
  }

  const handleSheetHandlePress = () => {
    const nextIndex = sheetIndex >= 2 ? 0 : 2;
    bottomSheetRef.current?.snapToIndex(nextIndex);
    setSheetIndex(nextIndex);
  };

  const renderSheetHandle = () => (
    <TouchableOpacity
      style={styles.sheetHandleTapArea}
      activeOpacity={0.8}
      onPress={handleSheetHandlePress}
    >
      <View style={styles.bottomSheetIndicator} />
      <View style={styles.sheetHandleHint}>
        <Ionicons
          name={sheetIndex >= 2 ? 'chevron-down' : 'chevron-up'}
          size={13}
          color="rgba(255,255,255,0.45)"
        />
        <Text style={styles.sheetHandleHintText}>
          {sheetIndex >= 2 ? 'Chạm để thu panel' : 'Chạm để mở panel'}
        </Text>
      </View>
    </TouchableOpacity>
  );

  const fitMapToRouteResult = (res: any) => {
    if (!mapRef.current || !activeOrigin) return;

    let coords: any[] = [];
    if (res.polylineCoords && res.polylineCoords.length > 0) {
      coords = toMapCoordinates(res.polylineCoords);
    } else if (res.optimalStations) {
      coords = res.optimalStations.map((s: any) => ({ latitude: s.latitude, longitude: s.longitude }));
      coords.push(activeOrigin);
    }

    if (coords.length > 0) {
      mapRef.current.fitToCoordinates(coords, {
        edgePadding: { top: 90, right: 50, bottom: SCREEN_HEIGHT * 0.22, left: 50 },
        animated: true,
      });
    }
  };

  const handleSuggestStations = async () => {
    if (!selectedVehicleId) {
      setRouteError('Bạn chọn dòng xe trước rồi mình mới tính được trạm sạc phù hợp.');
      return;
    }

    if (!activeOrigin) {
      setRouteError('Chưa có điểm đi. Bạn bật GPS hoặc dán link Google Maps có cả điểm đi và điểm đến nhé.');
      return;
    }

    const requestId = routeRequestIdRef.current + 1;
    routeRequestIdRef.current = requestId;

    setIsRouting(true);
    setSelectedStation(null);
    setReachability(null);
    setRouteError('');
    bottomSheetRef.current?.collapse(); 

    try {
      let res;
      if (destination) {
        res = await evApi.getOptimalRoute({
          origin: [activeOrigin.latitude, activeOrigin.longitude],
          destination: [destination.latitude, destination.longitude],
          waypoint: null,
          currentBattery: batteryPercent,
          targetBattery: targetBatteryPercent,
          vehicleId: selectedVehicleId,
          vehicleName: selectedVehicle?.name,
          conditions,
          routeIndex: 0
        });
      } else {
        const stations = await evApi.getChargers(activeOrigin.latitude, activeOrigin.longitude, 20);
        res = { optimalStations: stations.slice(0, 5), polylineCoords: [] };
      }

      if (requestId !== routeRequestIdRef.current) return;
      
      setRouteData(res);
      fitMapToRouteResult(res);
    } catch (error: any) {
      if (requestId !== routeRequestIdRef.current) return;
      console.error(error);
      setRouteError(error?.response?.data?.message || error?.message || 'Không thể gợi ý trạm sạc.');
    } finally {
      if (requestId === routeRequestIdRef.current) {
        setIsRouting(false);
      }
    }
  };

  const handleRouteReplan = async (routeIndex: number) => {
    if (!destination || !activeOrigin || !selectedVehicleId) return;
    if (routeIndex === selectedRouteIndex) return;

    const requestId = routeRequestIdRef.current + 1;
    routeRequestIdRef.current = requestId;
    const reusableRoutes = routeData?.alternativeRoutes?.length ? routeData.alternativeRoutes : undefined;
    const optimisticRoute = reusableRoutes?.find((route: any) => route.index === routeIndex);

    setIsRouting(true);
    setSelectedStation(null);
    setReachability(null);
    setRouteError('');
    bottomSheetRef.current?.collapse();

    if (optimisticRoute?.polylineCoords?.length) {
      const optimisticData = {
        ...routeData,
        selectedRouteIndex: routeIndex,
        totalDistanceKm: Math.round(optimisticRoute.distanceKm || routeData?.totalDistanceKm || 0),
        polylineCoords: optimisticRoute.polylineCoords,
        allRouteStations: [],
        optimalStations: [],
        chargingStops: [],
        insufficientBattery: false,
        emergencyStation: null,
      };
      setRouteData(optimisticData);
      fitMapToRouteResult(optimisticData);
    }

    try {
      const res = await evApi.getOptimalRoute({
        origin: [activeOrigin.latitude, activeOrigin.longitude],
        destination: [destination.latitude, destination.longitude],
        waypoint: null,
        currentBattery: batteryPercent,
        targetBattery: targetBatteryPercent,
        vehicleId: selectedVehicleId,
        vehicleName: selectedVehicle?.name,
        conditions,
        routeIndex,
        prefetchedRoutes: reusableRoutes,
      });

      if (requestId !== routeRequestIdRef.current) return;
      setRouteData(res);
      fitMapToRouteResult(res);
    } catch (error: any) {
      if (requestId !== routeRequestIdRef.current) return;
      console.error(error);
      setRouteError(error?.response?.data?.message || error?.message || 'Không thể đổi tuyến đường.');
    } finally {
      if (requestId === routeRequestIdRef.current) {
        setIsRouting(false);
      }
    }
  };

  // Station select with reachability check (ported from web)
  const handleStationSelect = async (station: any) => {
    setSelectedStation(station);
    bottomSheetRef.current?.collapse();

    if (routeData && station?.batteryAtStation !== undefined) {
      setReachability({
        canReach: station.batteryAtStation >= Math.max(targetBatteryPercent, 5),
        distanceKm: station.distanceFromStartKm || 0,
        batteryLeftPercent: Math.round(station.batteryAtStation),
        fromRoutePlanner: true,
        minBatteryPercent: Math.max(targetBatteryPercent, 5),
      });
      return;
    }

    if (!activeOrigin || !selectedVehicleId) { setReachability(null); return; }
    setReachability(null);
    try {
      const data = await evApi.checkReachability({
        currentLocation: [activeOrigin.latitude, activeOrigin.longitude],
        destination: [station.latitude, station.longitude],
        batteryPercent,
        targetBattery: targetBatteryPercent,
        vehicleId: selectedVehicleId,
        vehicleName: selectedVehicle?.name,
        ...conditions,
      });
      setReachability(data);
    } catch {
      setReachability({ canReach: false, distanceKm: 0, batteryLeftPercent: 0 });
    }
  };

  const resetRoute = () => {
    routeRequestIdRef.current += 1;
    setIsRouting(false);
    setOriginOverride(null);
    setDestination(null);
    setRouteData(null);
    setSelectedStation(null);
    setReachability(null);
    setRouteError('');
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#1464F4" />
      </View>
    );
  }

  const initialRegion = activeOrigin
    ? {
        latitude: activeOrigin.latitude,
        longitude: activeOrigin.longitude,
        latitudeDelta: 0.05,
        longitudeDelta: 0.05,
      }
    : {
        latitude: 10.762622,
        longitude: 106.660172,
        latitudeDelta: 0.1,
        longitudeDelta: 0.1,
      };
  const selectedStationDistanceToStartKm = selectedStation
    ? getStationDistanceToStartKm(selectedStation, reachability)
    : null;
  const selectedStationDistanceToDestinationKm = selectedStation
    ? getStationDistanceToDestinationKm(selectedStation, routeData, selectedStationDistanceToStartKm)
    : null;
  const selectedStationChargingSpecs = selectedStation ? getChargingSpecCards(selectedStation) : [];
  const reachabilitySummaryParts = getReachabilitySummaryParts(reachability);

  return (
    <View style={styles.container}>
      <MapView 
        ref={mapRef}
        style={styles.map} 
        provider={PROVIDER_DEFAULT}
        initialRegion={initialRegion}
        showsUserLocation={true}
        showsMyLocationButton={false} // Custom button later
        userInterfaceStyle="dark"
      >
        {/* Range Circle (when no route) */}
        {activeOrigin && !routeData && estimatedRange > 0 && (
          <Circle
            center={activeOrigin}
            radius={Math.max(1, estimatedRange) * 1000}
            strokeColor={estimatedRange > 50 ? '#00B14F' : '#DA303E'}
            fillColor={estimatedRange > 50 ? 'rgba(0,177,79,0.1)' : 'rgba(218,48,62,0.1)'}
            strokeWidth={2}
          />
        )}

        {originOverride && (
          <Marker
            coordinate={originOverride}
            title="Điểm đi"
            anchor={{ x: 0.5, y: 0.5 }}
            tracksViewChanges={false}
          >
            <View style={styles.originMarkerHalo}>
              <View style={styles.originMarkerDot} />
            </View>
          </Marker>
        )}

        {/* Alternative route polylines */}
        {routeData?.alternativeRoutes?.map((altRoute: any) => {
          if (altRoute.index === selectedRouteIndex) return null;
          if (!altRoute.polylineCoords?.length) return null;

          return (
            <Polyline
              key={`alt-route-${altRoute.index}`}
              coordinates={toMapCoordinates(altRoute.polylineCoords)}
              strokeColor="#6b7280"
              strokeWidth={4}
            />
          );
        })}

        {/* Render Route Polyline */}
        {routeData?.polylineCoords && routeData.polylineCoords.length > 0 && (
          <Polyline
            coordinates={toMapCoordinates(routeData.polylineCoords)}
            strokeColor="#1464F4"
            strokeWidth={5}
          />
        )}

        {/* Destination Marker */}
        {destination && (
          <Marker
            coordinate={destination}
            title="Điểm đến"
            pinColor="red"
          />
        )}

        {/* Render Stations */}
        {(routeData?.allRouteStations || routeData?.optimalStations)?.map((station: any) => {
          const optimalStation = routeData?.optimalStations?.find((s: any) => s.id === station.id);
          const isSuggested = Boolean(optimalStation);
          const isTargetBandSuggestion = optimalStation?.isInTargetBatteryBand ?? (
            optimalStation?.batteryAtStation >= Math.max(targetBatteryPercent, 5) &&
            optimalStation?.batteryAtStation <= Math.max(targetBatteryPercent, 5) + 10
          );
          const isSelected = selectedStation?.id === station.id;
          
          return (
            <Marker
              key={station.id}
              coordinate={{ latitude: station.latitude, longitude: station.longitude }}
              onPress={() => handleStationSelect(station)}
            >
              <View style={[
                styles.stationMarker, 
                { backgroundColor: isTargetBandSuggestion ? '#22c55e' : (isSuggested ? '#f59e0b' : '#06b6d4') },
                isSelected && styles.stationMarkerSelected
              ]}>
                <Text style={styles.stationMarkerText}>{station.power_kw}</Text>
              </View>
            </Marker>
          );
        })}
      </MapView>

      {/* Route Choice Bar */}
      {showRouteChoiceBar && (
        <View style={styles.routeChoiceBar}>
          <Text style={styles.routeChoiceTitle}>CHỌN TUYẾN ĐƯỜNG</Text>
          <View style={styles.routeChoiceRow}>
            {routeChoices.map((route: any) => {
              const isActive = route.index === selectedRouteIndex;
              return (
                <TouchableOpacity
                  key={route.index}
                  style={[styles.routeChoiceBtn, isActive && styles.routeChoiceBtnActive]}
                  activeOpacity={0.82}
                  disabled={isActive}
                  onPressIn={() => handleRouteReplan(route.index)}
                >
                  <Text style={[styles.routeChoiceName, isActive && styles.routeChoiceTextActive]}>
                    Tuyến {route.index + 1}
                  </Text>
                  <Text style={[styles.routeChoiceDistance, isActive && styles.routeChoiceDistanceActive]}>
                    {Math.round(route.distanceKm)} km
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      )}

      {/* Floating Station Card */}
      {selectedStation && (
        <Animated.View style={[styles.stationCard, { transform: stationCardPan.getTranslateTransform() }]}>
          <View style={styles.stationCardDragHandle} {...stationCardPanResponder.panHandlers}>
            <View style={styles.stationCardDragKnob} />
            <Text style={styles.stationCardDragText}>Túm kéo ô thông tin</Text>
          </View>

          {/* Header */}
          <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start'}}>
            <View style={{flex: 1, paddingRight: 10}}>
              <Text style={{fontSize: 10, fontWeight: 'bold', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1}}>
                Địa chỉ trạm
              </Text>
              <Text style={{fontSize: 14, fontWeight: 'bold', color: '#334155', marginTop: 4, lineHeight: 20}}>
                {getCleanStationAddress(selectedStation)}
              </Text>
            </View>
            <View style={{alignItems: 'flex-end', gap: 6}}>
              {selectedStation.batteryAtStation !== undefined && (
                <View style={{backgroundColor: '#eff6ff', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12}}>
                  <Text style={{fontSize: 10, fontWeight: 'bold', color: '#1d4ed8'}}>
                    Pin {selectedStation.batteryAtStation}%
                  </Text>
                </View>
              )}
              <TouchableOpacity 
                style={{padding: 4}}
                onPress={() => setSelectedStation(null)}
              >
                <Ionicons name="close" size={24} color="#000" />
              </TouchableOpacity>
            </View>
          </View>

          {/* Charging Specs */}
          {selectedStationChargingSpecs.length > 0 && (
            <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12}}>
              {selectedStationChargingSpecs.map((spec: any, index: number) => (
                <View key={`${spec.power}-${spec.count}-${index}`} style={{flexGrow: 1, minWidth: selectedStationChargingSpecs.length === 1 ? '100%' : '48%', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#f0fdf4', paddingHorizontal: 12, paddingVertical: 10, borderRadius: 16, borderWidth: 1, borderColor: 'rgba(34,197,94,0.2)'}}>
                  <Text style={{fontSize: 16, fontWeight: '900', color: '#166534'}}>{spec.power} <Text style={{fontSize: 10, fontWeight: 'bold'}}>kW</Text></Text>
                  <View style={{backgroundColor: '#fff', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(34,197,94,0.2)'}}>
                    <Text style={{fontSize: 10, fontWeight: 'bold', color: '#15803d'}}>{spec.count} cổng</Text>
                  </View>
                </View>
              ))}
            </View>
          )}

          {/* Distance Info */}
          {routeData && selectedStationDistanceToStartKm !== null && selectedStationDistanceToDestinationKm !== null && (
            <View style={{flexDirection: 'row', gap: 8, marginTop: 8}}>
              <View style={{flex: 1, backgroundColor: '#eff6ff', borderRadius: 16, paddingVertical: 12, alignItems: 'center', borderWidth: 1, borderColor: '#dbeafe'}}>
                <Text style={{fontSize: 10, color: 'rgba(20,100,244,0.7)', textTransform: 'uppercase', fontWeight: 'bold'}}>Đến trạm</Text>
                <Text style={{fontSize: 14, color: '#1464F4', fontWeight: '900', marginTop: 4}}>{selectedStationDistanceToStartKm} km</Text>
              </View>
              <View style={{flex: 1, backgroundColor: '#ecfeff', borderRadius: 16, paddingVertical: 12, alignItems: 'center', borderWidth: 1, borderColor: '#cffafe'}}>
                <Text style={{fontSize: 10, color: 'rgba(2,132,199,0.7)', textTransform: 'uppercase', fontWeight: 'bold'}}>Từ trạm đến đích</Text>
                <Text style={{fontSize: 14, color: '#0369a1', fontWeight: '900', marginTop: 4}}>{selectedStationDistanceToDestinationKm} km</Text>
              </View>
            </View>
          )}
          {!routeData && selectedStationDistanceToStartKm !== null && (
            <View style={{backgroundColor: '#eff6ff', borderRadius: 16, paddingVertical: 12, alignItems: 'center', borderWidth: 1, borderColor: '#dbeafe', marginTop: 8}}>
              <Text style={{fontSize: 10, color: 'rgba(20,100,244,0.7)', textTransform: 'uppercase', fontWeight: 'bold'}}>Quãng đường đến trạm</Text>
              <Text style={{fontSize: 14, color: '#1464F4', fontWeight: '900', marginTop: 4}}>{selectedStationDistanceToStartKm} km</Text>
            </View>
          )}

          {/* Reachability — now uses real API check */}
          {reachability ? (
            <View style={{backgroundColor: reachability.canReach ? '#f0fdf4' : '#fef2f2', borderRadius: 16, padding: 12, marginTop: 8, borderWidth: 1, borderColor: reachability.canReach ? 'rgba(34,197,94,0.3)' : 'rgba(218,48,62,0.3)'}}>
              <View style={{flexDirection: 'row', alignItems: 'center', gap: 6}}>
                <Ionicons name={reachability.canReach ? 'checkmark-circle' : 'warning'} size={16} color={reachability.canReach ? '#16a34a' : '#DA303E'} />
                <Text style={{fontSize: 13, fontWeight: 'bold', color: reachability.canReach ? '#16a34a' : '#DA303E'}}>
                  {reachability.canReach ? 'Có thể đến nơi an toàn' : 'Không thể đến nơi'}
                </Text>
              </View>
              {reachability.canReach && (
                <Text style={{fontSize: 11, color: '#475569', marginTop: 6, lineHeight: 16}}>
                  {reachabilitySummaryParts ? (
                    <>
                      <Text>{reachabilitySummaryParts.prefix}</Text>
                      <Text style={styles.reachabilityBatteryText}>{reachabilitySummaryParts.batteryText}</Text>
                      <Text>{reachabilitySummaryParts.suffix}</Text>
                    </>
                  ) : (
                    `Pin dự kiến khi đến Trạm Sạc: ${reachability.batteryLeftPercent}%.`
                  )}
                </Text>
              )}
              {!reachability.canReach && (
                <Text style={{fontSize: 11, color: '#475569', marginTop: 6, lineHeight: 16}}>
                  {reachabilitySummaryParts ? (
                    <>
                      <Text>{reachabilitySummaryParts.prefix}</Text>
                      <Text style={styles.reachabilityBatteryText}>{reachabilitySummaryParts.batteryText}</Text>
                      <Text>{reachabilitySummaryParts.suffix}</Text>
                    </>
                  ) : (
                    `Cần sạc ở trạm gần hơn. Trạm này cách ${Math.round(reachability.distanceKm || 0)} km.`
                  )}
                </Text>
              )}
            </View>
          ) : selectedStation.batteryAtStation === undefined && (
            <View style={{padding: 12, alignItems: 'center'}}>
              <ActivityIndicator size="small" color="#1464F4" />
              <Text style={{fontSize: 10, color: '#94a3b8', marginTop: 6}}>Đang phân tích...</Text>
            </View>
          )}

          {/* Amenities (Disabled like Web) */}
          <View style={{backgroundColor: '#f8fafc', borderRadius: 16, padding: 12, marginTop: 8, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderWidth: 1, borderColor: '#f1f5f9'}}>
            <View style={{flexDirection: 'row', alignItems: 'center', gap: 8}}>
              <Ionicons name="cafe-outline" size={16} color="#16a34a" />
              <Text style={{fontSize: 12, fontWeight: 'bold', color: '#475569'}}>Quán ăn và Coffee xung quanh</Text>
            </View>
            <Ionicons name="chevron-down" size={16} color="#94a3b8" />
          </View>

          {/* Action Button */}
          <TouchableOpacity 
            style={{backgroundColor: '#1464F4', borderRadius: 16, paddingVertical: 14, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8, marginTop: 8}}
            onPress={() => Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${selectedStation.latitude},${selectedStation.longitude}`)}
          >
            <Ionicons name="navigate" size={16} color="#fff" />
            <Text style={{color: '#fff', fontSize: 13, fontWeight: 'bold'}}>Bắt đầu đi với Google Map</Text>
          </TouchableOpacity>
        </Animated.View>
      )}

      {/* Cancel Route Button */}
      {destination && !isRouting && (
        <TouchableOpacity style={styles.cancelBtn} onPress={resetRoute}>
          <Text style={styles.cancelBtnText}>Huỷ Dẫn Đường</Text>
        </TouchableOpacity>
      )}

      {isRouting && !showRouteChoiceBar && (
        <View style={styles.loadingOverlay}>
          <View style={styles.loadingBox}>
            <ActivityIndicator size="large" color="#00B14F" />
            <Text style={styles.loadingText}>Đang tính lộ trình...</Text>
          </View>
        </View>
      )}

      <BottomSheet
        ref={bottomSheetRef}
        index={1} // Start at 50%
        snapPoints={snapPoints}
        onChange={setSheetIndex}
        handleComponent={renderSheetHandle}
        enableContentPanningGesture={false}
        backgroundStyle={styles.bottomSheetBg}
      >
        <BottomSheetScrollView 
          contentContainerStyle={{ paddingBottom: 20 }}
          keyboardShouldPersistTaps="handled"
          nestedScrollEnabled
        >
          {/* Route Error */}
          {routeError ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{routeError}</Text>
            </View>
          ) : null}

          {routeData && (
            <RouteItinerary
              stations={routeData.optimalStations}
              chargingStops={routeData.chargingStops}
              onStationSelect={handleStationSelect}
              insufficientBattery={routeData.insufficientBattery}
            />
          )}

          <PlannerControls 
            vehicles={vehicles}
            selectedVehicleId={selectedVehicleId}
            onSelectVehicle={setSelectedVehicleId}
            batteryPercent={batteryPercent}
            setBatteryPercent={setBatteryPercent}
            targetBatteryPercent={targetBatteryPercent}
            setTargetBatteryPercent={setTargetBatteryPercent}
            conditions={conditions}
            setConditions={setConditions}
            onSuggestStations={handleSuggestStations}
            isLoadingStations={isRouting}
            origin={activeOrigin}
            destination={destination}
            setDestination={setDestination}
            onParseLink={handleParseLink}
            isParsingLink={isParsingLink}
            estimatedRange={estimatedRange}
            isCalculating={isCalculating}
            locationName={locationName}
          />
        </BottomSheetScrollView>
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#050505',
  },
  map: {
    ...StyleSheet.absoluteFillObject,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#050505',
  },
  bottomSheetBg: {
    backgroundColor: '#0a0a0a',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  bottomSheetIndicator: {
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    width: 40,
    height: 4,
    borderRadius: 999,
    alignSelf: 'center',
  },
  sheetHandleTapArea: {
    minHeight: 44,
    paddingTop: 10,
    paddingBottom: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetHandleHint: {
    marginTop: 5,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  sheetHandleHintText: {
    color: 'rgba(255,255,255,0.42)',
    fontSize: 10,
    fontWeight: '700',
  },
  stationCard: {
    position: 'absolute',
    top: 60,
    left: 20,
    right: 20,
    backgroundColor: '#ffffff',
    borderRadius: 24,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 8,
  },
  stationCardDragHandle: {
    alignItems: 'center',
    paddingBottom: 8,
    marginTop: -4,
    marginBottom: 4,
  },
  stationCardDragKnob: {
    width: 42,
    height: 4,
    borderRadius: 999,
    backgroundColor: '#cbd5e1',
  },
  stationCardDragText: {
    marginTop: 4,
    color: '#94a3b8',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  reachabilityBatteryText: {
    color: '#0f172a',
    fontSize: 15,
    fontWeight: '900',
    lineHeight: 18,
  },
  originMarkerHalo: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(37, 99, 235, 0.18)',
    borderWidth: 1,
    borderColor: 'rgba(37, 99, 235, 0.22)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  originMarkerDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#2563eb',
    borderWidth: 3,
    borderColor: '#ffffff',
    shadowColor: '#2563eb',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 5,
    elevation: 4,
  },
  stationMarker: {
    width: 34,
    height: 34,
    borderRadius: 17,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#ffffff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.4,
    shadowRadius: 6,
    elevation: 4,
  },
  stationMarkerSelected: {
    borderColor: '#dbeafe',
    transform: [{ scale: 1.15 }],
    shadowColor: '#3b82f6',
    shadowOpacity: 0.8,
    shadowRadius: 10,
  },
  stationMarkerText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 12,
  },
  routeChoiceBar: {
    position: 'absolute',
    top: 36,
    left: 18,
    right: 18,
    backgroundColor: 'rgba(17,17,17,0.9)',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    paddingHorizontal: 12,
    paddingVertical: 10,
    zIndex: 450,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.28,
    shadowRadius: 18,
    elevation: 10,
  },
  routeChoiceTitle: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 10,
    fontWeight: '900',
    textAlign: 'center',
    letterSpacing: 1.4,
    marginBottom: 8,
  },
  routeChoiceRow: {
    flexDirection: 'row',
    gap: 8,
  },
  routeChoiceBtn: {
    flex: 1,
    minHeight: 52,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    backgroundColor: 'rgba(255,255,255,0.08)',
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  routeChoiceBtnActive: {
    backgroundColor: '#1464F4',
    borderColor: '#1464F4',
    shadowColor: '#1464F4',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.32,
    shadowRadius: 14,
    elevation: 7,
  },
  routeChoiceName: {
    color: 'rgba(255,255,255,0.78)',
    fontSize: 12,
    fontWeight: '900',
  },
  routeChoiceTextActive: {
    color: '#fff',
  },
  routeChoiceDistance: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 11,
    fontWeight: '700',
    marginTop: 3,
  },
  routeChoiceDistanceActive: {
    color: 'rgba(255,255,255,0.82)',
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  },
  loadingBox: {
    backgroundColor: '#111',
    padding: 20,
    borderRadius: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    shadowColor: '#00B14F',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 15,
    elevation: 10,
  },
  loadingText: {
    color: '#fff',
    marginTop: 12,
    fontSize: 14,
    fontWeight: 'bold',
  },
  cancelBtn: {
    position: 'absolute',
    bottom: 140,
    right: 16,
    backgroundColor: '#DA303E',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 24,
    zIndex: 400,
    shadowColor: '#DA303E',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
  cancelBtnText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  errorBox: {
    marginHorizontal: 12,
    marginTop: 8,
    backgroundColor: 'rgba(218,48,62,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(218,48,62,0.3)',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  errorText: {
    color: '#fca5a5',
    fontSize: 12,
  },
});
