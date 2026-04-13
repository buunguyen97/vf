import { useState, useRef, useEffect } from 'react';
import { BatteryCharging } from 'lucide-react';

export default function BatteryInput({ batteryPercent, setBatteryPercent }) {
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
    setEditValue(String(batteryPercent));
    setIsEditing(true);
  };

  const handleEditConfirm = () => {
    const val = parseInt(editValue);
    if (!isNaN(val)) {
      setBatteryPercent(Math.max(1, Math.min(100, val)));
    }
    setIsEditing(false);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') handleEditConfirm();
    if (e.key === 'Escape') setIsEditing(false);
  };

  // Determine gradient based on battery percentage
  let gradientColor = "from-red-500 to-orange-500";
  let shadowGlow = "shadow-[0_0_10px_rgba(249,115,22,0.3)]";
  if (batteryPercent > 20) {
     gradientColor = "from-orange-500 to-yellow-500";
     shadowGlow = "shadow-[0_0_10px_rgba(234,179,8,0.3)]";
  }
  if (batteryPercent > 50) {
     gradientColor = "from-[#00B14F] to-[#20C997]";
     shadowGlow = "shadow-[0_0_10px_rgba(0,177,79,0.3)]";
  }

  return (
    <div className="bg-white/5 backdrop-blur-2xl rounded-xl p-3 md:p-3.5 border border-white/10 shadow-lg transition-all hover:bg-white/[0.07]">
      <div className="flex justify-between items-center mb-2">
        <h2 className="text-[11px] md:text-xs font-bold tracking-wide text-white/80 uppercase flex items-center gap-1.5">
          <BatteryCharging className="w-3.5 h-3.5 text-white/60" /> Mức Pin Hiện Tại
        </h2>
        {isEditing ? (
          <div className="flex items-center gap-1">
            <input
              ref={inputRef}
              type="number"
              min="1"
              max="100"
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onBlur={handleEditConfirm}
              onKeyDown={handleKeyDown}
              className="w-14 text-right text-lg font-black bg-black/60 border border-white/20 rounded px-1.5 py-0.5 text-white outline-none focus:border-[#00B14F] appearance-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
            />
            <span className="text-[10px] text-white/50">%</span>
          </div>
        ) : (
          <span
            onClick={handleEditStart}
            className={`text-xl md:text-2xl leading-none font-black text-transparent bg-clip-text bg-gradient-to-br ${gradientColor} cursor-pointer hover:opacity-80 transition-opacity select-none`}
            title="Nhấn để nhập tay"
          >
            {batteryPercent}<span className="text-[10px] md:text-xs">%</span>
          </span>
        )}
      </div>
      
      <div className="relative pb-1">
        <input 
          type="range" 
          min="1" 
          max="100" 
          value={batteryPercent} 
          onChange={(e) => setBatteryPercent(parseInt(e.target.value))}
          className="w-full h-1.5 appearance-none cursor-pointer rounded-full bg-white/10 outline-none"
          style={{
             accentColor: batteryPercent > 50 ? '#00B14F' : batteryPercent > 20 ? '#F59E0B' : '#EF4444',
             background: `linear-gradient(to right, ${batteryPercent > 50 ? '#00B14F' : batteryPercent > 20 ? '#F59E0B' : '#EF4444'} 0%, ${batteryPercent > 50 ? '#00B14F' : batteryPercent > 20 ? '#F59E0B' : '#EF4444'} ${batteryPercent}%, rgba(255,255,255,0.1) ${batteryPercent}%, rgba(255,255,255,0.1) 100%)`
          }}
        />
      </div>
    </div>
  );
}
