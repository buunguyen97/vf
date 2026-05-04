import React, { useEffect, useState, useRef, useMemo } from 'react';
import { StyleSheet, View, Text, ActivityIndicator, Dimensions, TouchableOpacity, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import MapView, { Marker, Polyline, Circle, PROVIDER_DEFAULT } from 'react-native-maps';
import * as Location from 'expo-location';
import BottomSheet, { BottomSheetScrollView } from '@gorhom/bottom-sheet';

import { evApi } from '../../services/api';
import { getAdjustedDefaultConsumption } from '../../utils/consumption';
import PlannerControls from '../../components/PlannerControls';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

export default function MapScreen() {
  // Location
  const [location, setLocation] = useState<Location.LocationObject | null>(null);
  const [loading, setLoading] = useState(true);
  const [locationName, setLocationName] = useState('');
  const mapRef = useRef<MapView>(null);

  // Routing State
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
  const snapPoints = useMemo(() => ['15%', '50%', '85%'], []);

  // Derived
  const selectedVehicle = useMemo(
    () => vehicles.find((v) => v.id === selectedVehicleId) || null,
    [vehicles, selectedVehicleId],
  );

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
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        let loc = await Location.getCurrentPositionAsync({});
        setLocation(loc);
        fetchWeatherForLocation(loc.coords.latitude, loc.coords.longitude);
      }

      try {
        const v = await evApi.getVehicles();
        setVehicles(v);
        if (v.length > 0) {
          setSelectedVehicleId(v[0].id);
          setConditions(prev => ({ ...prev, consumptionWhKm: getAdjustedDefaultConsumption(v[0]) }));
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
      if (parsed.destination) {
        setDestination({ latitude: parsed.destination[0], longitude: parsed.destination[1] });
      }
    } catch (e) {
      console.log('Error parsing link', e);
      alert("Lỗi khi phân tích link. Vui lòng kiểm tra kết nối mạng.");
    } finally {
      setIsParsingLink(false);
    }
  }

  const handleSuggestStations = async () => {
    if (!location || !selectedVehicleId) return;

    setIsRouting(true);
    setSelectedStation(null);
    setReachability(null);
    setRouteError('');
    bottomSheetRef.current?.collapse(); 

    try {
      let res;
      if (destination) {
        res = await evApi.getOptimalRoute({
          origin: [location.coords.latitude, location.coords.longitude],
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
        const stations = await evApi.getChargers(location.coords.latitude, location.coords.longitude, 20);
        res = { optimalStations: stations.slice(0, 5), polylineCoords: [] };
      }
      
      setRouteData(res);
      
      if (mapRef.current) {
        let coords: any[] = [];
        if (res.polylineCoords && res.polylineCoords.length > 0) {
          coords = res.polylineCoords.map((c: number[]) => ({ latitude: c[0], longitude: c[1] }));
        } else if (res.optimalStations) {
          coords = res.optimalStations.map((s: any) => ({ latitude: s.latitude, longitude: s.longitude }));
          coords.push({ latitude: location.coords.latitude, longitude: location.coords.longitude });
        }
        if (coords.length > 0) {
          mapRef.current.fitToCoordinates(coords, {
            edgePadding: { top: 50, right: 50, bottom: SCREEN_HEIGHT * 0.2, left: 50 },
            animated: true,
          });
        }
      }
    } catch (error: any) {
      console.error(error);
      setRouteError(error?.response?.data?.message || error?.message || 'Không thể gợi ý trạm sạc.');
    } finally {
      setIsRouting(false);
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

    if (!location || !selectedVehicleId) { setReachability(null); return; }
    setReachability(null);
    try {
      const data = await evApi.checkReachability({
        currentLocation: [location.coords.latitude, location.coords.longitude],
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

  const initialRegion = location
    ? {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        latitudeDelta: 0.05,
        longitudeDelta: 0.05,
      }
    : {
        latitude: 10.762622,
        longitude: 106.660172,
        latitudeDelta: 0.1,
        longitudeDelta: 0.1,
      };

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
        {location && !routeData && estimatedRange > 0 && (
          <Circle
            center={{ latitude: location.coords.latitude, longitude: location.coords.longitude }}
            radius={Math.max(1, estimatedRange) * 1000}
            strokeColor={estimatedRange > 50 ? '#00B14F' : '#DA303E'}
            fillColor={estimatedRange > 50 ? 'rgba(0,177,79,0.1)' : 'rgba(218,48,62,0.1)'}
            strokeWidth={2}
          />
        )}

        {/* Render Route Polyline */}
        {routeData?.polylineCoords && routeData.polylineCoords.length > 0 && (
          <Polyline
            coordinates={routeData.polylineCoords.map((c: number[]) => ({ latitude: c[0], longitude: c[1] }))}
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
          const isOptimal = routeData?.optimalStations?.some((s: any) => s.id === station.id);
          const isSelected = selectedStation?.id === station.id;
          
          return (
            <Marker
              key={station.id}
              coordinate={{ latitude: station.latitude, longitude: station.longitude }}
              onPress={() => handleStationSelect(station)}
            >
              <View style={[
                styles.stationMarker, 
                { backgroundColor: isOptimal ? '#22c55e' : '#06b6d4' },
                isSelected && styles.stationMarkerSelected
              ]}>
                <Text style={styles.stationMarkerText}>{station.power_kw}</Text>
              </View>
            </Marker>
          );
        })}
      </MapView>

      {/* Floating Station Card */}
      {selectedStation && (
        <View style={styles.stationCard}>
          {/* Header */}
          <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start'}}>
            <View style={{flex: 1, paddingRight: 10}}>
              <Text style={{fontSize: 10, fontWeight: 'bold', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1}}>
                Địa chỉ trạm
              </Text>
              <Text style={{fontSize: 14, fontWeight: 'bold', color: '#334155', marginTop: 4, lineHeight: 20}}>
                {selectedStation.address || selectedStation.name || 'Trạm sạc VinFast'}
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
          <View style={{flexDirection: 'row', gap: 8, marginTop: 12}}>
            <View style={{flex: 1, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#f0fdf4', paddingHorizontal: 12, paddingVertical: 10, borderRadius: 16, borderWidth: 1, borderColor: 'rgba(34,197,94,0.2)'}}>
              <Text style={{fontSize: 16, fontWeight: '900', color: '#166534'}}>{selectedStation.power_kw} <Text style={{fontSize: 10, fontWeight: 'bold'}}>kW</Text></Text>
              <View style={{backgroundColor: '#fff', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(34,197,94,0.2)'}}>
                <Text style={{fontSize: 10, fontWeight: 'bold', color: '#15803d'}}>{selectedStation.plugs?.length || 1} cổng</Text>
              </View>
            </View>
          </View>

          {/* Distance Info */}
          {(selectedStation.distanceToStationKm || routeData) && (
            <View style={{flexDirection: 'row', gap: 8, marginTop: 8}}>
              <View style={{flex: 1, backgroundColor: '#eff6ff', borderRadius: 16, paddingVertical: 12, alignItems: 'center', borderWidth: 1, borderColor: '#dbeafe'}}>
                <Text style={{fontSize: 10, color: 'rgba(20,100,244,0.7)', textTransform: 'uppercase', fontWeight: 'bold'}}>Đến trạm</Text>
                <Text style={{fontSize: 14, color: '#1464F4', fontWeight: '900', marginTop: 4}}>{selectedStation.distanceToStationKm || '0'} km</Text>
              </View>
              <View style={{flex: 1, backgroundColor: '#ecfeff', borderRadius: 16, paddingVertical: 12, alignItems: 'center', borderWidth: 1, borderColor: '#cffafe'}}>
                <Text style={{fontSize: 10, color: 'rgba(2,132,199,0.7)', textTransform: 'uppercase', fontWeight: 'bold'}}>Từ trạm đến đích</Text>
                <Text style={{fontSize: 14, color: '#0369a1', fontWeight: '900', marginTop: 4}}>{selectedStation.distanceToDestinationKm || '0'} km</Text>
              </View>
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
                  Pin dự kiến khi đến Trạm Sạc: <Text style={{fontWeight: 'bold', color: '#000'}}>{reachability.batteryLeftPercent}%</Text>
                </Text>
              )}
              {!reachability.canReach && (
                <Text style={{fontSize: 11, color: '#475569', marginTop: 6, lineHeight: 16}}>
                  Cần sạc ở trạm gần hơn. Trạm này cách {Math.round(reachability.distanceKm)} km.
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
        </View>
      )}

      {/* Cancel Route Button */}
      {destination && !isRouting && (
        <TouchableOpacity style={styles.cancelBtn} onPress={resetRoute}>
          <Text style={styles.cancelBtnText}>Huỷ Dẫn Đường</Text>
        </TouchableOpacity>
      )}

      {isRouting && (
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
        backgroundStyle={styles.bottomSheetBg}
        handleIndicatorStyle={styles.bottomSheetIndicator}
      >
        <BottomSheetScrollView 
          contentContainerStyle={{ paddingBottom: 20 }}
          keyboardShouldPersistTaps="handled"
        >
          {/* Route Error */}
          {routeError ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{routeError}</Text>
            </View>
          ) : null}



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
            origin={location ? location.coords : null}
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
