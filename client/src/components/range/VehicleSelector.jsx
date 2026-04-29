import { useState, useRef, useEffect } from 'react';
import { Car, ChevronDown, Check } from 'lucide-react';

const VEHICLE_ORDER = [
  'VF3',
  'VF5',
  'VFe34',
  'VF6_Eco',
  'VF6',
  'VF7_Eco',
  'VF7',
  'VF8_Eco',
  'VF8_Plus',
  'VF9_Eco',
  'VF9_Plus',
  'Minio_Green',
  'Herio_Green',
  'Nerio_Green',
  'Limo_Green',
  'EC_Van',
];

const getVehicleOrder = (vehicle) => {
  const index = VEHICLE_ORDER.indexOf(vehicle.name);
  return index === -1 ? VEHICLE_ORDER.length : index;
};

export default function VehicleSelector({ vehicles, selectedVehicleId, onSelect }) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  const selectedVehicle = vehicles.find(v => v.id === selectedVehicleId);
  const sortedVehicles = [...vehicles].sort((a, b) => {
    const orderDiff = getVehicleOrder(a) - getVehicleOrder(b);
    if (orderDiff !== 0) return orderDiff;
    return (a.display_name || a.name || '').localeCompare(b.display_name || b.name || '', 'vi');
  });

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="bg-[#111111] rounded-xl p-3 md:p-3.5 border border-white/10 shadow-lg relative z-40" ref={dropdownRef}>
      <h2 className="text-[11px] md:text-xs font-bold text-white/80 mb-2.5 uppercase tracking-wide flex items-center gap-1.5">
        <Car className="w-3.5 h-3.5 text-white/60" /> Dòng Xe Điện VinFast
      </h2>
      
      <div className="relative">
        <button 
          onClick={() => setIsOpen(!isOpen)}
          className="w-full bg-black/40 border border-white/10 hover:border-white/20 text-white rounded-lg py-2.5 px-3 flex justify-between items-center transition-all focus:outline-none focus:ring-1 focus:ring-[#1464F4]"
        >
          {selectedVehicle ? (
            <div className="flex items-center gap-2 text-[13px] md:text-sm font-bold">
               <span className="text-[#1464F4] shrink-0"><Car className="w-4 h-4"/></span>
               {selectedVehicle.display_name || selectedVehicle.name || selectedVehicle.model || 'VinFast Auto'}
               <span className="text-[10px] bg-white/10 px-1.5 py-0.5 rounded font-normal text-white/50 ml-1">
                 {selectedVehicle.battery_capacity_kwh}kWh
               </span>
            </div>
          ) : (
            <span className="text-sm text-gray-500">Chọn mẫu xe...</span>
          )}
          <ChevronDown className={`w-4 h-4 text-white/50 transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`} />
        </button>

        {/* Dropdown Menu */}
        {isOpen && (
          <div className="absolute top-[calc(100%+8px)] left-0 w-full bg-[#0A0A0A] border border-white/10 rounded-xl overflow-y-auto max-h-60 z-[100] shadow-[0_20px_50px_rgba(0,0,0,0.5)] animate-in fade-in zoom-in-95 duration-200">
            {sortedVehicles.map(v => (
              <button
                key={v.id}
                onClick={() => {
                   onSelect(v.id);
                   setIsOpen(false);
                }}
                className={`w-full text-left p-3 hover:bg-white/10 flex justify-between items-center transition-all border-b border-white/5 last:border-0
                   ${selectedVehicleId === v.id ? 'bg-[#1464F4]/10' : ''}
                `}
              >
                <div>
                  <div className="font-bold text-sm text-white flex items-center gap-2">
                    {v.display_name || v.name || v.model}
                    {selectedVehicleId === v.id && <Check className="w-4 h-4 text-[#1464F4]" />}
                  </div>
                  <div className="text-[10px] md:text-[11px] text-white/40 mt-1 flex gap-3">
                    <span>Pin: <strong className="text-white/70">{v.battery_capacity_kwh} kWh</strong></span>
                    <span>Hao: <strong className="text-white/70">{v.base_consumption_wh_km} Wh/km</strong></span>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
