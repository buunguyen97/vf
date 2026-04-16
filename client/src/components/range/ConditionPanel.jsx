import { useEffect, useRef, useState } from 'react';
import { Settings2, Thermometer, Wind } from 'lucide-react';

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
    if (!Number.isNaN(val)) {
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
      <div className={`flex items-center gap-0.5 rounded border border-white/20 bg-black/60 font-mono ${className}`}>
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
          className="w-12 appearance-none border-none bg-transparent px-1 py-0.5 text-right text-[10px] font-mono text-white outline-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        />
        <span className="pr-1 text-[10px] text-white/50">{unit}</span>
      </div>
    );
  }

  return (
    <span
      onClick={handleEditStart}
      className={`cursor-pointer select-none rounded border border-white/10 bg-black/40 px-1.5 py-0.5 text-[10px] font-mono transition-all hover:border-white/20 hover:bg-black/60 ${className}`}
      title="Nhấn để nhập tay"
    >
      {value} {unit}
    </span>
  );
}

function softenFactor(factor = 1) {
  return 1 + ((factor - 1) / 2);
}

export default function ConditionPanel({ conditions, setConditions, locationName }) {
  const speed = conditions.speed;
  const temp = conditions.temperature;
  const acOn = conditions.acOn;

  let speedFactor = 1.0;
  if (speed <= 70) speedFactor = 1.0;
  else if (speed <= 80) speedFactor = 1.05;
  else if (speed <= 90) speedFactor = 1.12;
  else if (speed <= 100) speedFactor = 1.2;
  else if (speed <= 110) speedFactor = 1.3;
  else speedFactor = 1.4;

  let tempFactor = 1.0;
  if (temp >= 20 && temp <= 30) tempFactor = 1.0;
  else if (temp >= 31 && temp <= 35) tempFactor = 1.05;
  else if (temp > 35) tempFactor = 1.1;
  else if (temp >= 10 && temp <= 19) tempFactor = 1.08;
  else tempFactor = 1.15;

  const softenedSpeedFactor = softenFactor(speedFactor);
  const softenedTempFactor = softenFactor(tempFactor);
  const acFactor = acOn ? 1.05 : 1.0;

  const degradationPercent = Math.max(
    0,
    Number((((softenedSpeedFactor * softenedTempFactor * acFactor) - 1) * 100 / 2.5).toFixed(1)),
  );

  return (
    <div className="relative overflow-hidden rounded-xl border border-white/10 bg-[#111111] p-3 shadow-lg md:p-3.5">
      <h2 className="mb-2.5 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-white/80 md:text-xs">
        <Settings2 className="h-3.5 w-3.5 text-white/60" /> Điều Kiện Lái Xe
      </h2>

      <div className="relative z-10 space-y-3">
        <div>
          <div className="mb-1.5 flex items-center justify-between text-[11px] font-medium text-white/70 md:text-xs">
            <span className="flex items-center gap-1.5">
              <Thermometer className="h-3.5 w-3.5 text-[#F59E0B]" /> Tốc Độ
            </span>
            <EditableBadge
              value={conditions.speed}
              unit="km/h"
              min={30}
              max={120}
              step={10}
              onChange={(val) => setConditions({ ...conditions, speed: val })}
            />
          </div>
          <input
            type="range"
            min="30"
            max="120"
            step="10"
            value={conditions.speed}
            onChange={(e) => setConditions({ ...conditions, speed: parseInt(e.target.value, 10) })}
            className="h-1 w-full appearance-none rounded-full bg-white/10 accent-[#F59E0B] outline-none"
          />
        </div>

        <div>
          <div className="mb-1.5 flex items-center justify-between text-[11px] font-medium text-white/70 md:text-xs">
            <span className="flex min-w-0 items-center gap-1.5">
              <Thermometer className="h-3.5 w-3.5 shrink-0 text-[#1464F4]" />
              <span className="truncate">Nhiệt Độ Ngoài Trời{locationName ? ` (${locationName})` : ''}</span>
            </span>
            <EditableBadge
              value={conditions.temperature}
              unit="°C"
              min={-10}
              max={50}
              step={1}
              onChange={(val) => setConditions({ ...conditions, temperature: val })}
            />
          </div>
          <input
            type="range"
            min="-10"
            max="50"
            step="1"
            value={conditions.temperature}
            onChange={(e) => setConditions({ ...conditions, temperature: parseInt(e.target.value, 10) })}
            className="h-1 w-full appearance-none rounded-full bg-white/10 accent-[#1464F4] outline-none"
          />
        </div>

        <div className="flex items-center justify-between rounded-lg border border-white/5 bg-black/30 px-2.5 py-2 text-[11px] md:text-xs">
          <span className="font-medium text-white/70">Trừ hao tổng pin</span>
          <span className={`font-mono font-bold ${degradationPercent > 0 ? 'text-[#DA303E]' : 'text-[#00B14F]'}`}>
            {degradationPercent}%
          </span>
        </div>

        <label className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-white/5 bg-black/30 p-2 transition-colors hover:bg-black/40">
          <div className="relative">
            <input
              type="checkbox"
              checked={conditions.acOn}
              onChange={(e) => setConditions({ ...conditions, acOn: e.target.checked })}
              className="sr-only"
            />
            <div className={`block h-4 w-8 rounded-full transition-colors ${conditions.acOn ? 'bg-[#1464F4]' : 'bg-gray-700'}`}></div>
            <div className={`absolute left-[2px] top-[2px] h-3 w-3 rounded-full bg-white transition-transform ${conditions.acOn ? 'translate-x-4 transform' : ''}`}></div>
          </div>
          <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-white/80">
            <Wind className={`h-3.5 w-3.5 ${conditions.acOn ? 'text-[#1464F4]' : 'text-gray-500'}`} />
            Điều Hòa Lạnh
          </span>
        </label>
      </div>
    </div>
  );
}
