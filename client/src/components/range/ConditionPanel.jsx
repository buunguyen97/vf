import { Thermometer, Wind, Settings2 } from 'lucide-react';

export default function ConditionPanel({ conditions, setConditions }) {
  return (
    <div className="bg-white/5 backdrop-blur-2xl rounded-xl p-3 md:p-4 border border-white/10 shadow-lg relative overflow-hidden">
      <h2 className="text-xs font-bold text-white/90 mb-3 uppercase tracking-wide flex items-center gap-2">
        <Settings2 className="w-3.5 h-3.5 text-white/50" /> Điều Kiện Lái Xe
      </h2>
      
      <div className="space-y-4 relative z-10">
        <div>
          <div className="flex justify-between text-xs mb-1.5 text-white/80 font-medium items-center">
            <span className="flex items-center gap-1.5"><Thermometer className="w-3.5 h-3.5 text-[#F59E0B]" /> Tốc Độ</span>
            <span className="font-mono bg-black/40 px-1.5 py-0.5 rounded border border-white/10 text-[10px]">{conditions.speed} km/h</span>
          </div>
          <input 
            type="range" 
            min="30" 
            max="120" 
            step="10"
            value={conditions.speed} 
            onChange={(e) => setConditions({...conditions, speed: parseInt(e.target.value)})}
            className="w-full h-1 bg-white/10 rounded-full appearance-none accent-[#F59E0B] outline-none"
          />
        </div>
        
        <div>
          <div className="flex justify-between text-xs mb-1.5 text-white/80 font-medium items-center">
            <span className="flex items-center gap-1.5"><Thermometer className="w-3.5 h-3.5 text-[#1464F4]" /> Nhiệt Độ</span>
            <span className="font-mono bg-black/40 px-1.5 py-0.5 rounded border border-white/10 text-[10px]">{conditions.temperature} °C</span>
          </div>
          <input 
            type="range" 
            min="-10" 
            max="50" 
            step="1"
            value={conditions.temperature} 
            onChange={(e) => setConditions({...conditions, temperature: parseInt(e.target.value)})}
            className="w-full h-1 bg-white/10 rounded-full appearance-none accent-[#1464F4] outline-none"
          />
        </div>
        
        <label className="flex items-center gap-2.5 p-2 bg-black/30 border border-white/5 rounded-lg cursor-pointer hover:bg-black/40 transition-colors">
          <div className="relative">
             <input 
               type="checkbox" 
               checked={conditions.acOn}
               onChange={(e) => setConditions({...conditions, acOn: e.target.checked})}
               className="sr-only"
             />
             <div className={`block w-8 h-4 rounded-full transition-colors ${conditions.acOn ? 'bg-[#1464F4]' : 'bg-gray-700'}`}></div>
             <div className={`absolute left-[2px] top-[2px] bg-white w-3 h-3 rounded-full transition-transform ${conditions.acOn ? 'transform translate-x-4' : ''}`}></div>
          </div>
          <span className="text-[11px] font-bold text-white/80 uppercase tracking-wide flex items-center gap-1.5">
             <Wind className={`w-3.5 h-3.5 ${conditions.acOn ? 'text-[#1464F4]' : 'text-gray-500'}`} />
             Điều Hòa Lạnh
          </span>
        </label>
      </div>
    </div>
  );
}
