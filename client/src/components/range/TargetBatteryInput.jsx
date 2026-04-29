import { useRef, useState, useEffect } from 'react';
import { ShieldCheck } from 'lucide-react';

export default function TargetBatteryInput({
  targetBatteryPercent,
  setTargetBatteryPercent,
}) {
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
    const value = parseInt(editValue, 10);
    if (!Number.isNaN(value)) {
      setTargetBatteryPercent(Math.max(10, Math.min(50, value)));
    }
    setIsEditing(false);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') handleEditConfirm();
    if (e.key === 'Escape') setIsEditing(false);
  };

  return (
    <div className="relative overflow-hidden rounded-xl border border-white/10 bg-[#111111] p-3 shadow-lg transition-colors hover:bg-[#151515] md:p-3.5">
      <div className="relative z-10 flex items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-white/80 md:text-xs">
            <ShieldCheck className="h-3.5 w-3.5 text-[#1464F4]" /> Ngưỡng pin tối thiểu
          </h2>
          <p className="mt-1 text-[10px] text-white/45">
            Giữ lại tối thiểu {targetBatteryPercent}% pin khi đến trạm hoặc điểm đến.
          </p>
        </div>

        {isEditing ? (
          <div className="flex items-center gap-1 rounded-lg border border-[#1464F4]/30 bg-[#1464F4]/10 px-2 py-0.5 shadow-[0_0_10px_rgba(20,100,244,0.2)]">
            <input
              ref={inputRef}
              type="number"
              min="10"
              max="50"
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onBlur={handleEditConfirm}
              onKeyDown={handleKeyDown}
              className="w-10 appearance-none border-none bg-transparent text-right font-mono text-sm font-bold text-[#1464F4] outline-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
            />
            <span className="font-mono text-sm font-bold text-[#1464F4]">%</span>
          </div>
        ) : (
          <button
            type="button"
            onClick={handleEditStart}
            className="rounded-lg border border-[#1464F4]/30 bg-[#1464F4]/10 px-2 py-0.5 shadow-[0_0_10px_rgba(20,100,244,0.2)] transition-colors hover:bg-[#1464F4]/20"
            title="Nhấn để nhập tay"
          >
            <span className="font-mono text-sm font-bold text-[#1464F4]">{targetBatteryPercent}%</span>
          </button>
        )}
      </div>

      <div className="relative z-10 pt-3">
        <input
          type="range"
          min="10"
          max="50"
          step="1"
          value={targetBatteryPercent}
          onChange={(e) => setTargetBatteryPercent(parseInt(e.target.value, 10))}
          className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-white/10 accent-[#1464F4] outline-none"
          style={{
            background: `linear-gradient(to right, #1464F4 0%, #1464F4 ${((targetBatteryPercent - 10) / 40) * 100}%, rgba(255,255,255,0.1) ${((targetBatteryPercent - 10) / 40) * 100}%, rgba(255,255,255,0.1) 100%)`,
          }}
        />
      </div>
    </div>
  );
}
