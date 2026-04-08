import { BatteryCharging } from 'lucide-react';

export default function BatteryInput({ batteryPercent, setBatteryPercent }) {
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
    <div className="bg-white/5 backdrop-blur-2xl rounded-xl p-3 md:p-4 border border-white/10 shadow-lg transition-all hover:bg-white/[0.07]">
      <div className="flex justify-between items-center mb-3">
        <h2 className="text-xs font-bold tracking-wide text-white/90 uppercase flex items-center gap-1.5">
          <BatteryCharging className="w-3.5 h-3.5 text-white/70" /> Mức Pin Hiện Tại
        </h2>
        <span className={`text-2xl leading-none font-black text-transparent bg-clip-text bg-gradient-to-br ${gradientColor}`}>
          {batteryPercent}<span className="text-[10px]">%</span>
        </span>
      </div>
      
      <div className="relative pb-2">
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
