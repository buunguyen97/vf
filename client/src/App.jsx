import { useEffect, useMemo, useState } from 'react';
import Layout from './components/layout/Layout';
import MapView from './components/map/MapView';
import PlannerControls from './components/planner/PlannerControls';
import StationCard from './components/station/StationCard';
import { evApi } from './services/api';

function App() {
  const [vehicles, setVehicles] = useState([]);

  const [batteryPercent, setBatteryPercent] = useState(80);
  const [targetBatteryPercent, setTargetBatteryPercent] = useState(25);
  const [selectedVehicleId, setSelectedVehicleId] = useState(null);
  const [conditions, setConditions] = useState({
    speed: 60,
    temperature: 32,
    acOn: true,
    trafficJam: 0,
    consumptionWhKm: null,
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
  const [reachability, setReachability] = useState(null);

  const [sheetOpen, setSheetOpen] = useState(true);
  const [locationName, setLocationName] = useState('');
  const [showStartupPanel, setShowStartupPanel] = useState(true);

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
    setSelectedStation(null);
    setReachability(null);
  };

  const handleParsedLink = ({ origin, destination: dest }) => {
    if (origin) {
      setUserLocation(origin);
      setGeoResolved(true);
      fetchWeatherForLocation(origin[0], origin[1]);
    }

    if (dest) {
      setDestination(dest);
      setSelectedStation(null);
      setReachability(null);
    }
  };

  useEffect(() => {
    evApi
      .getVehicles()
      .then((data) => {
        setVehicles(data);
        if (data.length > 0) {
          setSelectedVehicleId(data[0].id);
          setConditions((prev) => ({ ...prev, consumptionWhKm: data[0].base_consumption_wh_km }));
        }
      })
      .catch((err) => console.error(err));

    acquireCurrentLocation();
  }, []);

  useEffect(() => {
    if (!selectedVehicle) return;

    setConditions((prev) => ({ ...prev, consumptionWhKm: selectedVehicle.base_consumption_wh_km }));
  }, [selectedVehicle]);

  useEffect(() => {
    if (!selectedVehicleId) return;

    setIsCalculating(true);
    const debounceTimer = setTimeout(() => {
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

  const calculateRouteAndStations = (routeIndex = 0) => {
    if (!destination || !userLocation || !selectedVehicleId) return;

    setIsRouting(true);
    setShowStartupPanel(false);
    setSelectedStation(null);
    setReachability(null);

    evApi
      .getOptimalRoute({
        origin: userLocation,
        destination,
        waypoint,
        currentBattery: batteryPercent,
        targetBattery: targetBatteryPercent,
        vehicleId: selectedVehicleId,
        conditions,
        routeIndex,
      })
      .then((data) => {
        setRouteData(data);
        setSheetOpen(false);
      })
      .catch(console.error)
      .finally(() => setIsRouting(false));
  };

  const handleSuggestStations = () => {
    setShowStartupPanel(false);

    if (userLocation) {
      if (destination) {
        calculateRouteAndStations();
      } else {
        setSheetOpen(false);
      }
      return;
    }

    alert('Vui lòng bật định vị hoặc chọn điểm xuất phát để gợi ý trạm sạc gần bạn.');
  };

  useEffect(() => {
    if (waypoint) {
      if (routeData?.polylineCoords) {
        setOldRoutePolyline(routeData.polylineCoords);
      }
      calculateRouteAndStations(0);
    }
  }, [waypoint]);

  const handleStationSelect = async (station) => {
    setSelectedStation(station);
    setSheetOpen(false);

    if (routeData && station?.batteryAtStation !== undefined) {
      setReachability({
        canReach: station.batteryAtStation > 0,
        distanceKm: station.distanceFromStartKm || 0,
        batteryLeftPercent: Math.round(station.batteryAtStation),
        fromRoutePlanner: true,
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
        vehicleId: selectedVehicleId,
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
    setReachability(null);
  };

  const plannerContent = (
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
      startupMode={false}
    />
  );

  return (
    <Layout>
      <div className="relative flex h-full w-full flex-row">
        <div
          className={`
            absolute bottom-0 z-[500] flex h-[75vh] w-full flex-col border-t border-white/10 bg-[#050505]/95 backdrop-blur-3xl
            transition-transform duration-500 ease-in-out md:static md:z-auto md:h-full md:w-[400px] md:translate-y-0 md:border-r md:border-t-0 md:bg-transparent md:backdrop-blur-none
            rounded-t-3xl md:rounded-none shadow-[0_-20px_50px_rgba(0,0,0,0.8)] md:shadow-none
            ${sheetOpen ? 'translate-y-0' : 'translate-y-[calc(100%-80px)]'}
          `}
        >
          <div
            className="md:hidden flex w-full shrink-0 cursor-pointer flex-col items-center justify-center border-b border-white/5 p-4"
            onClick={() => setSheetOpen(!sheetOpen)}
          >
            <div className="mb-2 h-1.5 w-16 rounded-full bg-white/20"></div>
            <div className="relative flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.2em] text-white/40">
              {sheetOpen ? 'Vuốt xuống để cuộn bản đồ' : 'Kéo lên để xem Bảng Tính Toán'}
            </div>
          </div>

          <div className="relative flex h-full w-full flex-1 flex-col overflow-hidden md:bg-black/50 md:backdrop-blur-3xl">
            <div className="pointer-events-none absolute left-0 top-0 h-32 w-full bg-gradient-to-b from-[#1464F4]/5 to-transparent"></div>

            <div className="hide-scrollbar relative z-10 flex-1 overflow-y-auto px-3 pb-6 pt-3 md:px-4 md:pt-4">
              {plannerContent}
            </div>
          </div>
        </div>

        <div className="relative z-[100] h-full w-full flex-1 bg-gray-950">
          <div className="pointer-events-none absolute left-4 top-4 z-[400] md:hidden">
            <div className="flex items-center gap-3 rounded-2xl border border-green-500/30 bg-black/80 p-3 text-white shadow-xl backdrop-blur">
              {isCalculating ? (
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
              ) : (
                <div className="rounded bg-[#00B14F] px-2 py-0.5 text-xl font-bold text-black">
                  {estimatedRange} <span className="text-sm">km</span>
                </div>
              )}
              <span className="max-w-[100px] flex-wrap text-xs leading-tight text-gray-300">Km có thể đi được</span>
            </div>
          </div>

          <div className="pointer-events-none absolute right-4 top-4 z-[400]">
            {routeData && (
              <div className="flex flex-col items-center rounded-2xl border border-[#1464F4]/50 bg-black/80 p-3 shadow-[0_10px_30px_rgba(20,100,244,0.3)] backdrop-blur-lg">
                <span className="mb-0.5 text-[10px] font-bold uppercase tracking-widest text-white/40">Khoảng cách</span>
                <span className="mb-1 text-2xl font-black leading-none text-white">
                  {routeData.totalDistanceKm} <span className="text-[10px] font-normal text-white/50">km</span>
                </span>
                <span className="rounded-full bg-[#00B14F]/20 px-2 py-0.5 text-[10px] font-bold leading-none text-[#00B14F] shadow-[inset_0_0_10px_rgba(0,177,79,0.2)]">
                  {routeData.optimalStations?.length || 0} Trạm
                </span>
              </div>
            )}
          </div>

          {isRouting && (
            <div className="pointer-events-none absolute bottom-6 left-1/2 z-[2000] -translate-x-1/2">
              <div className="flex items-center gap-3 rounded-full border border-[#1464F4]/30 bg-black/90 px-5 py-3 text-xs font-bold text-white shadow-[0_0_30px_rgba(20,100,244,0.4)] backdrop-blur-lg">
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
                onRouteReplan={(idx) => calculateRouteAndStations(idx)}
                setDestination={(dest) => {
                  setDestination(dest);
                  setSelectedStation(null);
                setReachability(null);
                  setSheetOpen(false);
                  setShowStartupPanel(false);
                }}
                hideHelpOverlay={showStartupPanel}
              />
            )}
          </div>

          {selectedStation && (
            <StationCard
              station={selectedStation}
              reachability={reachability}
              onClose={() => {
                setSelectedStation(null);
                setReachability(null);
              }}
            />
          )}

          {destination && (
            <button
              onClick={resetRoute}
              className="absolute right-4 top-[85px] z-[400] rounded-full bg-[#DA303E] px-6 py-2.5 text-xs font-bold text-white shadow-[0_10px_20px_rgba(218,48,62,0.4)] transition-all hover:scale-105 hover:bg-[#A0222C] active:scale-95 lg:bottom-6 lg:left-6 lg:right-auto lg:top-auto lg:text-sm"
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
            <div className="flex items-center gap-2.5 rounded-full bg-gradient-to-r from-[#1464F4] to-[#0D4BC4] px-5 py-3 text-white shadow-[0_8px_25px_rgba(20,100,244,0.5)] transition-all duration-300 hover:scale-105 hover:from-[#1974FF] hover:to-[#1464F4] hover:shadow-[0_12px_35px_rgba(20,100,244,0.6)] active:scale-95">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
              </svg>
              <span className="text-xs font-bold tracking-wide">Góp ý</span>
            </div>
          </a>

          {showStartupPanel && (
            <div className="absolute inset-0 z-[1600] flex items-center justify-center bg-black/70 px-4 backdrop-blur-md">
              <div className="max-h-[90vh] w-full max-w-[540px] overflow-y-auto rounded-[28px] border border-white/10 bg-[#070707]/95 p-4 shadow-[0_25px_80px_rgba(0,0,0,0.55)] md:p-5">
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
                  startupMode={true}
                  onDismiss={() => setShowStartupPanel(false)}
                />
              </div>
            </div>
          )}

          {sheetOpen && (
            <div
              className="absolute inset-0 z-[450] bg-black/50 backdrop-blur-sm transition-opacity md:hidden"
              onClick={() => setSheetOpen(false)}
            ></div>
          )}
        </div>
      </div>
    </Layout>
  );
}

export default App;
