import { Activity } from 'lucide-react';

export default function RangeDisplay({ range, loading }) {
  return (
    <div className="bg-white/5 backdrop-blur-2xl p-3 md:p-3.5 rounded-xl border border-white/10 shadow-lg relative overflow-hidden">
      
      {/* Glossy highlight */}
      <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-white/15 to-transparent"></div>
      
      <div className="flex justify-between items-center relative z-10">
        <div className="flex items-center gap-3">
          <div>
            <h2 className="text-[10px] md:text-[11px] font-bold text-white/40 uppercase tracking-[0.15em] mb-0.5 flex items-center gap-1.5">
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#00B14F] opacity-75"></span>
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-[#00B14F]"></span>
              </span>
               Km có thể đi được
            </h2>
            <div className="flex items-baseline gap-1">
              {loading ? (
                <div className="flex items-center gap-2">
                   <div className="text-2xl font-black text-white/20 animate-pulse tracking-tighter">---</div>
                   <div className="w-3.5 h-3.5 border-2 border-[#1464F4] border-t-transparent rounded-full animate-spin"></div>
                </div>
              ) : (
                <>
                  <span className="text-2xl md:text-3xl font-black text-white tracking-tight drop-shadow-[0_0_10px_rgba(255,255,255,0.2)] transition-all">
                     {range}
                  </span>
                  <span className="text-xs md:text-sm font-semibold text-white/35">km</span>
                </>
              )}
            </div>
          </div>
        </div>
        <div className="flex bg-gradient-to-br from-[#1464F4]/15 to-transparent p-2.5 rounded-full border border-white/5 opacity-60">
          <Activity className="w-5 h-5 text-[#1464F4]" />
        </div>
      </div>
      
      <div className="mt-2 bg-white/5 rounded-full h-1.5 relative overflow-hidden">
         <div 
           className="absolute top-0 left-0 bottom-0 bg-gradient-to-r from-[#1464F4] to-[#00B14F] transition-all duration-1000 ease-out shadow-[0_0_8px_rgba(0,177,79,0.4)]"
           style={{ width: loading ? '0%' : `${Math.min(100, (range / 600) * 100)}%` }}
         ></div>
      </div>
      <p className="text-[9px] md:text-[10px] uppercase font-bold text-white/20 text-right mt-1.5 tracking-widest">VF Smart Engine</p>
    </div>
  );
}
