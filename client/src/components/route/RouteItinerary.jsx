import { useState } from 'react';
import { MapPin, Zap, Flag, Coffee, UtensilsCrossed, ChevronDown, ChevronUp, ExternalLink, Loader2, ShoppingBag, Store } from 'lucide-react';
import { evApi } from '../../services/api';

const AMENITY_ICONS = {
  restaurant: UtensilsCrossed,
  cafe: Coffee,
  fast_food: UtensilsCrossed,
  convenience: ShoppingBag,
  supermarket: Store
};

const AMENITY_LABELS = {
  restaurant: 'Nhà hàng',
  cafe: 'Café',
  fast_food: 'Đồ ăn nhanh',
  convenience: 'Cửa hàng tiện lợi',
  supermarket: 'Siêu thị'
};

const AMENITY_COLORS = {
  restaurant: '#F59E0B',
  cafe: '#8B5CF6',
  fast_food: '#EF4444',
  convenience: '#10B981',
  supermarket: '#3B82F6'
};

const AMENITY_EMOJI = {
  restaurant: '🍽️',
  cafe: '☕',
  fast_food: '🍔',
  convenience: '🏪',
  supermarket: '🛒'
};

function AmenityList({ station }) {
  const [amenities, setAmenities] = useState(null);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const loadAmenities = async () => {
    if (amenities) {
      setExpanded(!expanded);
      return;
    }
    setLoading(true);
    setExpanded(true);
    try {
      const data = await evApi.getNearbyAmenities(station.latitude, station.longitude, 500);
      setAmenities(data);
    } catch (err) {
      console.error(err);
      setAmenities([]);
    } finally {
      setLoading(false);
    }
  };

  const maxRadius = amenities && amenities.length > 0 
    ? amenities[amenities.length - 1].searchRadius 
    : null;

  return (
    <div className="mt-2">
      <button
        onClick={(e) => { e.stopPropagation(); loadAmenities(); }}
        className="flex items-center gap-1.5 text-[10px] font-semibold text-white/50 hover:text-white/80 transition-colors cursor-pointer group/amenity"
      >
        <Coffee className="w-3 h-3 group-hover/amenity:text-[#8B5CF6] transition-colors" />
        Quán ăn & Café gần đây
        {loading ? (
          <Loader2 className="w-3 h-3 animate-spin text-[#8B5CF6]" />
        ) : expanded ? (
          <ChevronUp className="w-3 h-3" />
        ) : (
          <ChevronDown className="w-3 h-3" />
        )}
        {amenities && !loading && (
          <span className={`px-1.5 rounded text-[9px] font-bold ${amenities.length > 0 ? 'bg-[#8B5CF6]/20 text-[#8B5CF6]' : 'bg-white/10 text-white/40'}`}>
            {amenities.length}
          </span>
        )}
      </button>

      {expanded && loading && (
        <div className="mt-2 flex items-center gap-2 pl-4">
          <Loader2 className="w-3.5 h-3.5 animate-spin text-[#8B5CF6]" />
          <span className="text-[10px] text-white/40 italic">Đang tìm quán ăn gần trạm sạc...</span>
        </div>
      )}

      {expanded && amenities && (
        <div className="mt-2 space-y-0.5 max-h-48 overflow-y-auto hide-scrollbar">
          {amenities.length === 0 ? (
            <p className="text-[10px] text-white/30 italic pl-4">Không tìm thấy quán ăn/café nào trong bán kính 3km</p>
          ) : (
            <>
              {maxRadius && maxRadius > 500 && (
                <div className="text-[9px] text-white/25 italic pl-4 mb-1">
                  🔍 Mở rộng tìm kiếm: bán kính {maxRadius >= 1000 ? `${maxRadius/1000}km` : `${maxRadius}m`}
                </div>
              )}
              {amenities.map((a, i) => {
                const Icon = AMENITY_ICONS[a.type] || Coffee;
                const color = AMENITY_COLORS[a.type] || '#8B5CF6';
                const emoji = AMENITY_EMOJI[a.type] || '📍';
                const label = AMENITY_LABELS[a.type] || a.type;
                return (
                  <a
                    key={i}
                    href={`https://www.google.com/maps/search/?api=1&query=${a.lat},${a.lng}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-white/5 transition-all group/item"
                  >
                    <div
                      className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0 text-[11px]"
                      style={{ backgroundColor: `${color}15`, border: `1px solid ${color}30` }}
                    >
                      {emoji}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] font-semibold text-white/70 truncate group-hover/item:text-white/90 transition-colors">
                        {a.name}
                      </p>
                      <p className="text-[9px] text-white/30">
                        {label} • {a.distance >= 1000 ? `${(a.distance/1000).toFixed(1)}km` : `${a.distance}m`}
                        {a.cuisine && ` • ${a.cuisine}`}
                      </p>
                    </div>
                    <ExternalLink className="w-2.5 h-2.5 text-white/15 group-hover/item:text-white/40 shrink-0 transition-colors" />
                  </a>
                );
              })}
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default function RouteItinerary({ stations, onStationSelect, insufficientBattery }) {
  if (!stations || stations.length === 0) return null;

  return (
    <div className="bg-[#0A0A0A]/95 backdrop-blur-xl rounded-2xl p-4 border border-white/10 shadow-[0_10px_40px_rgba(0,0,0,0.8)] overflow-hidden shrink-0 relative">
      {/* Decorative gradient */}
      <div className={`absolute top-0 right-0 w-32 h-32 ${insufficientBattery ? 'bg-[#DA303E]/15' : 'bg-[#00B14F]/10'} blur-[40px] pointer-events-none`}></div>

      {/* Emergency Warning Banner */}
      {insufficientBattery && (
        <div className="bg-gradient-to-r from-[#DA303E]/20 to-[#DA303E]/10 border border-[#DA303E]/30 rounded-xl p-3 mb-4 relative z-10 animate-pulse">
          <div className="flex items-start gap-2">
            <span className="text-lg shrink-0 mt-0.5">⚠️</span>
            <div>
              <p className="text-[11px] font-bold text-[#DA303E] uppercase tracking-wide">Pin Không Đủ Đến Điểm Đến</p>
              <p className="text-[10px] text-white/60 mt-1 leading-relaxed">
                Mức pin hiện tại quá thấp để đến đích. Hãy sạc tại trạm gần nhất bên dưới trước khi tiếp tục hành trình.
              </p>
            </div>
          </div>
        </div>
      )}

      <h2 className="text-[11px] font-black text-white/90 mb-5 uppercase tracking-[0.2em] flex items-center gap-2 relative z-10">
         <Zap className={`w-4 h-4 ${insufficientBattery ? 'text-[#DA303E]' : 'text-[#00B14F]'}`} />
         {insufficientBattery ? '⚡ Sạc Khẩn Cấp — Trạm Gần Nhất' : 'Lộ Tối Ưu (Khuyên Dùng)'}
      </h2>
      
      <div className="space-y-0 relative z-10 before:absolute before:top-4 before:bottom-4 before:left-[11px] before:w-px before:bg-gradient-to-b before:from-[#1464F4]/50 before:via-[#00B14F]/50 before:to-transparent">
        {stations.map((station, idx) => (
          <div 
            key={station.id} 
            className="flex gap-4 group cursor-pointer p-2 rounded-xl transition-all hover:bg-white/5 hover:translate-x-1"
            onClick={() => onStationSelect(station)}
          >
            {/* Timeline Line/Dot */}
            <div className="flex flex-col items-center shrink-0 mt-1">
              <div className="w-6 h-6 rounded-full bg-black border-2 border-white/20 flex items-center justify-center text-white/60 text-xs font-black z-10 shadow-[0_0_10px_rgba(0,0,0,0.5)] group-hover:border-[#00B14F] group-hover:text-[#00B14F] transition-all group-hover:shadow-[0_0_15px_rgba(0,177,79,0.4)]">
                {idx + 1}
              </div>
            </div>

            {/* Station info */}
            <div className="pb-3 w-full border-b border-white/5 group-last:border-0 relative">
              <h3 className="font-bold text-white/90 text-sm leading-tight group-hover:text-white transition-colors">
                {station.name}
              </h3>
              <p className="text-xs text-white/40 mt-1 line-clamp-1 group-hover:text-white/60 transition-colors">{station.address}</p>
              
              <div className="flex items-center gap-2 mt-2.5">
                <span className="text-[10px] font-bold tracking-wider uppercase bg-white/10 text-white/70 px-2 py-0.5 rounded border border-white/5">
                  Km {Math.round(station.distanceFromStartKm || 0)}
                </span>
                <span className="text-[10px] font-bold bg-gradient-to-r from-[#00B14F]/20 to-[#20C997]/20 text-[#20C997] px-2 py-0.5 rounded shadow-[inset_0_0_10px_rgba(0,177,79,0.1)] border border-[#00B14F]/20">
                  Dự Kiến: {station.batteryAtStation}%
                </span>
              </div>

              {/* Nearby amenities toggle */}
              <AmenityList station={station} />
            </div>
          </div>
        ))}

         <div className="flex gap-4 group p-2 rounded-xl mt-2 opacity-60">
            <div className="flex flex-col items-center shrink-0 mt-1">
              <div className="w-6 h-6 rounded-full bg-[#1464F4] flex items-center justify-center z-10 shadow-[0_0_15px_rgba(20,100,244,0.5)]">
                 <Flag className="w-3 h-3 text-white" />
              </div>
            </div>
            <div className="pb-3 w-full pt-1">
              <h3 className="font-bold text-white/90 text-sm uppercase tracking-wide">Điểm Đến</h3>
            </div>
          </div>
      </div>
    </div>
  );
}
