import { useState, useRef, useEffect } from 'react';
import { Target } from 'lucide-react';

export default function TargetBatteryInput({ targetBatteryPercent, setTargetBatteryPercent }) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState('');
  const inputRef = useRef(null);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleEditStart = () => {
    setEditValue(String(targetBatteryPercent));
    setIsEditing(true);
  };

  const handleEditConfirm = () => {
    const val = parseInt(editValue);
    if (!isNaN(val)) {
      setTargetBatteryPercent(Math.max(10, Math.min(50, val)));
    }
    setIsEditing(false);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') handleEditConfirm();
    if (e.key === 'Escape') setIsEditing(false);
  };

  return (
    <div className="bg-white/5 backdrop-blur-2xl rounded-xl p-3 md:p-3.5 border border-white/10 shadow-lg transition-all hover:bg-white/[0.07] relative overflow-hidden">
      
      <div className="absolute -right-8 -bottom-8 w-20 h-20 bg-[#1464F4]/20 rounded-full blur-[20px] pointer-events-none"></div>

      <div className="flex justify-between items-center mb-2 relative z-10">
        <h2 className="text-[11px] md:text-xs font-bold tracking-wide text-white/80 uppercase flex items-center gap-1.5">
          <Target className="w-3.5 h-3.5 text-[#1464F4]" /> Pin Lịch Trình (Target)
        </h2>
        {isEditing ? (
          <div className="bg-[#1464F4]/10 border border-[#1464F4]/30 px-2 py-0.5 rounded-lg shadow-[0_0_10px_rgba(20,100,244,0.2)] flex items-center gap-1">
            <input
              ref={inputRef}
              type="number"
              min="10"
              max="50"
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onBlur={handleEditConfirm}
              onKeyDown={handleKeyDown}
              className="w-10 text-right text-sm font-bold font-mono bg-transparent border-none text-[#1464F4] outline-none appearance-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
            />
            <span className="text-sm font-bold font-mono text-[#1464F4]">%</span>
          </div>
        ) : (
          <div
            onClick={handleEditStart}
            className="bg-[#1464F4]/10 border border-[#1464F4]/30 px-2 py-0.5 rounded-lg shadow-[0_0_10px_rgba(20,100,244,0.2)] cursor-pointer hover:bg-[#1464F4]/20 transition-colors"
            title="Nhấn để nhập tay"
          >
            <span className="text-sm font-bold font-mono text-[#1464F4]">{targetBatteryPercent}%</span>
          </div>
        )}
      </div>
      
      <div className="relative z-10 pb-1">
        <input 
          type="range" 
          min="10" 
          max="50" 
          step="5"
          value={targetBatteryPercent} 
          onChange={(e) => setTargetBatteryPercent(parseInt(e.target.value))}
          className="w-full h-1.5 rounded-full appearance-none cursor-pointer outline-none bg-white/10 accent-[#1464F4]"
          style={{
             background: `linear-gradient(to right, #1464F4 0%, #1464F4 ${((targetBatteryPercent - 10) / 40) * 100}%, rgba(255,255,255,0.1) ${((targetBatteryPercent - 10) / 40) * 100}%, rgba(255,255,255,0.1) 100%)`
          }}
        />
        <div className="flex justify-between mt-1.5 text-[9px] md:text-[10px] font-bold text-white/40 uppercase tracking-widest">
          <span>Kháng (10%)</span>
          <span className="text-[#1464F4]">Lý tưởng (25%)</span>
          <span>Dư dả (50%)</span>
        </div>
      </div>
    </div>
  );
}
