import { MapPinned } from 'lucide-react';

export default function Header({ onOpenMap }) {
  return (
    <header className="bg-black border-b border-white/10 text-white p-3 md:p-4 z-[1000] relative shadow-lg">
      <div className="max-w-[1600px] mx-auto flex items-center justify-between">
        <div className="flex items-center gap-3 group cursor-pointer">
          <img
            src="/logo-variants/logo-charge-pin-v4.svg"
            alt="Gợi Ý Trạm Sạc"
            className="h-11 w-11 rounded-xl object-cover shadow-[0_0_20px_rgba(0,177,79,0.28)] md:h-12 md:w-12"
          />
          <div>
            <h1 className="text-xl md:text-2xl font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white via-gray-200 to-gray-400">
              Gợi Ý Trạm Sạc
            </h1>
            <p className="text-[10px] md:text-xs text-[#00B14F] font-semibold uppercase tracking-[0.2em] mt-0.5">
              Hệ thống đề xuất hành trình
            </p>
          </div>
        </div>
        
        <div className="hidden md:flex items-center gap-4 text-sm font-medium">
           <a href="#" className="px-4 py-2 rounded-full hover:bg-white/5 text-white/70 hover:text-white transition-colors">Tuyến đường</a>
           <a href="#" className="px-4 py-2 rounded-full hover:bg-white/5 text-white/70 hover:text-white transition-colors">Trạm sạc</a>
           <button
             type="button"
             onClick={onOpenMap}
             className="px-5 py-2.5 rounded-full bg-white/10 hover:bg-white/20 border border-white/10 shadow-lg text-white font-semibold flex items-center gap-2 transition-all"
           >
             <MapPinned className="w-4 h-4" /> Bản đồ toàn cảnh
           </button>
        </div>
      </div>
    </header>
  );
}
