import { useEffect, useMemo, useRef, useState } from 'react';
import Layout from './components/layout/Layout';
import MapView from './components/map/MapView';
import PlannerControls from './components/planner/PlannerControls';
import { evApi } from './services/api';
import { getAdjustedDefaultConsumption } from './utils/consumption';

const cloneRouteSnapshot = (snapshot) => {
  if (!snapshot) return null;

  return {
    routeData: snapshot.routeData ? JSON.parse(JSON.stringify(snapshot.routeData)) : null,
    waypoint: snapshot.waypoint ? [...snapshot.waypoint] : null,
    oldRoutePolyline: snapshot.oldRoutePolyline ? JSON.parse(JSON.stringify(snapshot.oldRoutePolyline)) : null,
  };
};

const summarizeRouteSnapshot = (snapshot) => JSON.stringify({
  waypoint: snapshot?.waypoint || null,
  selectedRouteIndex: snapshot?.routeData?.selectedRouteIndex ?? null,
  totalDistanceKm: snapshot?.routeData?.totalDistanceKm ?? null,
  polylinePoints: snapshot?.routeData?.polylineCoords?.length ?? 0,
  oldPolylinePoints: snapshot?.oldRoutePolyline?.length ?? 0,
});

const NEARBY_STATION_PANEL_DELAY_MS = 3000;

const getApiErrorMessage = (error) => (
  error?.response?.data?.message ||
  error?.response?.data?.error ||
  error?.message ||
  'Không thể gợi ý trạm sạc cho tuyến đường này.'
);

function App() {
  const [vehicles, setVehicles] = useState([]);

  const [batteryPercent, setBatteryPercent] = useState(80);
  const [targetBatteryPercent, setTargetBatteryPercent] = useState(25);
  const [selectedVehicleId, setSelectedVehicleId] = useState(null);
  const [conditions, setConditions] = useState({
    speed: 60,
    temperature: 32,
    acOn: true,
    consumptionWhKm: null,
    trafficJam: 0,
  });

  const [estimatedRange, setEstimatedRange] = useState(0);
  const [isCalculating, setIsCalculating] = useState(false);

  const [userLocation, setUserLocation] = useState(null);
  const [geoResolved, setGeoResolved] = useState(false);
  const [destination, setDestination] = useState(null);
  const [waypoint, setWaypoint] = useState(null);
  const [routeData, setRouteData] = useState(null);
  const [oldRoutePolyline, setOldRoutePolyline] = useState(null);
  const [isRouting, setIsRouting] = useState(false);

  const [selectedStation, setSelectedStation] = useState(null);
  const [lastViewedStationId, setLastViewedStationId] = useState(null);
  const [reachability, setReachability] = useState(null);
  const [routeError, setRouteError] = useState('');

  const [sheetOpen, setSheetOpen] = useState(true);
  const [locationName, setLocationName] = useState('');
  const [showStartupLoader, setShowStartupLoader] = useState(true);
  const [isAmbientLoading, setIsAmbientLoading] = useState(false);
  const [isSuggestingNearbyStations, setIsSuggestingNearbyStations] = useState(false);
  const [sheetDragOffset, setSheetDragOffset] = useState(0);
  const [routeHistoryState, setRouteHistoryState] = useState({ entries: [], index: -1 });
  const isRestoringRouteRef = useRef(false);
  const nearbySuggestionStartedAtRef = useRef(0);
  const sheetDragStateRef = useRef({
    active: false,
    startY: 0,
    deltaY: 0,
    moved: false,
  });

  const selectedVehicle = useMemo(
    () => vehicles.find((vehicle) => vehicle.id === selectedVehicleId) || null,
    [vehicles, selectedVehicleId],
  );
  const fetchWeatherForLocation = (lat, lon) => {
    fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true`)
      .then((res) => res.json())
      .then((data) => {
        if (data.current_weather?.temperature !== undefined) {
          const realTemp = Math.round(data.current_weather.temperature);
          setConditions((prev) => ({ ...prev, temperature: realTemp }));
        }
      })
      .catch(() => {});

    fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&zoom=10&accept-language=vi`)
      .then((res) => res.json())
      .then((data) => {
        const addr = data.address || {};
        let name = addr.state || addr.city || addr.town || addr.county || '';
        name = name.replace(/^Thành phố\s+/i, 'TP. ');
        if (name) setLocationName(name);
      })
      .catch(() => {});
  };

  const acquireCurrentLocation = () => {
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const lat = position.coords.latitude;
          const lon = position.coords.longitude;
          setUserLocation([lat, lon]);
          setGeoResolved(true);
          fetchWeatherForLocation(lat, lon);
        },
        () => console.log('Location fallback allowed.'),
      );
    }
  };

  const handleOriginSelect = (coords) => {
    setUserLocation(coords);
    setGeoResolved(true);
    fetchWeatherForLocation(coords[0], coords[1]);
  };

  const handleDestinationSelect = (coords) => {
    setDestination(coords);
    setWaypoint(null);
    setOldRoutePolyline(null);
    setRouteData(null);
    setSelectedStation(null);
    setLastViewedStationId(null);
    setReachability(null);
    setRouteError('');
    setRouteHistoryState({ entries: [], index: -1 });
  };

  const handleParsedLink = ({ origin, destination: dest }) => {
    const resolvedDestination = dest || origin || null;
    const isFullRoute = Boolean(origin && dest);

    if (resolvedDestination) {
      if (isFullRoute) {
        setUserLocation(origin);
        setGeoResolved(true);
        fetchWeatherForLocation(origin[0], origin[1]);
      } else {
        setUserLocation(null);
        setGeoResolved(false);
        acquireCurrentLocation();
      }

      setDestination(resolvedDestination);
      setWaypoint(null);
      setOldRoutePolyline(null);
      setRouteData(null);
      setSelectedStation(null);
      setLastViewedStationId(null);
      setReachability(null);
      setRouteError('');
      setRouteHistoryState({ entries: [], index: -1 });
      setSheetOpen(true);
    }
  };

  const pushRouteSnapshot = (snapshot) => {
    const clonedSnapshot = cloneRouteSnapshot(snapshot);

    setRouteHistoryState((prev) => {
      const entries = prev.entries.slice(0, prev.index + 1);
      const lastEntry = entries[entries.length - 1];

      if (summarizeRouteSnapshot(lastEntry) === summarizeRouteSnapshot(clonedSnapshot)) {
        return prev;
      }

      return {
        entries: [...entries, clonedSnapshot],
        index: entries.length,
      };
    });
  };

  const applyRouteSnapshot = (snapshot) => {
    const clonedSnapshot = cloneRouteSnapshot(snapshot);
    if (!clonedSnapshot) return;

    isRestoringRouteRef.current = true;
    setWaypoint(clonedSnapshot.waypoint);
    setOldRoutePolyline(clonedSnapshot.oldRoutePolyline);
    setRouteData(clonedSnapshot.routeData);
    setSelectedStation(null);
    setLastViewedStationId(null);
    setReachability(null);
    setRouteError('');
    setSheetOpen(false);
  };

  useEffect(() => {
    evApi
      .getVehicles()
      .then((data) => {
        setVehicles(data);
        if (data.length > 0) {
          setSelectedVehicleId(data[0].id);
          setConditions((prev) => ({ ...prev, consumptionWhKm: getAdjustedDefaultConsumption(data[0]) }));
        }
      })
      .catch((err) => console.error(err));

    acquireCurrentLocation();
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => setShowStartupLoader(false), 2000);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!selectedVehicle) return;

    setConditions((prev) => ({ ...prev, consumptionWhKm: getAdjustedDefaultConsumption(selectedVehicle) }));
  }, [selectedVehicle]);

  useEffect(() => {
    if (!selectedVehicleId) return;

    setIsCalculating(true);
    const debounceTimer = setTimeout(() => {
      // Disable calculations for VF3
      if (selectedVehicle?.name === 'VF3') {
        setEstimatedRange(0);
        setIsCalculating(false);
        return;
      }

      evApi
        .estimateRange({
          batteryPercent,
          vehicleId: selectedVehicleId,
          ...conditions,
        })
        .then((res) => setEstimatedRange(res.estimatedRangeKm))
        .catch(console.error)
        .finally(() => setIsCalculating(false));
    }, 300);

    return () => clearTimeout(debounceTimer);
  }, [batteryPercent, selectedVehicleId, conditions]);

  const calculateRouteAndStations = (routeIndex = 0, options = {}) => {
    if (!destination || !userLocation || !selectedVehicleId) return;

    const nextWaypoint = options.waypointOverride ?? waypoint;
    const nextOldRoutePolyline = options.previousPolyline ?? oldRoutePolyline;

    setIsRouting(true);
    setSelectedStation(null);
    setReachability(null);
    setRouteError('');
    if (options.previousPolyline !== undefined) {
      setOldRoutePolyline(nextOldRoutePolyline);
    }

    evApi
      .getOptimalRoute({
        origin: userLocation,
        destination,
        waypoint: nextWaypoint,
        currentBattery: batteryPercent,
        targetBattery: targetBatteryPercent,
        vehicleId: selectedVehicleId,
        vehicleName: selectedVehicle?.name,
        conditions,
        routeIndex,
      })
      .then((data) => {
        if (!data?.polylineCoords?.length) {
          throw new Error('Không nhận được dữ liệu tuyến đường từ máy chủ.');
        }

        setRouteData(data);
        setSheetOpen(false);
        pushRouteSnapshot({
          routeData: data,
          waypoint: nextWaypoint,
          oldRoutePolyline: nextOldRoutePolyline,
        });
      })
      .catch((error) => {
        console.error(error);
        setRouteError(getApiErrorMessage(error));
        setSheetOpen(true);
      })
      .finally(() => setIsRouting(false));
  };

  const handleSuggestStations = () => {
    if (userLocation) {
      if (destination) {
        calculateRouteAndStations();
      } else {
        nearbySuggestionStartedAtRef.current = Date.now();
        setRouteError('');
        setSheetOpen(true);
        setIsSuggestingNearbyStations(true);
      }
      return;
    }

    alert('Vui lòng bật định vị hoặc chọn điểm xuất phát để gợi ý trạm sạc gần bạn.');
  };

  useEffect(() => {
    if (!isSuggestingNearbyStations) return;

    if (!isAmbientLoading) {
      const elapsed = Date.now() - nearbySuggestionStartedAtRef.current;
      const remaining = Math.max(0, NEARBY_STATION_PANEL_DELAY_MS - elapsed);
      const timer = setTimeout(() => {
        setSheetOpen(false);
        setIsSuggestingNearbyStations(false);
      }, remaining);

      return () => clearTimeout(timer);
    }

    return undefined;
  }, [isAmbientLoading, isSuggestingNearbyStations]);

  const handleSheetDragStart = (clientY) => {
    if (typeof window !== 'undefined' && window.innerWidth >= 768) return;

    sheetDragStateRef.current = {
      active: true,
      startY: clientY,
      deltaY: 0,
      moved: false,
    };
    setSheetDragOffset(0);
  };

  const handleSheetDragMove = (clientY) => {
    if (!sheetDragStateRef.current.active) return;

    const rawDelta = clientY - sheetDragStateRef.current.startY;
    const limitedDelta = Math.max(-220, Math.min(220, rawDelta));

    sheetDragStateRef.current.deltaY = limitedDelta;
    sheetDragStateRef.current.moved = Math.abs(limitedDelta) > 8;
    setSheetDragOffset(limitedDelta);
  };

  const handleSheetDragEnd = () => {
    if (!sheetDragStateRef.current.active) return;

    const { deltaY } = sheetDragStateRef.current;
    sheetDragStateRef.current.active = false;

    if (deltaY <= -50) {
      setSheetOpen(true);
    } else if (deltaY >= 50) {
      setSheetOpen(false);
    }

    setSheetDragOffset(0);
  };

  const handleSheetHandleClick = () => {
    if (sheetDragStateRef.current.moved) {
      sheetDragStateRef.current.moved = false;
      return;
    }

    setSheetOpen(!sheetOpen);
  };

  useEffect(() => {
    if (isRestoringRouteRef.current) {
      isRestoringRouteRef.current = false;
      return;
    }

    if (waypoint) {
      const previousPolyline = routeData?.polylineCoords || oldRoutePolyline || null;
      if (previousPolyline) {
        setOldRoutePolyline(previousPolyline);
      }
      calculateRouteAndStations(0, {
        previousPolyline,
        waypointOverride: waypoint,
      });
    }
  }, [waypoint]);

  const handleStationSelect = async (station) => {
    setSelectedStation(station);
    setLastViewedStationId(station.id);
    setSheetOpen(false);

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

    if (!userLocation || !selectedVehicleId) {
      setReachability(null);
      return;
    }

    setReachability(null);
    try {
      const data = await evApi.checkReachability({
        currentLocation: userLocation,
        destination: [station.latitude, station.longitude],
        batteryPercent,
        targetBattery: targetBatteryPercent,
        vehicleId: selectedVehicleId,
        vehicleName: selectedVehicle?.name,
        ...conditions,
      });
      setReachability(data);
    } catch (error) {
      console.error(error);
      setReachability({
        canReach: false,
        distanceKm: station.distanceFromStartKm || 0,
        batteryLeftPercent: 0,
      });
    }
  };

  const resetRoute = () => {
    setDestination(null);
    setWaypoint(null);
    setOldRoutePolyline(null);
    setRouteData(null);
    setSelectedStation(null);
    setLastViewedStationId(null);
    setReachability(null);
    setRouteError('');
    setRouteHistoryState({ entries: [], index: -1 });
  };

  const handleUndoRoute = () => {
    if (routeHistoryState.index <= 0) return;

    const nextIndex = routeHistoryState.index - 1;
    applyRouteSnapshot(routeHistoryState.entries[nextIndex]);
    setRouteHistoryState((prev) => ({ ...prev, index: nextIndex }));
  };

  const handleRedoRoute = () => {
    if (routeHistoryState.index >= routeHistoryState.entries.length - 1) return;

    const nextIndex = routeHistoryState.index + 1;
    applyRouteSnapshot(routeHistoryState.entries[nextIndex]);
    setRouteHistoryState((prev) => ({ ...prev, index: nextIndex }));
  };

  const isStationLoading = isRouting || isSuggestingNearbyStations;
  const stationLoadingLabel = isRouting
    ? 'ĐANG GỢI Ý TRẠM SẠC'
    : 'ĐANG TẢI TRẠM GẦN BẠN';

  const plannerContent = (
    <div className="space-y-3">
      {routeError && (
        <div className="rounded-2xl border border-[#DA303E]/30 bg-[#DA303E]/10 px-4 py-3 text-sm text-red-200 shadow-[0_18px_40px_rgba(0,0,0,0.24)]">
          {routeError}
        </div>
      )}

      {!showStartupLoader && !routeData && geoResolved && isAmbientLoading && (
        <div className="rounded-2xl border border-white/10 bg-[#0B0B0B] px-4 py-3 shadow-[0_18px_40px_rgba(0,0,0,0.32)]">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/45">Khởi động hệ thống</p>
              <p className="mt-1 text-xs text-white/68">Ứng dụng đang tải dữ liệu trạm sạc gần bạn.</p>
            </div>
            <button
              type="button"
              onClick={() => setSheetOpen(false)}
              className="shrink-0 rounded-full border border-white/10 bg-[#151515] px-3 py-2 text-[11px] font-semibold text-white/80 transition-colors hover:bg-[#1c1c1c] hover:text-white"
            >
              Xem bản đồ
            </button>
          </div>

          <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/8">
            <div className="h-full w-2/3 animate-[pulse_1.2s_ease-in-out_infinite] rounded-full bg-gradient-to-r from-[#1464F4] via-[#00B14F] to-[#1464F4]"></div>
          </div>
        </div>
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
        locationName={locationName}
        userLocation={userLocation}
        destination={destination}
        onOriginSelect={handleOriginSelect}
        onLocateMe={acquireCurrentLocation}
        onDestinationSelect={handleDestinationSelect}
        onParsedLink={handleParsedLink}
        onSuggestStations={handleSuggestStations}
        isLoadingStations={isStationLoading}
        loadingLabel={stationLoadingLabel}
      />
    </div>
  );

  const shouldPrioritizePlanner = sheetOpen && !routeData && !selectedStation;
  const collapsedPeekClass = selectedStation
    ? 'translate-y-[calc(100%-88px)]'
    : 'translate-y-[calc(100%-118px)]';
  const sheetTransformStyle = sheetDragOffset !== 0
    ? { transform: `translateY(${sheetDragOffset}px)` }
    : undefined;

  return (
    <Layout onOpenMap={() => setSheetOpen(false)}>
      <div className="relative flex h-full w-full flex-row">
        {showStartupLoader && (
          <div className="absolute inset-0 z-[2200] flex items-center justify-center bg-[#050505]">
            <div className="w-[min(340px,calc(100%-40px))] rounded-3xl border border-white/10 bg-[#0B0B0B] px-5 py-5 shadow-[0_22px_60px_rgba(0,0,0,0.45)]">
              <div className="h-2 overflow-hidden rounded-full bg-white/8">
                <div className="h-full w-2/3 animate-[pulse_1.15s_ease-in-out_infinite] rounded-full bg-gradient-to-r from-[#1464F4] via-[#00B14F] to-[#1464F4]"></div>
              </div>
              <p className="mt-3 text-center text-[11px] font-medium text-white/62">Đang tải bản đồ và trạm sạc...</p>
            </div>
          </div>
        )}

        <div
          className={`
             absolute bottom-0 z-[500] w-full flex-col border-t border-white/10 bg-[#050505]
             transition-transform duration-500 ease-in-out md:static md:z-auto md:h-full md:w-[400px] md:translate-y-0 md:border-r md:border-t-0 md:bg-[#070707]
             rounded-t-3xl md:rounded-none shadow-[0_-20px_50px_rgba(0,0,0,0.8)] md:shadow-none
             flex
             ${showStartupLoader ? 'pointer-events-none opacity-0' : ''}
             ${shouldPrioritizePlanner ? 'h-full translate-y-0' : ''}
             ${!shouldPrioritizePlanner && sheetOpen ? 'h-[82vh] translate-y-0' : ''}
             ${!shouldPrioritizePlanner && !sheetOpen ? `h-[82vh] ${collapsedPeekClass}` : ''}
             `}
          style={sheetTransformStyle}
        >
          <div
            className={`md:hidden flex w-full shrink-0 cursor-pointer flex-col items-center justify-center border-b border-white/5 ${shouldPrioritizePlanner ? 'p-4' : 'px-4 py-3'}`}
            onClick={handleSheetHandleClick}
            onMouseDown={(event) => handleSheetDragStart(event.clientY)}
            onMouseMove={(event) => handleSheetDragMove(event.clientY)}
            onMouseUp={handleSheetDragEnd}
            onMouseLeave={handleSheetDragEnd}
            onTouchStart={(event) => {
              const touch = event.touches[0];
              if (!touch) return;
              handleSheetDragStart(touch.clientY);
            }}
            onTouchMove={(event) => {
              const touch = event.touches[0];
              if (!touch) return;
              handleSheetDragMove(touch.clientY);
            }}
            onTouchEnd={handleSheetDragEnd}
            onTouchCancel={handleSheetDragEnd}
          >
            <div className="mb-2 h-1.5 w-16 rounded-full bg-white/20"></div>
            <div className="relative flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.2em] text-white/40">
              {shouldPrioritizePlanner ? 'Thiết lập hành trình' : (sheetOpen ? 'Vuốt xuống để cuộn bản đồ' : 'Kéo lên để xem Bảng Tính Toán')}
            </div>
          </div>

          <div className="relative flex h-full w-full flex-1 flex-col overflow-hidden md:bg-[#070707]">
            <div className="pointer-events-none absolute left-0 top-0 h-32 w-full bg-gradient-to-b from-[#1464F4]/5 to-transparent"></div>

            <div className="hide-scrollbar relative z-10 flex-1 overflow-y-auto px-3 pb-6 pt-3 md:px-4 md:pt-4">
              {plannerContent}
            </div>
          </div>
        </div>

        <div className="relative z-[100] h-full w-full flex-1 bg-gray-950">
          {isRouting && (
            <div className="pointer-events-none absolute bottom-6 left-1/2 z-[2000] -translate-x-1/2">
              <div className="flex items-center gap-3 rounded-full border border-[#1464F4]/30 bg-black px-5 py-3 text-xs font-bold text-white shadow-[0_0_30px_rgba(20,100,244,0.4)]">
                <div className="h-4 w-4 animate-spin rounded-full border-[3px] border-[#1464F4] border-t-transparent"></div>
                Đang tính lộ trình...
              </div>
            </div>
          )}

          <div className="absolute inset-0 z-0">
            {geoResolved && (
              <MapView
                userLocation={userLocation}
                estimatedRange={estimatedRange}
                onStationSelect={handleStationSelect}
                geoResolved={geoResolved}
                routeData={routeData}
                destination={destination}
                waypoint={waypoint}
                setWaypoint={setWaypoint}
                oldRoutePolyline={oldRoutePolyline}
                selectedStation={selectedStation}
                lastViewedStationId={lastViewedStationId}
                reachability={reachability}
                onStationClose={() => {
                  setSelectedStation(null);
                  setReachability(null);
                }}
                onRouteReplan={(idx) => calculateRouteAndStations(idx, {
                  previousPolyline: routeData?.polylineCoords || oldRoutePolyline || null,
                })}
                onAmbientLoadingChange={setIsAmbientLoading}
                setDestination={(dest) => {
                  setDestination(dest);
                  setWaypoint(null);
                  setOldRoutePolyline(null);
                  setRouteData(null);
                  setSelectedStation(null);
                  setLastViewedStationId(null);
                  setReachability(null);
                  setRouteHistoryState({ entries: [], index: -1 });
                  setSheetOpen(false);
                }}
                hideHelpOverlay={showStartupLoader}
              />
            )}
          </div>

          {destination && (
            <button
              onClick={resetRoute}
              className="absolute bottom-[132px] right-4 z-[400] rounded-full bg-[#DA303E] px-5 py-2.5 text-xs font-bold text-white shadow-[0_10px_20px_rgba(218,48,62,0.4)] transition-colors hover:bg-[#A0222C] lg:bottom-6 lg:right-32 lg:text-sm"
            >
              Huỷ Dẫn Đường
            </button>
          )}

          <a
            href="https://docs.google.com/forms/d/e/1FAIpQLSeCHoKFNfFocH-MCWnM-yUSCPrR9ZtuFUvgGqNqSnOXW_L0aw/viewform"
            target="_blank"
            rel="noopener noreferrer"
            className="absolute bottom-6 right-6 z-[400]"
          >
            <div className="flex items-center gap-2.5 rounded-full bg-gradient-to-r from-[#1464F4] to-[#0D4BC4] px-5 py-3 text-white shadow-[0_8px_25px_rgba(20,100,244,0.5)] transition-colors duration-300 hover:from-[#1974FF] hover:to-[#1464F4] hover:shadow-[0_12px_35px_rgba(20,100,244,0.6)]">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
              </svg>
              <span className="text-xs font-bold tracking-wide">Góp ý</span>
            </div>
          </a>

          {sheetOpen && !shouldPrioritizePlanner && (
            <div
              className="absolute inset-0 z-[450] bg-black/60 transition-opacity md:hidden"
              onClick={() => setSheetOpen(false)}
            ></div>
          )}
        </div>
      </div>
    </Layout>
  );
}

export default App;
