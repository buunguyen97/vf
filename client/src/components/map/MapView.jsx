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
const destinationIcon = L.divIcon({
  className: 'custom-div-icon',
  html: `<div class="bg-red-500 rounded-full w-4 h-4 border-2 border-white shadow shadow-black"></div>`,
  iconSize: [16, 16],
  iconAnchor: [8, 8]
});

const userIcon = L.divIcon({
  className: 'custom-div-icon',
  html: `<div class="bg-blue-600 rounded-full w-5 h-5 border-2 border-white shadow shadow-black ring-4 ring-blue-500/30"></div>`,
  iconSize: [20, 20],
  iconAnchor: [10, 10]
});

const getChargingIcon = (st, isOptimal) => {
  const bgColor = isOptimal ? '#22c55e' : '#06b6d4'; // Green for suggested, Cyan for others
  const scale = isOptimal ? 'scale(1.15)' : 'scale(0.9)';
  return L.divIcon({
    className: 'charging-icon',
    html: `
      <div style="background-color: ${bgColor}; color: white; border-radius: 50%; width: 34px; height: 34px; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 13px; border: 2px solid white; box-shadow: 0 3px 6px rgba(0,0,0,0.4); transform: ${scale};">
        ${st.power_kw}
      </div>
    `,
    iconSize: [34, 34],
    iconAnchor: [17, 17],
    popupAnchor: [0, -17]
  });
};

// Calculate mock plug data
const getMockPlugs = (power) => {
   if (power >= 250) {
     return [ { p: power, count: 2 }, { p: 60, count: 6 }, { p: 11, count: 4 } ];
   } else if (power >= 150) {
     return [ { p: power, count: 4 }, { p: 11, count: 2 } ];
   } else if (power >= 60) {
     return [ { p: power, count: 4 }, { p: 30, count: 2 } ];
   } else {
     return [ { p: power, count: 2 } ]; // AC only perhaps
   }
};

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

// Map Event to capture double-clicks
function MapClickHandler({ setDestination, routeData, setWaypoint }) {
  useMapEvents({
    dblclick(e) {
      if (routeData) {
        setWaypoint([e.latlng.lat, e.latlng.lng]);
      } else {
        setDestination([e.latlng.lat, e.latlng.lng]);
      }
    },
    contextmenu(e) { // Long press on mobile
      if (routeData) {
        setWaypoint([e.latlng.lat, e.latlng.lng]);
      }
    }
  });
  return null;
}

export default function MapView({ 
  userLocation, 
  estimatedRange, 
  onStationSelect,
  routeData,
  setDestination,
  destination,
  geoResolved,
  onRouteReplan,
  waypoint,
  setWaypoint,
  oldRoutePolyline
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
            Double click trên bản đồ để chọn Điểm Đến
         </div>
      )}

      <MapContainer 
        center={center} 
        zoom={11} 
        style={{ height: '100%', width: '100%', backgroundColor: '#0f172a' }}
        zoomControl={false}
        doubleClickZoom={false}
      >
        <TileLayer
          attribution='&copy; OpenStreetMap'
          url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
        />
        
        <MapClickHandler setDestination={setDestination} routeData={routeData} setWaypoint={setWaypoint} />

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

        {waypoint && (
          <Marker position={waypoint} icon={destinationIcon}>
             <Popup><div className="font-semibold text-gray-900">Điểm đổi tuyến</div></Popup>
          </Marker>
        )}

        {oldRoutePolyline && (
          <Polyline 
             positions={oldRoutePolyline} 
             pathOptions={{ color: '#9CA3AF', weight: 4, opacity: 0.6, lineCap: 'round', lineJoin: 'round', dashArray: '5, 10' }} 
          />
        )}

        {routeData && routeData.alternativeRoutes && routeData.alternativeRoutes.map(altRoute => {
          if (altRoute.index === routeData.selectedRouteIndex) return null; // Don't draw the selected one here
          return (
            <Polyline 
               key={altRoute.index}
               positions={altRoute.polylineCoords} 
               pathOptions={{ color: 'gray', weight: 4, opacity: 0.6, lineCap: 'round', lineJoin: 'round' }} 
               eventHandlers={{
                 click: (e) => { L.DomEvent.stopPropagation(e); if (onRouteReplan) onRouteReplan(altRoute.index); },
                 dblclick: (e) => { L.DomEvent.stopPropagation(e); if (onRouteReplan) onRouteReplan(altRoute.index); },
                 contextmenu: (e) => { L.DomEvent.stopPropagation(e); if (onRouteReplan) onRouteReplan(altRoute.index); }
               }}
            />
          );
        })}

        {routeData && routeData.polylineCoords && (
          <>
            <Polyline 
               positions={routeData.polylineCoords} 
               pathOptions={{ color: '#1464F4', weight: 6, opacity: 0.9, lineCap: 'round', lineJoin: 'round' }} 
            />
            <MapFitter routeCoords={routeData.polylineCoords} />
          </>
        )}

        {displayStations.map(st => {
          const isOptimal = optimalStationIds.has(st.id);
          return (
            <Marker
              key={st.id}
              position={[st.latitude, st.longitude]}
              icon={getChargingIcon(st, isOptimal)}
              zIndexOffset={isOptimal ? 1000 : 0}
              eventHandlers={{
                click: () => onStationSelect(st)
              }}
            >
              <Popup className="station-popup">
                <div className="w-56 p-1">
                  <h3 className="font-bold text-gray-900 border-b pb-2 mb-2 leading-tight">{st.name}</h3>
                  <p className="text-xs text-gray-500 mb-3">{st.address}</p>

                  <p className="font-semibold text-xs text-gray-700 mb-2 uppercase tracking-wide">Trụ sạc khả dụng:</p>
                  <div className="flex flex-wrap gap-2 mb-3">
                    {getMockPlugs(st.power_kw).map((plug, i) => (
                      <div key={i} className="flex items-center gap-1.5 bg-green-50 border border-green-200 px-2.5 py-1.5 rounded-lg w-[48%]">
                         <div className="bg-green-500 w-2 h-2 rounded-full"></div>
                         <div className="flex flex-col">
                            <span className="text-sm font-bold text-green-700 leading-none">{plug.p}kW</span>
                            <span className="text-[10px] text-gray-600 font-medium">{plug.count} trụ</span>
                         </div>
                      </div>
                    ))}
                  </div>

                  <div className="mt-3 pt-2 flex items-center justify-between border-t border-gray-100">
                    <span className="text-sm bg-gray-100 px-2 py-1 rounded text-gray-800 font-medium">CCS2</span>
                    {st.batteryAtStation && (
                      <div className="flex items-center text-blue-600 font-bold bg-blue-50 px-2 py-1 rounded">
                        Pin dự kiến: {st.batteryAtStation}%
                      </div>
                    )}
                  </div>
                  
                  <div className="mt-3">
                    <a
                      href={`https://www.google.com/maps/dir/?api=1&destination=${st.latitude},${st.longitude}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-center gap-2 w-full bg-[#1464F4] hover:bg-[#0D4BC4] font-bold py-2.5 px-4 rounded-lg shadow-md transition-colors text-sm uppercase"
                      style={{ color: '#ffffff', textDecoration: 'none' }}
                    >
                      <Navigation className="w-4 h-4" strokeWidth={3} /> BẮT ĐẦU ĐI VỚI GOOGLE MAP
                    </a>
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
