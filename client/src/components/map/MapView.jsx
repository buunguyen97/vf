import { useEffect, useState, useMemo, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Circle, useMap, useMapEvents, Polyline } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { Navigation, Zap } from 'lucide-react';
import { evApi } from '../../services/api';

// Fix Leaflet's default icon path issues with Vite
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

// Icons
const chargerIcon = new L.Icon({
  iconUrl: 'https://cdn-icons-png.flaticon.com/512/3253/3253018.png',
  iconSize: [28, 28],
  iconAnchor: [14, 28],
  popupAnchor: [0, -28],
});
// Special highlight icon for optimal chargers
const optimalChargerIcon = new L.Icon({
  iconUrl: 'https://cdn-icons-png.flaticon.com/512/1048/1048953.png', // A star or highlighted icon
  iconSize: [40, 40],
  iconAnchor: [20, 40],
  popupAnchor: [0, -40],
});
const userIcon = new L.Icon({
  iconUrl: 'https://cdn-icons-png.flaticon.com/512/149/149059.png',
  iconSize: [32, 32],
  iconAnchor: [16, 32],
  popupAnchor: [0, -32],
});
const destinationIcon = new L.Icon({
  iconUrl: 'https://cdn-icons-png.flaticon.com/512/1483/1483336.png',
  iconSize: [32, 32],
  iconAnchor: [16, 32],
  popupAnchor: [0, -32],
});

function MapUpdater({ center, geoResolved }) {
  const map = useMap();
  const hasCenteredOnGeo = useRef(false);
  useEffect(() => {
    // Snap to real GPS position immediately once geolocation resolves
    if (geoResolved && !hasCenteredOnGeo.current) {
      map.setView(center, 14);
      hasCenteredOnGeo.current = true;
    }
  }, [center, geoResolved, map]);
  return null;
}

// Map Auto Fitter for polyline
function MapFitter({ routeCoords }) {
  const map = useMap();
  useEffect(() => {
    if (routeCoords && routeCoords.length > 0) {
      const bounds = L.latLngBounds(routeCoords);
      map.fitBounds(bounds, { padding: [50, 50], animate: true, duration: 1.5 });
    }
  }, [routeCoords, map]);
  return null;
}

// Map Event to capture clicks for destination setting
function MapClickHandler({ setDestination }) {
  useMapEvents({
    contextmenu(e) {
      // Right click to set destination
      setDestination([e.latlng.lat, e.latlng.lng]);
    },
    click(e) {
      // Normal click can also set destination if they want, but let's stick to simple click 
      // just so it works easily on mobile too without long press issues in testing.
      // But it might conflict with popup.
      setDestination([e.latlng.lat, e.latlng.lng]);
    }
  });
  return null;
}

export default function MapView({ 
  userLocation, 
  estimatedRange, 
  onStationSelect,
  selectedStationId,
  routeData,
  setDestination,
  destination,
  geoResolved
}) {
  const [ambientStations, setAmbientStations] = useState([]);
  const lastFetchRef = useRef(null);

  // Fetch ambient stations when there is no route (debounced)
  useEffect(() => {
    if (routeData) return; // Don't fetch when route is active
    if (!userLocation) return;

    // Debounce station fetches
    const timer = setTimeout(() => {
      const key = `${userLocation[0].toFixed(3)},${userLocation[1].toFixed(3)}`;
      if (lastFetchRef.current === key) return; // Skip if same area
      lastFetchRef.current = key;

      evApi.getChargers(userLocation[0], userLocation[1], 50)
        .then(setAmbientStations)
        .catch(console.error);
    }, 500);

    return () => clearTimeout(timer);
  }, [userLocation, routeData]);

  const center = userLocation || [21.0285, 105.8542];

  // Memoize station display computation
  const { displayStations, optimalStationIds } = useMemo(() => {
    if (routeData) {
      const ids = new Set();
      if (routeData.optimalStations) {
        routeData.optimalStations.forEach(s => ids.add(s.id));
      }
      return {
        displayStations: routeData.allRouteStations || [],
        optimalStationIds: ids
      };
    }
    return {
      displayStations: ambientStations.slice(0, 150),
      optimalStationIds: new Set()
    };
  }, [routeData, ambientStations]);

  return (
    <div className="w-full h-full relative rounded-2xl overflow-hidden border border-gray-800 shadow-xl z-0">
      
      {/* GPS Loading Overlay */}
      {!geoResolved && (
        <div className="absolute inset-0 z-[2000] bg-[#0f172a] flex flex-col items-center justify-center gap-4">
          <div className="w-12 h-12 border-4 border-[#00B14F] border-t-transparent rounded-full animate-spin"></div>
          <span className="text-white/70 text-sm font-medium">Đang xác định vị trí của bạn...</span>
        </div>
      )}

      {/* Help Overlay */}
      {geoResolved && !destination && (
         <div className="absolute top-4 left-1/2 transform -translate-x-1/2 z-[1000] bg-black/80 text-white text-xs px-4 py-2 rounded-full border border-gray-700 animate-pulse pointer-events-none">
            Click hoặc bấm giữ trên bản đồ để chọn Điểm Đến
         </div>
      )}

      <MapContainer 
        center={center} 
        zoom={11} 
        style={{ height: '100%', width: '100%', backgroundColor: '#0f172a' }}
        zoomControl={false}
      >
        <TileLayer
          attribution='&copy; OpenStreetMap'
          url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
        />
        
        <MapClickHandler setDestination={setDestination} />

        {userLocation && (
          <>
            <MapUpdater center={userLocation} geoResolved={geoResolved} />
            <Marker position={userLocation} icon={userIcon}>
              <Popup><div className="font-semibold text-gray-900">Vị trí của bạn</div></Popup>
            </Marker>
            
            {/* Ambient Range Circle - only if no route is plotted */}
            {!routeData && (
              <Circle 
                center={userLocation} 
                pathOptions={{ 
                  color: estimatedRange > 50 ? '#00B14F' : '#DA303E', 
                  fillColor: estimatedRange > 50 ? '#00B14F' : '#DA303E', 
                  fillOpacity: 0.1, weight: 2, dashArray: '5, 10'
                }} 
                radius={Math.max(1, estimatedRange) * 1000}
              />
            )}
          </>
        )}

        {destination && (
          <Marker position={destination} icon={destinationIcon}>
             <Popup><div className="font-semibold text-gray-900">Điểm đến của bạn</div></Popup>
          </Marker>
        )}

        {routeData && routeData.polylineCoords && (
          <>
            <Polyline 
               positions={routeData.polylineCoords} 
               pathOptions={{ color: '#1464F4', weight: 5, opacity: 0.9, lineCap: 'round', lineJoin: 'round' }} 
            />
            <MapFitter routeCoords={routeData.polylineCoords} />
          </>
        )}

        {displayStations.map(station => {
          const isOptimal = optimalStationIds.has(station.id);
          return (
            <Marker 
              key={station.id} 
              position={[station.latitude, station.longitude]} 
              icon={isOptimal ? optimalChargerIcon : chargerIcon}
              eventHandlers={{
                click: () => onStationSelect(station)
              }}
            >
              <Popup>
                <div className="min-w-[160px]">
                  {isOptimal && (
                    <div className="bg-[#00B14F] text-white text-[10px] font-bold uppercase px-2 py-0.5 rounded-t -mt-3 -mx-3 mb-2 flex items-center justify-center gap-1">
                      <Zap className="w-3 h-3"/> Đề xuất sạc
                    </div>
                  )}
                  <h3 className="font-bold text-gray-900 border-b pb-1 mb-2 leading-tight">{station.name}</h3>
                  <p className="text-xs text-gray-600 mb-2 truncate max-w-xs">{station.address}</p>
                  
                  {station.batteryAtStation !== undefined ? (
                    <div className="bg-gray-100 p-2 rounded text-sm mb-1 mt-1">
                      Pin dự kiến chặng: <strong className={isOptimal ? 'text-green-600' : 'text-blue-600'}>{station.batteryAtStation}%</strong>
                    </div>
                  ) : null}

                  <div className="flex justify-between items-center mt-2">
                     <span className="text-xs bg-[#1464F4] text-white px-2 py-0.5 rounded font-mono">
                       {station.power_kw} kW
                     </span>
                     <span className="text-[10px] bg-black text-white px-1.5 py-0.5 rounded">VinFast</span>
                  </div>
                </div>
              </Popup>
            </Marker>
          );
        })}

      </MapContainer>
    </div>
  );
}
