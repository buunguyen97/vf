import { useEffect, useMemo, useRef, useState } from 'react';
import { Circle, MapContainer, Marker, Polyline, Popup, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { Navigation } from 'lucide-react';
import { evApi } from '../../services/api';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

const destinationIcon = L.divIcon({
  className: 'custom-div-icon',
  html: '<div class="bg-red-500 rounded-full w-4 h-4 border-2 border-white shadow shadow-black"></div>',
  iconSize: [16, 16],
  iconAnchor: [8, 8],
});

const userIcon = L.divIcon({
  className: 'custom-div-icon',
  html: '<div class="bg-blue-600 rounded-full w-5 h-5 border-2 border-white shadow shadow-black ring-4 ring-blue-500/30"></div>',
  iconSize: [20, 20],
  iconAnchor: [10, 10],
});

const getChargingIcon = (station, isOptimal) => {
  const bgColor = isOptimal ? '#22c55e' : '#06b6d4';
  const scale = isOptimal ? 'scale(1.15)' : 'scale(0.9)';

  return L.divIcon({
    className: 'charging-icon',
    html: `
      <div style="background-color: ${bgColor}; color: white; border-radius: 50%; width: 34px; height: 34px; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 13px; border: 2px solid white; box-shadow: 0 3px 6px rgba(0,0,0,0.4); transform: ${scale};">
        ${station.power_kw}
      </div>
    `,
    iconSize: [34, 34],
    iconAnchor: [17, 17],
    popupAnchor: [0, -17],
  });
};

const getMockPlugs = (power) => {
  if (power >= 250) {
    return [{ p: power, count: 2 }, { p: 60, count: 6 }, { p: 11, count: 4 }];
  }
  if (power >= 150) {
    return [{ p: power, count: 4 }, { p: 11, count: 2 }];
  }
  if (power >= 60) {
    return [{ p: power, count: 4 }, { p: 30, count: 2 }];
  }
  return [{ p: power, count: 2 }];
};

function MapUpdater({ center, geoResolved }) {
  const map = useMap();
  const hasCenteredOnGeo = useRef(false);

  useEffect(() => {
    if (geoResolved && !hasCenteredOnGeo.current) {
      map.setView(center, 14);
      hasCenteredOnGeo.current = true;
    }
  }, [center, geoResolved, map]);

  return null;
}

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

function MapClickHandler({ setDestination, routeData, setWaypoint }) {
  useMapEvents({
    dblclick(e) {
      if (routeData) {
        setWaypoint([e.latlng.lat, e.latlng.lng]);
      } else {
        setDestination([e.latlng.lat, e.latlng.lng]);
      }
    },
    contextmenu(e) {
      if (routeData) {
        setWaypoint([e.latlng.lat, e.latlng.lng]);
      }
    },
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
  oldRoutePolyline,
  onAmbientLoadingChange,
  hideHelpOverlay = false,
}) {
  const [ambientStations, setAmbientStations] = useState([]);
  const [isLoadingAmbientStations, setIsLoadingAmbientStations] = useState(false);
  const lastFetchRef = useRef(null);

  useEffect(() => {
    if (routeData) {
      setIsLoadingAmbientStations(false);
      if (onAmbientLoadingChange) onAmbientLoadingChange(false);
      return;
    }
    if (!userLocation) return;

    const timer = setTimeout(() => {
      const key = `${userLocation[0].toFixed(3)},${userLocation[1].toFixed(3)}`;
      if (lastFetchRef.current === key) return;
      lastFetchRef.current = key;

      setIsLoadingAmbientStations(true);
      if (onAmbientLoadingChange) onAmbientLoadingChange(true);

      evApi
        .getChargers(userLocation[0], userLocation[1], 50)
        .then(setAmbientStations)
        .catch(console.error)
        .finally(() => {
          setIsLoadingAmbientStations(false);
          if (onAmbientLoadingChange) onAmbientLoadingChange(false);
        });
    }, 500);

    return () => clearTimeout(timer);
  }, [userLocation, routeData, onAmbientLoadingChange]);

  const center = userLocation || [21.0285, 105.8542];

  const { displayStations, optimalStationIds } = useMemo(() => {
    if (routeData) {
      const ids = new Set();
      if (routeData.optimalStations) {
        routeData.optimalStations.forEach((station) => ids.add(station.id));
      }
      return {
        displayStations: routeData.allRouteStations || [],
        optimalStationIds: ids,
      };
    }

    return {
      displayStations: ambientStations.slice(0, 150),
      optimalStationIds: new Set(),
    };
  }, [routeData, ambientStations]);

  return (
    <div className="relative z-0 h-full w-full overflow-hidden rounded-2xl border border-gray-800 shadow-xl">
      {!geoResolved && (
        <div className="absolute inset-0 z-[2000] flex flex-col items-center justify-center gap-4 bg-[#0f172a]">
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-[#00B14F] border-t-transparent"></div>
          <span className="text-sm font-medium text-white/70">Đang xác định vị trí của bạn...</span>
        </div>
      )}

      {geoResolved && isLoadingAmbientStations && !routeData && (
        <div className="pointer-events-none absolute left-4 right-4 top-4 z-[1000] overflow-hidden rounded-2xl border border-white/10 bg-black/70 px-4 py-3 shadow-[0_12px_40px_rgba(0,0,0,0.35)] backdrop-blur-lg md:left-1/2 md:right-auto md:w-[360px] md:-translate-x-1/2">
          <div className="mb-2 flex items-center justify-between text-[11px] font-semibold text-white/70">
            <span>Đang tải các trạm xung quanh</span>
            <span className="text-[#00B14F]">...</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-white/10">
            <div className="h-full w-1/2 animate-[pulse_1.2s_ease-in-out_infinite] rounded-full bg-gradient-to-r from-[#1464F4] via-[#00B14F] to-[#1464F4]"></div>
          </div>
        </div>
      )}

      {geoResolved && !destination && !hideHelpOverlay && (
        <div className="pointer-events-none absolute left-1/2 top-4 z-[1000] -translate-x-1/2 transform rounded-full border border-gray-700 bg-black/80 px-4 py-2 text-xs text-white animate-pulse">
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
        <TileLayer attribution="&copy; OpenStreetMap" url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png" />

        <MapClickHandler setDestination={setDestination} routeData={routeData} setWaypoint={setWaypoint} />

        {userLocation && (
          <>
            <MapUpdater center={userLocation} geoResolved={geoResolved} />
            <Marker position={userLocation} icon={userIcon}>
              <Popup>
                <div className="font-semibold text-gray-900">Vị trí của bạn</div>
              </Popup>
            </Marker>

            {!routeData && (
              <Circle
                center={userLocation}
                pathOptions={{
                  color: estimatedRange > 50 ? '#00B14F' : '#DA303E',
                  fillColor: estimatedRange > 50 ? '#00B14F' : '#DA303E',
                  fillOpacity: 0.1,
                  weight: 2,
                  dashArray: '5, 10',
                }}
                radius={Math.max(1, estimatedRange) * 1000}
              />
            )}
          </>
        )}

        {destination && (
          <Marker position={destination} icon={destinationIcon}>
            <Popup>
              <div className="font-semibold text-gray-900">Điểm đến của bạn</div>
            </Popup>
          </Marker>
        )}

        {waypoint && (
          <Marker position={waypoint} icon={destinationIcon}>
            <Popup>
              <div className="font-semibold text-gray-900">Điểm đổi tuyến</div>
            </Popup>
          </Marker>
        )}

        {oldRoutePolyline && (
          <Polyline
            positions={oldRoutePolyline}
            pathOptions={{ color: '#9CA3AF', weight: 4, opacity: 0.6, lineCap: 'round', lineJoin: 'round', dashArray: '5, 10' }}
          />
        )}

        {routeData?.alternativeRoutes?.map((altRoute) => {
          if (altRoute.index === routeData.selectedRouteIndex) return null;
          return (
            <Polyline
              key={altRoute.index}
              positions={altRoute.polylineCoords}
              pathOptions={{ color: 'gray', weight: 4, opacity: 0.6, lineCap: 'round', lineJoin: 'round' }}
              eventHandlers={{
                click: (e) => {
                  L.DomEvent.stopPropagation(e);
                  if (onRouteReplan) onRouteReplan(altRoute.index);
                },
                dblclick: (e) => {
                  L.DomEvent.stopPropagation(e);
                  if (onRouteReplan) onRouteReplan(altRoute.index);
                },
                contextmenu: (e) => {
                  L.DomEvent.stopPropagation(e);
                  if (onRouteReplan) onRouteReplan(altRoute.index);
                },
              }}
            />
          );
        })}

        {routeData?.polylineCoords && (
          <>
            <Polyline positions={routeData.polylineCoords} pathOptions={{ color: '#1464F4', weight: 6, opacity: 0.9, lineCap: 'round', lineJoin: 'round' }} />
            <MapFitter routeCoords={routeData.polylineCoords} />
          </>
        )}

        {displayStations.map((station) => {
          const isOptimal = optimalStationIds.has(station.id);
          return (
            <Marker
              key={station.id}
              position={[station.latitude, station.longitude]}
              icon={getChargingIcon(station, isOptimal)}
              zIndexOffset={isOptimal ? 1000 : 0}
              eventHandlers={{
                click: () => onStationSelect(station),
              }}
            >
              <Popup className="station-popup">
                <div className="w-56 p-1">
                  <h3 className="mb-2 border-b pb-2 leading-tight font-bold text-gray-900">{station.name}</h3>
                  <p className="mb-3 text-xs text-gray-500">{station.address}</p>

                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-700">Trụ sạc khả dụng:</p>
                  <div className="mb-3 flex flex-wrap gap-2">
                    {getMockPlugs(station.power_kw).map((plug, index) => (
                      <div key={index} className="flex w-[48%] items-center gap-1.5 rounded-lg border border-green-200 bg-green-50 px-2.5 py-1.5">
                        <div className="h-2 w-2 rounded-full bg-green-500"></div>
                        <div className="flex flex-col">
                          <span className="text-sm font-bold leading-none text-green-700">{plug.p}kW</span>
                          <span className="text-[10px] font-medium text-gray-600">{plug.count} trụ</span>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="mt-3 flex items-center justify-between border-t border-gray-100 pt-2">
                    <span className="rounded bg-gray-100 px-2 py-1 text-sm font-medium text-gray-800">CCS2</span>
                    {station.batteryAtStation !== undefined && (
                      <div className="flex items-center rounded bg-blue-50 px-2 py-1 font-bold text-blue-600">
                        Pin dự kiến: {station.batteryAtStation}%
                      </div>
                    )}
                  </div>

                  <div className="mt-3">
                    <a
                      href={`https://www.google.com/maps/dir/?api=1&destination=${station.latitude},${station.longitude}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#1464F4] px-4 py-2 text-xs font-semibold transition-colors hover:bg-[#0D4BC4]"
                      style={{ color: '#ffffff', textDecoration: 'none' }}
                    >
                      <Navigation className="h-4 w-4" strokeWidth={2.5} /> Bắt đầu đi với Google Map
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
