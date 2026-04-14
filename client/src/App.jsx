import { useState, useEffect } from 'react'
import Layout from './components/layout/Layout'
import BatteryInput from './components/range/BatteryInput'
import TargetBatteryInput from './components/range/TargetBatteryInput'
import VehicleSelector from './components/range/VehicleSelector'
import ConditionPanel from './components/range/ConditionPanel'
import ConsumptionPanel from './components/range/ConsumptionPanel'
import RangeDisplay from './components/range/RangeDisplay'
import MapView from './components/map/MapView'
import LocationSearch from './components/map/LocationSearch'
import StationCard from './components/station/StationCard'
import RouteItinerary from './components/route/RouteItinerary'
import { evApi } from './services/api'
import { ChevronUp } from 'lucide-react'

function App() {
  const [vehicles, setVehicles] = useState([])
  
  // App state
  const [batteryPercent, setBatteryPercent] = useState(80)
  const [targetBatteryPercent, setTargetBatteryPercent] = useState(25)
  const [selectedVehicleId, setSelectedVehicleId] = useState(null)
  const [conditions, setConditions] = useState({
    speed: 60,
    temperature: 32,
    acOn: true,
    consumptionWhKm: null // Set from vehicle default, user can override
  })
  
  const [estimatedRange, setEstimatedRange] = useState(0)
  const [isCalculating, setIsCalculating] = useState(false)
  
  // Route / Map State
  const [userLocation, setUserLocation] = useState(null) 
  const [geoResolved, setGeoResolved] = useState(false)
  const [destination, setDestination] = useState(null)
  const [routeData, setRouteData] = useState(null)
  const [isRouting, setIsRouting] = useState(false)

  const [selectedStation, setSelectedStation] = useState(null)
  const [reachability, setReachability] = useState(null)
  const [focusCoords, setFocusCoords] = useState(null)
  
  // Mobile UX State
  const [sheetOpen, setSheetOpen] = useState(false)
  const [locationName, setLocationName] = useState('')

  // Fetch weather + city name for any lat/lon
  const fetchWeatherForLocation = (lat, lon) => {
    // Fetch real outdoor temperature from Open-Meteo
    fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true`)
      .then(res => res.json())
      .then(data => {
        if (data.current_weather?.temperature !== undefined) {
          const realTemp = Math.round(data.current_weather.temperature);
          setConditions(prev => ({ ...prev, temperature: realTemp }));
        }
      })
      .catch(() => {});

    // Reverse geocode to get city name
    fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&zoom=10&accept-language=vi`)
      .then(res => res.json())
      .then(data => {
        const addr = data.address || {};
        let name = addr.state || addr.city || addr.town || addr.county || '';
        name = name.replace(/^Thành phố\s+/i, 'TP. ');
        if (name) setLocationName(name);
      })
      .catch(() => {});
  };

  // Geolocation helper
  const acquireCurrentLocation = () => {
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        position => {
          const lat = position.coords.latitude;
          const lon = position.coords.longitude;
          setUserLocation([lat, lon]);
          setGeoResolved(true);
          fetchWeatherForLocation(lat, lon);
        },
        () => console.log('Location fallback allowed.')
      );
    }
  };

  // Handler for when user manually selects a departure location
  const handleOriginSelect = (coords) => {
    setUserLocation(coords);
    setGeoResolved(false); // Not GPS anymore
    fetchWeatherForLocation(coords[0], coords[1]);
  };

  // Initialization
  useEffect(() => {
    evApi.getVehicles()
      .then(data => {
        setVehicles(data)
        if (data.length > 0) {
          setSelectedVehicleId(data[0].id)
          // Set default consumption from first vehicle
          setConditions(prev => ({ ...prev, consumptionWhKm: data[0].base_consumption_wh_km }))
        }
      })
      .catch(err => console.error(err))
      
    acquireCurrentLocation();
  }, [])

  // When vehicle changes, update consumption to that vehicle's default
  useEffect(() => {
    if (!selectedVehicleId || vehicles.length === 0) return;
    const vehicle = vehicles.find(v => v.id === selectedVehicleId);
    if (vehicle) {
      setConditions(prev => ({ ...prev, consumptionWhKm: vehicle.base_consumption_wh_km }));
    }
  }, [selectedVehicleId])

  // Range Calculator
  useEffect(() => {
    if (!selectedVehicleId) return;

    setIsCalculating(true);
    const debounceTimer = setTimeout(() => {
      evApi.estimateRange({
        batteryPercent,
        vehicleId: selectedVehicleId,
        ...conditions
      })
      .then(res => setEstimatedRange(res.estimatedRangeKm))
      .catch(console.error)
      .finally(() => setIsCalculating(false));
    }, 300);

    return () => clearTimeout(debounceTimer);
  }, [batteryPercent, selectedVehicleId, conditions]);

  // Optimal Router Calculator Planner (debounced)
  useEffect(() => {
    if (!destination || !userLocation || !selectedVehicleId) return;

    setIsRouting(true);
    const debounceTimer = setTimeout(() => {
      evApi.getOptimalRoute({
        origin: userLocation,
        destination: destination,
        currentBattery: batteryPercent,
        targetBattery: targetBatteryPercent,
        vehicleId: selectedVehicleId,
        conditions: conditions
      }).then(data => {
         setRouteData(data);
         setSheetOpen(false);
      }).catch(console.error)
        .finally(() => setIsRouting(false));
    }, 800);

    return () => {
      clearTimeout(debounceTimer);
      setIsRouting(false);
    };
  }, [destination, batteryPercent, targetBatteryPercent, selectedVehicleId, conditions]);

  // Handle station selection
  const handleStationSelect = (station) => {
    setSelectedStation(station);
    setSheetOpen(false); // Hide sheet to look at card
    // Focus map on this station
    setFocusCoords([station.latitude, station.longitude]);
    
    // If station already has batteryAtStation from route planner, use it directly
    if (station.batteryAtStation !== undefined) {
      setReachability({
        canReach: station.batteryAtStation > 0,
        batteryLeftPercent: station.batteryAtStation,
        distanceKm: station.distanceFromStartKm || 0,
        fromRoutePlanner: true
      });
      return;
    }

    // Otherwise, fetch from reachability API (for ambient stations without route)
    evApi.checkReachability({
      currentLocation: userLocation,
      destination: [station.latitude, station.longitude],
      batteryPercent,
      vehicleId: selectedVehicleId,
      ...conditions
    })
    .then(setReachability)
    .catch(console.error);
  };

  return (
    <Layout>
      <div className="w-full h-full flex flex-row relative">
      
        {/* Desktop Sidebar OR Mobile Bottom Sheet */}
        <div 
          className={`
            absolute md:static z-[500] md:z-auto bottom-0 w-full md:w-[400px] h-[75vh] md:h-full 
            bg-[#050505]/95 backdrop-blur-3xl md:bg-transparent md:backdrop-blur-none border-t md:border-r md:border-t-0 border-white/10 
            transition-transform duration-500 ease-in-out md:transition-none
            flex flex-col md:translate-y-0 rounded-t-3xl md:rounded-none shadow-[0_-20px_50px_rgba(0,0,0,0.8)] md:shadow-none
            ${sheetOpen ? 'translate-y-0' : 'translate-y-[calc(100%-80px)]'}
          `}
        >
          {/* Mobile Handlebar */}
          <div 
            className="md:hidden w-full flex flex-col items-center justify-center p-4 cursor-pointer shrink-0 border-b border-white/5"
            onClick={() => setSheetOpen(!sheetOpen)}
          >
            <div className="w-16 h-1.5 bg-white/20 rounded-full mb-2"></div>
            <div className="flex items-center gap-2 text-[10px] font-bold text-white/40 uppercase tracking-[0.2em] relative">
               {sheetOpen ? 'Vuốt xuống để cuộn bản đồ' : 'Kéo lên để xem Bảng Tính Toán'}
            </div>
          </div>

          {/* Wrapper for background gradient on Desktop */}
          <div className="flex-1 w-full h-full md:bg-black/50 md:backdrop-blur-3xl flex flex-col overflow-hidden relative">
             <div className="absolute top-0 left-0 w-full h-32 bg-gradient-to-b from-[#1464F4]/5 to-transparent pointer-events-none"></div>
             
             <div className="flex-1 overflow-y-auto px-3 md:px-4 pb-6 space-y-2 hide-scrollbar pt-3 md:pt-4 relative z-10">
                {/* 1. Chọn xe */}
                <VehicleSelector 
                  vehicles={vehicles} 
                  selectedVehicleId={selectedVehicleId} 
                  onSelect={setSelectedVehicleId} 
                />
                
                {/* 2. Mức pin hiện tại */}
                <BatteryInput 
                  batteryPercent={batteryPercent} 
                  setBatteryPercent={setBatteryPercent} 
                />

                {/* 3. Tiêu hao điện (km/1%) */}
                <ConsumptionPanel 
                  conditions={conditions} 
                  setConditions={setConditions}
                  vehicles={vehicles}
                  selectedVehicleId={selectedVehicleId}
                />
                {/* 7. Pin lịch trình target */}
                <TargetBatteryInput 
                  targetBatteryPercent={targetBatteryPercent}
                  setTargetBatteryPercent={setTargetBatteryPercent}
                />

                {/* 4. Kết quả phạm vi (ẩn theo yêu cầu) */}
                {/* <RangeDisplay range={estimatedRange} loading={isCalculating} /> */}

                {/* 5. Điểm xuất phát */}
                <LocationSearch 
                  title="Điểm Xuất Phát" 
                  placeholder="Vị trí hiện tại..." 
                  iconColor="#00B14F"
                  onLocationSelect={handleOriginSelect}
                  defaultDisplay={geoResolved ? '📍 Vị trí hiện tại của bạn' : ''}
                  showLocateButton={true}
                  onLocateMe={acquireCurrentLocation}
                />
                
                {/* 6. Điểm đến */}
                <LocationSearch 
                  title="Ghim Tọa Độ Điểm Đến" 
                  placeholder="Tên địa danh..." 
                  iconColor="#1464F4"
                  onLocationSelect={setDestination} 
                />

                {/* 8. Điều kiện lái xe (nâng cao) */}
                <ConditionPanel 
                  conditions={conditions} 
                  setConditions={setConditions}
                  locationName={locationName}
                />

             </div>
          </div>
        </div>

        {/* Main Map Area */}
        <div className="flex-1 w-full h-full relative z-[100] bg-gray-950">
          
          {/* Floating Route Itinerary over Map (Desktop) */}
          {routeData && routeData.optimalStations && (
            <div className="absolute top-3 left-3 z-[400] hidden md:block w-[340px] max-h-[calc(100%-24px)] overflow-y-auto hide-scrollbar pointer-events-auto">
              <RouteItinerary 
                stations={routeData.optimalStations} 
                chargingStops={routeData.chargingStops}
                onStationSelect={handleStationSelect}
                insufficientBattery={routeData.insufficientBattery}
              />
            </div>
          )}

          {/* Mobile Mini Range indicator when map is focused */}
          <div className="absolute top-4 left-4 z-[400] md:hidden pointer-events-none">
             <div className="bg-black/80 backdrop-blur border border-green-500/30 text-white p-3 rounded-2xl shadow-xl flex items-center gap-3">
               {isCalculating ? (
                 <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
               ) : (
                  <div className="text-xl font-bold bg-[#00B14F] px-2 py-0.5 rounded text-black">{estimatedRange} <span className="text-sm">km</span></div>
               )}
               <span className="text-xs text-gray-300 max-w-[100px] leading-tight flex-wrap">Km có thể đi được</span>
             </div>
          </div>

          <div className="absolute top-4 right-4 z-[400] pointer-events-none">
            {routeData && (
               <div className="flex flex-col items-center bg-black/80 backdrop-blur-lg border border-[#1464F4]/50 rounded-2xl p-3 shadow-[0_10px_30px_rgba(20,100,244,0.3)]">
                 <span className="text-white/40 text-[10px] font-bold uppercase tracking-widest mb-0.5">Khoảng cách</span>
                 <span className="text-2xl font-black text-white leading-none mb-1">{routeData.totalDistanceKm} <span className="text-[10px] font-normal text-white/50">km</span></span>
                 <span className="text-[10px] font-bold text-[#00B14F] leading-none px-2 py-0.5 bg-[#00B14F]/20 rounded-full shadow-[inset_0_0_10px_rgba(0,177,79,0.2)]">{routeData.optimalStations?.length || 0} Trạm</span>
               </div>
            )}
          </div>

          {isRouting && (
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-[2000] pointer-events-none">
                <div className="text-white text-xs bg-black/90 backdrop-blur-lg px-5 py-3 rounded-full flex gap-3 items-center border border-[#1464F4]/30 shadow-[0_0_30px_rgba(20,100,244,0.4)] font-bold">
                  <div className="w-4 h-4 border-3 border-[#1464F4] border-t-transparent rounded-full animate-spin"></div> 
                  Đang tính lộ trình...
                </div>
            </div>
          )}

          <MapView 
            userLocation={userLocation}
            estimatedRange={estimatedRange}
            onStationSelect={handleStationSelect}
            selectedStationId={selectedStation?.id}
            geoResolved={geoResolved}
            routeData={routeData}
            destination={destination}
            focusCoords={focusCoords}
            setDestination={(dest) => {
              setDestination(dest);
              setSheetOpen(false); // Map clicked, hide sheet
            }}
          />
          
          {selectedStation && (
            <StationCard 
              station={selectedStation} 
              reachability={reachability} 
              onClose={() => setSelectedStation(null)} 
            />
          )}

          {/* Reset button Mobile adapted */}
          {destination && (
             <button
               onClick={() => {
                  setDestination(null)
                  setRouteData(null)
                  setSelectedStation(null)
               }}
               className="absolute top-[85px] lg:bottom-6 lg:top-auto right-4 lg:left-6 lg:right-auto z-[400] bg-[#DA303E] hover:bg-[#A0222C] text-white font-bold py-2.5 px-6 rounded-full shadow-[0_10px_20px_rgba(218,48,62,0.4)] transition-all text-xs lg:text-sm hover:scale-105 active:scale-95"
             >
               Huỷ Dẫn Đường
             </button>
          )}

          {/* Map Overlay shade to indicate Sheet is open on mobile */}
          {sheetOpen && (
            <div 
              className="absolute inset-0 bg-black/50 z-[450] md:hidden transition-opacity backdrop-blur-sm" 
              onClick={() => setSheetOpen(false)}
            ></div>
          )}
        </div>
      </div>
    </Layout>
  )
}

export default App
