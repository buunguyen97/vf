import { Activity } from 'lucide-react';

export default function RangeDisplay({ range, loading }) {
  return (
    <div className="bg-[#050505]/80 backdrop-blur-3xl p-5 md:p-6 rounded-2xl md:rounded-3xl shadow-[0_20px_50px_rgba(0,0,0,0.5)] border border-white/10 relative overflow-hidden group">
      
      {/* Glossy highlight */}
      <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-white/20 to-transparent"></div>
      
      <div className="flex justify-between items-center relative z-10">
        <div>
          <h2 className="text-[10px] md:text-xs font-black text-white/50 uppercase tracking-[0.2em] mb-1 flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#00B14F] opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-[#00B14F]"></span>
            </span>
             Phạm vi định mức
          </h2>
          <div className="flex items-baseline gap-2">
            {loading ? (
              <div className="flex items-center gap-3">
                 <div className="text-4xl md:text-6xl font-black text-white/20 animate-pulse tracking-tighter">---</div>
                 <div className="w-5 h-5 border-2 border-[#1464F4] border-t-transparent rounded-full animate-spin"></div>
              </div>
            ) : (
              <>
                <span className="text-5xl md:text-6xl font-black text-white tracking-tighter drop-shadow-[0_0_15px_rgba(255,255,255,0.3)] transition-all">
                   {range}
                </span>
                <span className="text-lg md:text-xl font-bold text-white/40">km</span>
              </>
            )}
          </div>
        </div>
        <div className="hidden md:flex bg-gradient-to-br from-[#1464F4]/20 to-transparent p-4 rounded-full border border-white/5 opacity-50 group-hover:opacity-100 transition-opacity">
          <Activity className="w-8 h-8 text-[#1464F4]" />
        </div>
      </div>
      
      <div className="mt-4 md:mt-5 bg-white/5 rounded-xl h-2 relative overflow-hidden">
         <div 
           className="absolute top-0 left-0 bottom-0 bg-gradient-to-r from-[#1464F4] to-[#00B14F] transition-all duration-1000 ease-out shadow-[0_0_10px_rgba(0,177,79,0.5)]"
           style={{ width: loading ? '0%' : `${Math.min(100, (range / 600) * 100)}%` }}
         ></div>
      </div>
      <p className="text-[9px] md:text-[10px] uppercase font-bold text-white/30 text-right mt-2 tracking-widest">VF Smart Engine</p>
    </div>
  );
}
