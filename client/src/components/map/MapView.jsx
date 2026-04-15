import { useEffect, useMemo, useRef, useState } from 'react';
import { Circle, MapContainer, Marker, Polyline, Popup, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronUp, Coffee, Navigation } from 'lucide-react';
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

const getChargingIcon = (station, isOptimal, isSelected, isViewed) => {
  const bgColor = isOptimal ? '#22c55e' : '#06b6d4';
  const borderColor = (isSelected || isViewed) ? '#dbeafe' : '#ffffff';
  const scale = (isSelected || isViewed) ? 'scale(1.06)' : (isOptimal ? 'scale(1.15)' : 'scale(0.9)');
  const glow = (isSelected || isViewed)
    ? '0 0 0 6px rgba(59,130,246,0.20), 0 0 18px rgba(59,130,246,0.38), 0 3px 10px rgba(0,0,0,0.30)'
    : '0 3px 6px rgba(0,0,0,0.4)';

  return L.divIcon({
    className: 'charging-icon',
    html: `
      <div style="background-color: ${bgColor}; color: white; border-radius: 50%; width: 34px; height: 34px; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 13px; border: 2px solid ${borderColor}; box-shadow: ${glow}; transform: ${scale}; transition: all 0.2s ease;">
        ${station.power_kw}
      </div>
    `,
    iconSize: [34, 34],
    iconAnchor: [17, 17],
    popupAnchor: [0, -17],
  });
};

const getCleanStationAddress = (station) => {
  const raw = `${station.address || station.name || ''}`.trim();
  if (!raw) return station.name || '';

  let cleaned = raw;
  const cutMatch = cleaned.match(/(Công suất|Công sạc|Trạm sạc|Thời gian hoạt động|Gửi xe|Cập nhật lần cuối|Latitude|Longitude)\s*:/i);
  if (cutMatch?.index !== undefined) {
    cleaned = cleaned.slice(0, cutMatch.index).trim();
  }

  const specMatch = cleaned.match(/\d+\s*cổng[\s\S]*?(?:kW|KW)/i);
  if (specMatch?.index !== undefined) {
    cleaned = cleaned.slice(0, specMatch.index).trim();
  }

  return cleaned
    .replace(/^Địa\s*Chỉ:\s*/i, '')
    .replace(/^Địa\s*chỉ:\s*/i, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
};

const getChargingSpecCards = (station) => {
  const raw = `${station.address || station.name || ''}`;
  const parsedSpecs = [...raw.matchAll(/(\d+)\s*cổng\s*(\d+)\s*(?:kW|KW)/gi)].map((match) => ({
    count: Number(match[1]),
    power: Number(match[2]),
  }));

  if (parsedSpecs.length > 0) {
    return parsedSpecs.slice(0, 4);
  }

  if (station.power_kw) {
    return [{ count: 1, power: Number(station.power_kw) }];
  }

  return [];
};

const getReachabilitySummary = (stationReachability) => {
  if (!stationReachability) return '';

  const batteryLeftPercent = stationReachability.batteryLeftPercent;
  const minBatteryPercent = stationReachability.minBatteryPercent;

  if (batteryLeftPercent === undefined || batteryLeftPercent === null) {
    return '';
  }

  if (minBatteryPercent === undefined || minBatteryPercent === null) {
    return (
      <>
        Pin dự kiến khi đến Trạm Sạc:{' '}
        <span className="text-[12px] font-extrabold text-slate-900">{batteryLeftPercent}%</span>.
      </>
    );
  }

  const sweetSpotMax = minBatteryPercent + 10;

  if (batteryLeftPercent >= minBatteryPercent && batteryLeftPercent <= sweetSpotMax) {
    return (
      <>
        Pin dự kiến khi đến Trạm Sạc:{' '}
        <span className="text-[12px] font-extrabold text-slate-900">{batteryLeftPercent}%</span>{' '}
        <span className="font-medium text-gray-600">
          ( khoảng tối thiểu:{' '}
          <span className="font-bold text-[#166534]">{minBatteryPercent}%</span>{' '}
          <span className="text-gray-400">-&gt;</span>{' '}
          <span className="font-bold text-[#166534]">{sweetSpotMax}%</span> )
        </span>
      </>
    );
  }

  if (batteryLeftPercent > sweetSpotMax) {
    return (
      <>
        Pin dự kiến khi đến Trạm Sạc:{' '}
        <span className="text-[12px] font-extrabold text-slate-900">{batteryLeftPercent}%</span>{' '}
        <span className="font-medium text-gray-600">
          ( cao hơn khoảng tối thiểu:{' '}
          <span className="font-bold text-[#166534]">{minBatteryPercent}%</span>{' '}
          <span className="text-gray-400">-&gt;</span>{' '}
          <span className="font-bold text-[#166534]">{sweetSpotMax}%</span> )
        </span>
      </>
    );
  }

  return (
    <>
      Pin dự kiến khi đến Trạm Sạc:{' '}
      <span className="text-[12px] font-extrabold text-slate-900">{batteryLeftPercent}%</span>{' '}
      <span className="font-medium text-gray-600">
        ( thấp hơn khoảng tối thiểu:{' '}
        <span className="font-bold text-[#166534]">{minBatteryPercent}%</span>{' '}
        <span className="text-gray-400">-&gt;</span>{' '}
        <span className="font-bold text-[#166534]">{sweetSpotMax}%</span> )
      </span>
    </>
  );
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
  const lastRouteKeyRef = useRef('');

  useEffect(() => {
    if (routeCoords && routeCoords.length > 0) {
      const first = routeCoords[0];
      const last = routeCoords[routeCoords.length - 1];
      const routeKey = `${routeCoords.length}:${first?.[0]}:${first?.[1]}:${last?.[0]}:${last?.[1]}`;
      if (lastRouteKeyRef.current === routeKey) return;
      lastRouteKeyRef.current = routeKey;

      const bounds = L.latLngBounds(routeCoords);
      const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
      const bottomPadding = isMobile ? 250 : 60;
      map.fitBounds(bounds, {
        paddingTopLeft: [50, 50],
        paddingBottomRight: [50, bottomPadding],
        animate: true,
        duration: 1.5,
      });
    }
  }, [routeCoords, map]);

  return null;
}

function MapClickHandler({ setDestination, routeData, setWaypoint, interactionLocked }) {
  useMapEvents({
    dblclick(e) {
      if (interactionLocked) return;
      if (routeData) {
        setWaypoint([e.latlng.lat, e.latlng.lng]);
      }
    },
    contextmenu(e) {
      if (interactionLocked) return;
      if (routeData) {
        setWaypoint([e.latlng.lat, e.latlng.lng]);
      }
    },
  });

  return null;
}

function StationPopupBody({
  station,
  stationReachability,
  chargingSpecs,
  distanceToStationKm,
  distanceToDestinationKm,
  expandedAmenityStationId,
  setExpandedAmenityStationId,
}) {
  const map = useMap();

  const handleCenterPopup = (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest('a, button')) return;

    const mapRect = map.getContainer().getBoundingClientRect();
    const popupRect = event.currentTarget.getBoundingClientRect();
    const popupCenterX = (popupRect.left - mapRect.left) + (popupRect.width / 2);
    const popupCenterY = (popupRect.top - mapRect.top) + (popupRect.height / 2);
    const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
    const desiredCenterX = mapRect.width / 2;
    const desiredCenterY = isMobile ? mapRect.height * 0.38 : mapRect.height * 0.42;
    const deltaX = popupCenterX - desiredCenterX;
    const deltaY = popupCenterY - desiredCenterY;

    if (Math.abs(deltaX) < 8 && Math.abs(deltaY) < 8) return;

    map.panBy([deltaX, deltaY], {
      animate: true,
      duration: 0.45,
      easeLinearity: 0.25,
    });
  };

  return (
    <div className="mx-auto w-full max-w-[296px] cursor-pointer p-1" onClick={handleCenterPopup}>
      <div className="rounded-xl border border-slate-100 bg-white px-3 py-2">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-slate-400">Địa chỉ trạm</p>
            <p className="mt-1 text-[13px] font-semibold leading-5 text-slate-700">
              {getCleanStationAddress(station)}
            </p>
          </div>

          {station.batteryAtStation !== undefined && (
            <div className="shrink-0 rounded-full bg-[#eff6ff] px-2 py-0.5 text-[9px] font-bold text-[#1d4ed8]">
              Pin {station.batteryAtStation}%
            </div>
          )}
        </div>
      </div>

      {chargingSpecs.length > 0 && (
        <div className={`mt-2 grid gap-1.5 ${chargingSpecs.length === 1 ? 'grid-cols-1' : 'grid-cols-2'}`}>
          {chargingSpecs.map((spec, index) => (
            <div
              key={`${spec.power}-${spec.count}-${index}`}
              className="flex items-center justify-between gap-2 rounded-xl border border-[#22c55e]/16 bg-[linear-gradient(180deg,#f7fff9_0%,#eefbf3_100%)] px-2.5 py-1.5 shadow-[0_4px_12px_rgba(34,197,94,0.07)]"
            >
              <p className="text-[15px] font-black leading-none text-[#166534]">
                {spec.power}
                <span className="ml-1 text-[10px] font-bold text-[#15803d]/80">kW</span>
              </p>
              <div className="rounded-full border border-[#22c55e]/18 bg-white/90 px-2 py-0.5 text-[9px] font-bold leading-none text-[#15803d]">
                {spec.count} cổng
              </div>
            </div>
          ))}
        </div>
      )}

      {distanceToStationKm !== null && distanceToDestinationKm !== null && (
        <div className="mt-2 grid grid-cols-2 gap-1.5">
          <div className="rounded-xl border border-[#dbeafe] bg-[#eff6ff] px-2 py-1.5 text-center">
            <p className="text-[9px] uppercase tracking-wide text-[#1464F4]/70">Đến trạm</p>
            <p className="mt-1 text-[13px] font-black leading-none text-[#1464F4]">{distanceToStationKm} km</p>
          </div>
          <div className="rounded-xl border border-[#cffafe] bg-[#ecfeff] px-2 py-1.5 text-center">
            <p className="text-[9px] uppercase tracking-wide text-sky-600/70">Từ trạm đến đích</p>
            <p className="mt-1 text-[13px] font-black leading-none text-sky-700">{distanceToDestinationKm} km</p>
          </div>
        </div>
      )}

      {stationReachability && (
        <div
          className={`mt-2 rounded-xl border px-2.5 py-2 ${
            stationReachability.canReach
              ? 'border-[#00B14F]/20 bg-[#00B14F]/10'
              : 'border-[#DA303E]/20 bg-[#DA303E]/10'
          }`}
        >
          <div className="flex items-start gap-2">
            {stationReachability.canReach ? (
              <CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0 text-[#00B14F]" />
            ) : (
              <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-[#DA303E]" />
            )}
            <div>
              <p className={`text-[12.5px] font-bold ${stationReachability.canReach ? 'text-[#007032]' : 'text-[#A0222C]'}`}>
                {stationReachability.canReach ? 'Có thể đến nơi an toàn' : 'Không thể đến nơi'}
              </p>
              <p className="mt-1 text-[11px] leading-4.5 text-gray-700">
                {getReachabilitySummary(stationReachability)}
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="mt-2 overflow-hidden rounded-xl border border-gray-100">
        <button
          type="button"
          onClick={() => setExpandedAmenityStationId((current) => (current === station.id ? null : station.id))}
          className="flex w-full items-center justify-between bg-gray-50 px-3 py-1.5 transition-colors hover:bg-gray-100"
        >
          <span className="flex items-center gap-2 text-[11px] font-semibold text-gray-600">
            <Coffee className="h-2.5 w-2.5 text-[#16a34a]" />
            Quán ăn và Coffee xung quanh
          </span>
          {expandedAmenityStationId === station.id ? (
            <ChevronUp className="h-3.5 w-3.5 text-gray-400" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5 text-gray-400" />
          )}
        </button>

        {expandedAmenityStationId === station.id && (
          <div className="border-t border-gray-100 bg-white px-3 py-3">
            <div className="rounded-lg border border-[#16a34a]/15 bg-[#16a34a]/5 px-3 py-2.5 text-xs leading-relaxed text-gray-600">
              Tính năng này sẽ ra mắt trong tương lai.
            </div>
          </div>
        )}
      </div>

      <div className="mt-2">
        <a
          href={`https://www.google.com/maps/dir/?api=1&destination=${station.latitude},${station.longitude}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#1464F4] px-4 py-2 text-[11px] font-semibold transition-colors hover:bg-[#0D4BC4]"
          style={{ color: '#ffffff', textDecoration: 'none' }}
        >
          <Navigation className="h-3 w-3" strokeWidth={2.5} /> Bắt đầu đi với Google Map
        </a>
      </div>
    </div>
  );
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
  selectedStation,
  lastViewedStationId,
  reachability,
  onStationClose,
  onAmbientLoadingChange,
  hideHelpOverlay = false,
}) {
  const [ambientStations, setAmbientStations] = useState([]);
  const [isLoadingAmbientStations, setIsLoadingAmbientStations] = useState(false);
  const [expandedAmenityStationId, setExpandedAmenityStationId] = useState(null);
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

  const showAmbientLoadingOverlay = !routeData && (hideHelpOverlay || isLoadingAmbientStations);
  const showAlternativeRouteHint = !!destination && (!!routeData || !!waypoint);

  useEffect(() => {
    if (!selectedStation) {
      setExpandedAmenityStationId(null);
    }
  }, [selectedStation]);

  const selectedRouteSegments = useMemo(() => {
    if (!routeData?.polylineCoords || !selectedStation) {
      return null;
    }

    const coords = routeData.polylineCoords;
    let nearestIndex = 0;
    let nearestDistance = Number.POSITIVE_INFINITY;

    coords.forEach((coord, index) => {
      const latDiff = coord[0] - selectedStation.latitude;
      const lngDiff = coord[1] - selectedStation.longitude;
      const score = (latDiff * latDiff) + (lngDiff * lngDiff);
      if (score < nearestDistance) {
        nearestDistance = score;
        nearestIndex = index;
      }
    });

    return {
      toStation: coords.slice(0, Math.max(nearestIndex + 1, 2)),
      toDestination: coords.slice(Math.max(nearestIndex, 0)),
    };
  }, [routeData, selectedStation]);

  return (
    <div className="relative z-0 h-full w-full overflow-hidden rounded-2xl border border-gray-800 shadow-xl">
      {!geoResolved && (
        <div className="absolute inset-0 z-[2000] flex flex-col items-center justify-center gap-4 bg-[#0f172a]">
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-[#00B14F] border-t-transparent"></div>
          <span className="text-sm font-medium text-white/70">Đang xác định vị trí của bạn...</span>
        </div>
      )}

      {geoResolved && showAmbientLoadingOverlay && (
        <div className="pointer-events-none absolute left-1/2 top-4 z-[1900] w-[min(320px,calc(100%-32px))] -translate-x-1/2">
          <div className="rounded-2xl border border-white/12 bg-black/80 px-4 py-3 shadow-[0_14px_36px_rgba(0,0,0,0.32)]">
            <div className="flex items-center justify-between gap-3 text-[11px] font-semibold text-white/78">
              <span>Đang tải trạm sạc gần bạn</span>
              <span className="text-[#22c55e]">...</span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
              <div className="h-full w-2/3 animate-[pulse_1.1s_ease-in-out_infinite] rounded-full bg-gradient-to-r from-[#1464F4] via-[#22c55e] to-[#1464F4]"></div>
            </div>
          </div>
        </div>
      )}

      {geoResolved && showAlternativeRouteHint && !showAmbientLoadingOverlay && (
        <div className="pointer-events-none absolute left-1/2 top-4 z-[1850] w-[min(330px,calc(100%-36px))] -translate-x-1/2">
          <div className="rounded-full border border-white/10 bg-black/60 px-4 py-2 text-center text-[11px] font-medium tracking-[0.01em] text-white/78 shadow-[0_10px_28px_rgba(0,0,0,0.22)] backdrop-blur-md">
            Nhấn đúp vào tuyến phụ để đổi tuyến
          </div>
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

        <MapClickHandler
          setDestination={setDestination}
          routeData={routeData}
          setWaypoint={setWaypoint}
          interactionLocked={!!selectedStation}
        />

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
                  if (selectedStation) return;
                  if (onRouteReplan) onRouteReplan(altRoute.index);
                },
                dblclick: (e) => {
                  L.DomEvent.stopPropagation(e);
                  if (selectedStation) return;
                  if (onRouteReplan) onRouteReplan(altRoute.index);
                },
                contextmenu: (e) => {
                  L.DomEvent.stopPropagation(e);
                  if (selectedStation) return;
                  if (onRouteReplan) onRouteReplan(altRoute.index);
                },
              }}
            />
          );
        })}

        {routeData?.polylineCoords && (
          <>
            {selectedRouteSegments ? (
              <>
                {selectedRouteSegments.toStation.length > 1 && (
                  <Polyline
                    positions={selectedRouteSegments.toStation}
                    pathOptions={{ color: '#1464F4', weight: 6, opacity: 0.95, lineCap: 'round', lineJoin: 'round' }}
                  />
                )}
                {selectedRouteSegments.toDestination.length > 1 && (
                  <Polyline
                    positions={selectedRouteSegments.toDestination}
                    pathOptions={{ color: '#bfdbfe', weight: 5, opacity: 0.72, lineCap: 'round', lineJoin: 'round' }}
                  />
                )}
              </>
            ) : (
              <Polyline positions={routeData.polylineCoords} pathOptions={{ color: '#1464F4', weight: 6, opacity: 0.9, lineCap: 'round', lineJoin: 'round' }} />
            )}
            <MapFitter routeCoords={routeData.polylineCoords} />
          </>
        )}

        {displayStations.map((station) => {
          const isOptimal = optimalStationIds.has(station.id);
          const isSelectedStation = selectedStation?.id === station.id;
          const isViewedStation = lastViewedStationId === station.id && !isSelectedStation;
          const stationReachability = isSelectedStation ? reachability : null;
          const chargingSpecs = getChargingSpecCards(station);
          const distanceToStationKm = station.distanceFromStartKm !== undefined
            ? Math.max(0, Math.round(station.distanceFromStartKm * 10) / 10)
            : null;
          const distanceToDestinationKm = distanceToStationKm !== null && routeData?.totalDistanceKm !== undefined
            ? Math.max(0, Math.round((routeData.totalDistanceKm - distanceToStationKm) * 10) / 10)
            : null;

          return (
            <Marker
              key={station.id}
              position={[station.latitude, station.longitude]}
              icon={getChargingIcon(station, isOptimal, isSelectedStation, isViewedStation)}
              zIndexOffset={isSelectedStation ? 1200 : (isOptimal ? 1000 : 0)}
              eventHandlers={{
                click: () => onStationSelect(station),
                popupclose: () => {
                  if (onStationClose) onStationClose();
                },
              }}
            >
              <Popup
                className="station-popup"
                maxWidth={336}
                minWidth={280}
                keepInView={true}
                autoPan={false}
                autoPanPaddingTopLeft={[20, 110]}
                autoPanPaddingBottomRight={[20, 430]}
              >
                <StationPopupBody
                  station={station}
                  stationReachability={stationReachability}
                  chargingSpecs={chargingSpecs}
                  distanceToStationKm={distanceToStationKm}
                  distanceToDestinationKm={distanceToDestinationKm}
                  expandedAmenityStationId={expandedAmenityStationId}
                  setExpandedAmenityStationId={setExpandedAmenityStationId}
                />
              </Popup>
            </Marker>
          );
        })}
      </MapContainer>
    </div>
  );
}
