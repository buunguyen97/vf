import { useState, useRef, useEffect } from 'react';
import { Zap } from 'lucide-react';

// Inline editable badge for the header value
function EditableBadge({ value, unit, min, max, step, onChange }) {
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
      onChange(parseFloat(clamped.toFixed(1)));
    }
    setIsEditing(false);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') handleEditConfirm();
    if (e.key === 'Escape') setIsEditing(false);
  };

  if (isEditing) {
    return (
      <div className="bg-black/60 border border-[#00B14F]/30 rounded-md flex items-center gap-0.5">
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
          className="w-14 text-right text-xs font-semibold bg-transparent border-none text-white outline-none px-1.5 py-0.5 appearance-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        />
        <span className="text-[10px] text-white/40 pr-1.5">{unit}</span>
      </div>
    );
  }

  return (
    <span
      onClick={handleEditStart}
      className="bg-[#00B14F]/10 border border-[#00B14F]/20 px-2 py-0.5 rounded-md text-xs font-bold text-[#00B14F] cursor-pointer hover:bg-[#00B14F]/20 transition-all select-none"
      title="Nhấn để nhập tay"
    >
      {value} <span className="text-[10px] font-normal text-[#00B14F]/70">{unit}</span>
    </span>
  );
}

export default function ConsumptionPanel({ conditions, setConditions, vehicles, selectedVehicleId }) {
  const selectedVehicle = vehicles?.find(v => v.id === selectedVehicleId);
  const defaultConsumption = selectedVehicle?.base_consumption_wh_km || 150;
  const currentConsumption = conditions.consumptionWhKm || defaultConsumption;

  // Battery capacity
  const batteryCapacity = selectedVehicle?.battery_capacity_kwh || 60;
  const energyPer1Percent = batteryCapacity * 1000 * 0.01; // Wh per 1%

  // km per 1% = energyPer1Percent / consumptionWhKm
  const kmPer1Percent = parseFloat((energyPer1Percent / currentConsumption).toFixed(1));

  // Default km per 1% from vehicle
  const defaultKmPer1Percent = parseFloat((energyPer1Percent / defaultConsumption).toFixed(1));

  // Min/max for slider
  const minKm = parseFloat((energyPer1Percent / 350).toFixed(1));
  const maxKm = parseFloat((energyPer1Percent / 50).toFixed(1));

  // Local slider state for smooth dragging (avoids parent re-render lag)
  const [sliderValue, setSliderValue] = useState(kmPer1Percent);
  const isDragging = useRef(false);

  // Sync local slider with external changes (vehicle change, reset, etc.)
  useEffect(() => {
    if (!isDragging.current) {
      setSliderValue(kmPer1Percent);
    }
  }, [kmPer1Percent]);

  // Commit: convert km/1% back to Wh/km
  const commitValue = (newKm) => {
    if (newKm <= 0) return;
    const newConsumption = Math.round(energyPer1Percent / newKm);
    setConditions({ ...conditions, consumptionWhKm: Math.max(50, Math.min(350, newConsumption)) });
  };

  const handleSliderInput = (e) => {
    isDragging.current = true;
    setSliderValue(parseFloat(e.target.value));
  };

  const handleSliderCommit = (e) => {
    isDragging.current = false;
    commitValue(parseFloat(e.target.value));
  };

  return (
    <div className="bg-white/5 backdrop-blur-2xl rounded-xl p-3 md:p-3.5 border border-white/10 shadow-lg relative overflow-hidden">
      {/* Header */}
      <div className="flex justify-between items-center mb-2.5">
        <h2 className="text-[11px] md:text-xs font-bold text-white/80 uppercase tracking-wide flex items-center gap-1.5">
          <Zap className="w-3.5 h-3.5 text-[#00B14F]" /> Số Km đi được với <span className="text-[#00B14F] text-xs md:text-sm font-black">1%</span> pin
        </h2>
        <EditableBadge
          value={isDragging.current ? sliderValue : kmPer1Percent}
          unit="km/1%"
          min={minKm}
          max={maxKm}
          step={0.1}
          onChange={(val) => { setSliderValue(val); commitValue(val); }}
        />
      </div>

      {/* Slider */}
      <input 
        type="range" 
        min={minKm}
        max={maxKm}
        step="0.1"
        value={sliderValue} 
        onInput={handleSliderInput}
        onChange={handleSliderInput}
        onMouseUp={handleSliderCommit}
        onTouchEnd={handleSliderCommit}
        className="w-full h-1 bg-white/10 rounded-full appearance-none accent-[#00B14F] outline-none cursor-pointer"
      />

      {/* Footer info */}
      <div className="flex items-center justify-between mt-2">
        <div className="flex items-center gap-1 text-[10px] md:text-[11px] text-white/35">
          <span>Mặc định:</span>
          <button 
            onClick={() => setConditions({ ...conditions, consumptionWhKm: defaultConsumption })}
            className="text-[#1464F4] hover:text-[#1464F4]/80 underline underline-offset-2 cursor-pointer transition-colors font-medium"
          >
            {defaultKmPer1Percent} km/1%
          </button>
        </div>
        <span className="text-[10px] text-white/30 font-mono">
          {currentConsumption} Wh/km
        </span>
      </div>
    </div>
  );
}
