import { MapPin, Zap, Flag } from 'lucide-react';

export default function RouteItinerary({ stations, onStationSelect }) {
  if (!stations || stations.length === 0) return null;

  return (
    <div className="bg-white/5 backdrop-blur-3xl rounded-2xl p-5 border border-white/10 shadow-[0_10px_40px_rgba(20,100,244,0.1)] overflow-hidden shrink-0 mt-2 relative">
      {/* Decorative gradient */}
      <div className="absolute top-0 right-0 w-32 h-32 bg-[#00B14F]/10 blur-[40px] pointer-events-none"></div>

      <h2 className="text-[11px] font-black text-white/90 mb-5 uppercase tracking-[0.2em] flex items-center gap-2 relative z-10">
         <Zap className="w-4 h-4 text-[#00B14F]" /> Lộ Tối Ưu (Khuyên Dùng)
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
