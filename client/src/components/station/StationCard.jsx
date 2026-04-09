import { useState, useEffect } from 'react';
import { BatteryCharging, ExternalLink, Zap, AlertTriangle, CheckCircle2, Coffee, UtensilsCrossed, ShoppingBag, Store, Loader2, ChevronDown, ChevronUp } from 'lucide-react';
import { evApi } from '../../services/api';

const AMENITY_EMOJI = {
  restaurant: '🍽️', cafe: '☕', fast_food: '🍔',
  convenience: '🏪', supermarket: '🛒'
};
const AMENITY_LABELS = {
  restaurant: 'Nhà hàng', cafe: 'Café', fast_food: 'Đồ ăn nhanh',
  convenience: 'Tiện lợi', supermarket: 'Siêu thị'
};

export default function StationCard({ station, reachability, onClose }) {
  if (!station) return null;

  const [amenities, setAmenities] = useState(null);
  const [loadingAmenities, setLoadingAmenities] = useState(false);
  const [showAmenities, setShowAmenities] = useState(false);

  const loadAmenities = async () => {
    if (amenities) {
      setShowAmenities(!showAmenities);
      return;
    }
    setLoadingAmenities(true);
    setShowAmenities(true);
    try {
      const data = await evApi.getNearbyAmenities(station.latitude, station.longitude, 500);
      setAmenities(data);
    } catch (err) {
      console.error(err);
      setAmenities([]);
    } finally {
      setLoadingAmenities(false);
    }
  };

  return (
    <div className="absolute top-[60px] md:top-4 right-2 md:right-4 left-2 md:left-auto md:w-[360px] z-[1000] bg-white rounded-2xl shadow-2xl border border-gray-200 overflow-hidden animate-in fade-in slide-in-from-bottom-5 md:slide-in-from-right text-gray-900 pointer-events-auto">
      <div className="bg-[#1464F4] p-4 flex justify-between items-start text-white relative overflow-hidden">
        <div className="absolute -right-4 -top-8 opacity-20 transform rotate-12">
           <Zap className="w-32 h-32" />
        </div>
        <div className="relative z-10 w-full pr-6">
          <h3 className="font-bold text-lg leading-tight">{station.name}</h3>
          <p className="opacity-80 text-xs mt-1 line-clamp-1">{station.city}</p>
        </div>
        <button 
          onClick={onClose}
          className="absolute top-3 right-3 z-20 text-white/80 hover:text-white p-1 bg-black/10 rounded-full hover:bg-black/20 transition-colors"
        >
          ✕
        </button>
      </div>
      
      <div className="p-4 md:p-5 space-y-3 md:space-y-4 max-h-[60vh] overflow-y-auto">
        {/* Basic Info */}
        <div>
          <p className="text-sm text-gray-600 leading-snug line-clamp-2 md:line-clamp-none">{station.address}</p>
          <div className="flex gap-2 mt-2">
            <span className="flex items-center gap-1 text-xs font-semibold bg-[#1464F4]/10 text-[#1464F4] px-2.5 py-1 rounded-md">
              <Zap className="w-3.5 h-3.5" />
              {station.power_kw} kW
            </span>
            <span className="flex items-center gap-1 text-xs font-semibold bg-gray-100 text-gray-700 px-2.5 py-1 rounded-md">
              {station.connector_type || 'CCS2'}
            </span>
          </div>
        </div>

        {/* Reachability Status */}
        {reachability ? (
          <div className={`p-3 md:p-4 rounded-xl border ${reachability.canReach ? 'bg-[#00B14F]/10 border-[#00B14F]/20' : 'bg-[#DA303E]/10 border-[#DA303E]/20'}`}>
            <div className="flex items-start gap-3">
              {reachability.canReach ? (
                 <CheckCircle2 className="w-5 h-5 text-[#00B14F] shrink-0 mt-0.5" />
              ) : (
                 <AlertTriangle className="w-5 h-5 text-[#DA303E] shrink-0 mt-0.5" />
              )}
              <div>
                <p className={`font-bold text-sm ${reachability.canReach ? 'text-[#007032]' : 'text-[#A0222C]'}`}>
                  {reachability.canReach ? 'Có thể đến nơi an toàn' : 'Không thể đến nơi'}
                </p>
                {reachability.canReach && (
                  <p className="text-xs md:text-sm text-gray-700 mt-1">
                    {reachability.fromRoutePlanner 
                      ? <>Pin dự kiến chặng: <span className="font-bold text-black">{reachability.batteryLeftPercent}%</span></>
                      : <>Còn khoảng <span className="font-bold text-black">{reachability.batteryLeftPercent}%</span> pin khi đến trạm này ({Math.round(reachability.distanceKm)} km).</>
                    }
                  </p>
                )}
                {!reachability.canReach && (
                  <p className="text-xs md:text-sm text-gray-700 mt-1">
                    Cần sạc ở trạm chiều gần hơn. Trạm này ở khoảng cách {Math.round(reachability.distanceKm)} km.
                  </p>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="text-center p-4">
             <div className="w-6 h-6 border-2 border-gray-300 border-t-[#1464F4] rounded-full animate-spin mx-auto"></div>
             <p className="text-xs text-gray-500 mt-2">Đang phân tích...</p>
          </div>
        )}

        {/* Nearby Amenities Section */}
        <div className="border border-gray-100 rounded-xl overflow-hidden">
          <button
            onClick={loadAmenities}
            className="w-full flex items-center justify-between px-3 py-2.5 bg-gray-50 hover:bg-gray-100 transition-colors"
          >
            <span className="flex items-center gap-2 text-xs font-semibold text-gray-600">
              <Coffee className="w-3.5 h-3.5 text-[#8B5CF6]" />
              Quán ăn & Café gần trạm
              {amenities && (
                <span className="bg-[#8B5CF6]/10 text-[#8B5CF6] px-1.5 py-0.5 rounded text-[10px] font-bold">{amenities.length}</span>
              )}
            </span>
            {loadingAmenities ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-[#8B5CF6]" />
            ) : showAmenities ? (
              <ChevronUp className="w-3.5 h-3.5 text-gray-400" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
            )}
          </button>

          {showAmenities && loadingAmenities && (
            <div className="p-3 flex items-center gap-2 justify-center">
              <Loader2 className="w-4 h-4 animate-spin text-[#8B5CF6]" />
              <span className="text-xs text-gray-400">Đang tìm...</span>
            </div>
          )}

          {showAmenities && amenities && (
            <div className="max-h-44 overflow-y-auto">
              {amenities.length === 0 ? (
                <p className="text-xs text-gray-400 italic p-3 text-center">Không tìm thấy quán ăn/café nào gần đây</p>
              ) : (
                <div className="divide-y divide-gray-50">
                  {amenities.map((a, i) => (
                    <a
                      key={i}
                      href={`https://www.google.com/maps/search/?api=1&query=${a.lat},${a.lng}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2.5 px-3 py-2 hover:bg-gray-50 transition-colors group/a"
                    >
                      <span className="text-base shrink-0">{AMENITY_EMOJI[a.type] || '📍'}</span>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium text-gray-700 truncate group-hover/a:text-gray-900">{a.name}</p>
                        <p className="text-[10px] text-gray-400">
                          {AMENITY_LABELS[a.type] || a.type} • {a.distance >= 1000 ? `${(a.distance/1000).toFixed(1)}km` : `${a.distance}m`}
                          {a.cuisine && ` • ${a.cuisine}`}
                        </p>
                      </div>
                      <ExternalLink className="w-3 h-3 text-gray-300 group-hover/a:text-gray-500 shrink-0" />
                    </a>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <button 
          className="w-full flex items-center justify-center gap-2 bg-[#0A0A0A] hover:bg-black text-white font-medium py-3 rounded-xl transition-colors text-sm md:text-base shadow-lg"
          onClick={() => window.open(`https://www.google.com/maps/dir/?api=1&destination=${station.latitude},${station.longitude}`, '_blank')}
        >
          <ExternalLink className="w-4 h-4" /> Bắt đầu chỉ đường bằng Google Maps
        </button>
      </div>
    </div>
  );
}
