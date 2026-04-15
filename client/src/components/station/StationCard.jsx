import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronUp, Coffee, ExternalLink, MapPinned, Route, Zap } from 'lucide-react';

export default function StationCard({ station, reachability, routeInfo, onClose }) {
  const [showFutureAmenities, setShowFutureAmenities] = useState(false);

  useEffect(() => {
    setShowFutureAmenities(false);
  }, [station?.id, station?.latitude, station?.longitude]);

  if (!station) return null;

  return (
    <div className="pointer-events-auto absolute left-2 right-2 top-[60px] z-[1000] overflow-hidden rounded-2xl border border-gray-200 bg-white text-gray-900 shadow-2xl animate-in fade-in slide-in-from-bottom-5 md:left-auto md:right-4 md:top-4 md:w-[360px] md:slide-in-from-right">
      <div className="relative flex items-start justify-between overflow-hidden bg-[#1464F4] p-4 text-white">
        <div className="absolute -right-4 -top-8 rotate-12 opacity-20">
          <Zap className="h-32 w-32" />
        </div>
        <div className="relative z-10 w-full pr-6">
          <h3 className="text-lg font-bold leading-tight">{station.name}</h3>
          <p className="mt-1 text-xs opacity-80">{station.city}</p>
        </div>
        <button
          onClick={onClose}
          className="absolute right-3 top-3 z-20 rounded-full bg-black/10 p-1 text-white/80 transition-colors hover:bg-black/20 hover:text-white"
        >
          ✕
        </button>
      </div>

      <div className="max-h-[60vh] space-y-3 overflow-y-auto p-4 md:space-y-4 md:p-5">
        <div>
          <p className="text-sm leading-snug text-gray-600">{station.address}</p>
          <div className="mt-2 flex gap-2">
            <span className="flex items-center gap-1 rounded-md bg-[#1464F4]/10 px-2.5 py-1 text-xs font-semibold text-[#1464F4]">
              <Zap className="h-3.5 w-3.5" />
              {station.power_kw} kW
            </span>
            <span className="rounded-md bg-gray-100 px-2.5 py-1 text-xs font-semibold text-gray-700">
              {station.connector_type || 'CCS2'}
            </span>
          </div>
        </div>

        {routeInfo && (
          <div className="rounded-xl border border-[#1464F4]/15 bg-[#1464F4]/6 p-3">
            <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-[#1464F4]">
              <Route className="h-3.5 w-3.5" />
              Quãng đường trên tuyến
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-lg bg-white px-3 py-2 shadow-sm">
                <p className="text-[10px] uppercase tracking-wide text-gray-400">Đến trạm</p>
                <p className="mt-1 text-lg font-bold text-gray-900">{routeInfo.distanceToStationKm} km</p>
              </div>
              <div className="rounded-lg bg-[#e0f2fe] px-3 py-2 shadow-sm">
                <p className="text-[10px] uppercase tracking-wide text-sky-600/70">Đến điểm đến</p>
                <p className="mt-1 text-lg font-bold text-sky-800">{routeInfo.distanceToDestinationKm} km</p>
              </div>
            </div>
          </div>
        )}

        {reachability ? (
          <div className={`rounded-xl border p-3 md:p-4 ${reachability.canReach ? 'border-[#00B14F]/20 bg-[#00B14F]/10' : 'border-[#DA303E]/20 bg-[#DA303E]/10'}`}>
            <div className="flex items-start gap-3">
              {reachability.canReach ? (
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-[#00B14F]" />
              ) : (
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-[#DA303E]" />
              )}
              <div>
                <p className={`text-sm font-bold ${reachability.canReach ? 'text-[#007032]' : 'text-[#A0222C]'}`}>
                  {reachability.canReach ? 'Có thể đến nơi an toàn' : 'Không thể đến nơi'}
                </p>
                {reachability.canReach && (
                  <p className="mt-1 text-xs text-gray-700 md:text-sm">
                    {reachability.fromRoutePlanner ? (
                      <>
                        Pin dự kiến chặng: <span className="font-bold text-black">{reachability.batteryLeftPercent}%</span>
                        {reachability.minBatteryPercent ? (
                          <span className="text-gray-600">, giữ trên ngưỡng an toàn {reachability.minBatteryPercent}%.</span>
                        ) : null}
                      </>
                    ) : (
                      <>
                        Còn khoảng <span className="font-bold text-black">{reachability.batteryLeftPercent}%</span> pin khi đến trạm này ({Math.round(reachability.distanceKm)} km).
                      </>
                    )}
                  </p>
                )}
                {!reachability.canReach && (
                  <p className="mt-1 text-xs text-gray-700 md:text-sm">
                    Cần sạc ở trạm gần hơn. Trạm này ở khoảng cách {Math.round(reachability.distanceKm)} km.
                  </p>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="p-4 text-center">
            <div className="mx-auto h-6 w-6 animate-spin rounded-full border-2 border-gray-300 border-t-[#1464F4]"></div>
            <p className="mt-2 text-xs text-gray-500">Đang phân tích...</p>
          </div>
        )}

        <div className="overflow-hidden rounded-xl border border-gray-100">
          <button
            onClick={() => setShowFutureAmenities((prev) => !prev)}
            className="flex w-full items-center justify-between bg-gray-50 px-3 py-2.5 transition-colors hover:bg-gray-100"
          >
            <span className="flex items-center gap-2 text-xs font-semibold text-gray-600">
              <Coffee className="h-3.5 w-3.5 text-[#16a34a]" />
              Quán ăn và Coffee xung quanh
            </span>
            {showFutureAmenities ? (
              <ChevronUp className="h-3.5 w-3.5 text-gray-400" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5 text-gray-400" />
            )}
          </button>

          {showFutureAmenities && (
            <div className="border-t border-gray-100 bg-white px-3 py-3">
              <div className="flex items-start gap-2 rounded-lg border border-[#16a34a]/15 bg-[#16a34a]/5 px-3 py-2.5">
                <MapPinned className="mt-0.5 h-4 w-4 shrink-0 text-[#16a34a]" />
                <p className="text-xs leading-relaxed text-gray-600">
                  Tính năng này sẽ ra mắt trong tương lai.
                </p>
              </div>
            </div>
          )}
        </div>

        <button
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#0A0A0A] py-3 text-sm font-medium text-white shadow-lg transition-colors hover:bg-black"
          onClick={() => window.open(`https://www.google.com/maps/dir/?api=1&destination=${station.latitude},${station.longitude}`, '_blank')}
        >
          <ExternalLink className="h-4 w-4" /> Bắt đầu đi với Google Map
        </button>
      </div>
    </div>
  );
}
