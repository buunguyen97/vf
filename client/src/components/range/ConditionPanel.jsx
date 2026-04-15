import { useState, useRef, useEffect } from 'react';
import { Thermometer, Wind, Settings2 } from 'lucide-react';

// Reusable inline editable value badge
function EditableBadge({ value, unit, min, max, step, onChange, className = '' }) {
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
    setEditValue(String(value));
    setIsEditing(true);
  };

  const handleEditConfirm = () => {
    const val = parseFloat(editValue);
    if (!isNaN(val)) {
      const clamped = Math.max(min, Math.min(max, step ? Math.round(val / step) * step : val));
      onChange(clamped);
    }
    setIsEditing(false);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') handleEditConfirm();
    if (e.key === 'Escape') setIsEditing(false);
  };

  if (isEditing) {
    return (
      <div className={`font-mono bg-black/60 border border-white/20 rounded flex items-center gap-0.5 ${className}`}>
        <input
          ref={inputRef}
          type="number"
          min={min}
          max={max}
          step={step}
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={handleEditConfirm}
          onKeyDown={handleKeyDown}
          className="w-12 text-right text-[10px] font-mono bg-transparent border-none text-white outline-none px-1 py-0.5 appearance-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        />
        <span className="text-[10px] text-white/50 pr-1">{unit}</span>
      </div>
    );
  }

  return (
    <span
      onClick={handleEditStart}
      className={`font-mono bg-black/40 px-1.5 py-0.5 rounded border border-white/10 text-[10px] cursor-pointer hover:bg-black/60 hover:border-white/20 transition-all select-none ${className}`}
      title="Nhấn để nhập tay"
    >
      {value} {unit}
    </span>
  );
}

export default function ConditionPanel({ conditions, setConditions, locationName }) {
  const speed = conditions.speed;
  const temp = conditions.temperature;
  const acOn = conditions.acOn;

  let speedFactor = 1.0;
  if (speed <= 70) speedFactor = 1.00;
  else if (speed <= 80) speedFactor = 1.05;
  else if (speed <= 90) speedFactor = 1.12;
  else if (speed <= 100) speedFactor = 1.20;
  else if (speed <= 110) speedFactor = 1.30;
  else speedFactor = 1.40;

  let tempFactor = 1.0;
  if (temp >= 20 && temp <= 30) tempFactor = 1.00;
  else if (temp >= 31 && temp <= 35) tempFactor = 1.05;
  else if (temp > 35) tempFactor = 1.10;
  else if (temp >= 10 && temp <= 19) tempFactor = 1.08;
  else tempFactor = 1.15;

  const acFactor = acOn ? 1.05 : 1.00;

  const degradationPercent = Math.max(0, Math.round((((speedFactor * tempFactor * acFactor) - 1) * 100) / 2.5));

  return (
    <div className="bg-white/5 backdrop-blur-2xl rounded-xl p-3 md:p-3.5 border border-white/10 shadow-lg relative overflow-hidden">
      <h2 className="text-[11px] md:text-xs font-bold text-white/80 mb-2.5 uppercase tracking-wide flex items-center gap-1.5">
        <Settings2 className="w-3.5 h-3.5 text-white/60" /> Điều Kiện Lái Xe
      </h2>
      
      <div className="space-y-3 relative z-10">
        {/* Speed */}
        <div>
          <div className="flex justify-between text-[11px] md:text-xs mb-1.5 text-white/70 font-medium items-center">
            <span className="flex items-center gap-1.5"><Thermometer className="w-3.5 h-3.5 text-[#F59E0B]" /> Tốc Độ</span>
            <EditableBadge
              value={conditions.speed}
              unit="km/h"
              min={30}
              max={120}
              step={10}
              onChange={(val) => setConditions({...conditions, speed: val})}
            />
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
        
        {/* Temperature */}
        <div>
          <div className="flex justify-between text-[11px] md:text-xs mb-1.5 text-white/70 font-medium items-center">
            <span className="flex items-center gap-1.5 min-w-0">
              <Thermometer className="w-3.5 h-3.5 text-[#1464F4] shrink-0" />
              <span className="truncate">Nhiệt Độ Ngoài Trời{locationName ? ` (${locationName})` : ''}</span>
            </span>
            <EditableBadge
              value={conditions.temperature}
              unit="°C"
              min={-10}
              max={50}
              step={1}
              onChange={(val) => setConditions({...conditions, temperature: val})}
            />
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

        {/* Degradation Show */}
        <div className="flex justify-between items-center text-[11px] md:text-xs bg-black/30 px-2.5 py-2 rounded-lg border border-white/5">
           <span className="text-white/70 font-medium">Trừ hao tổng pin</span>
           <span className={`font-mono font-bold ${degradationPercent > 0 ? 'text-[#DA303E]' : 'text-[#00B14F]'}`}>
             {degradationPercent}%
           </span>
        </div>
        
        {/* AC Toggle */}
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
