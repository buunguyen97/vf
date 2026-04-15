import VehicleSelector from '../range/VehicleSelector';
import BatteryInput from '../range/BatteryInput';
import TargetBatteryInput from '../range/TargetBatteryInput';
import ConsumptionPanel from '../range/ConsumptionPanel';
import ConditionPanel from '../range/ConditionPanel';
import LocationSearch from '../map/LocationSearch';
import GoogleMapsLinkInput from '../map/GoogleMapsLinkInput';

export default function PlannerControls({
  vehicles,
  selectedVehicleId,
  onSelectVehicle,
  batteryPercent,
  setBatteryPercent,
  targetBatteryPercent,
  setTargetBatteryPercent,
  conditions,
  setConditions,
  locationName,
  userLocation,
  destination,
  onOriginSelect,
  onLocateMe,
  onDestinationSelect,
  onParsedLink,
  onSuggestStations,
  startupMode = false,
  onDismiss,
}) {
  return (
    <div className={`relative z-10 ${startupMode ? 'space-y-3' : 'space-y-2'}`}>
      {startupMode && (
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
          <h2 className="text-sm font-bold text-white">Thiết lập hành trình</h2>
          <p className="mt-1 text-xs leading-relaxed text-white/55">
            Nhập nhanh thông số xe, mức pin và điểm đến trước khi mở bản đồ.
          </p>
        </div>
      )}

      <VehicleSelector
        vehicles={vehicles}
        selectedVehicleId={selectedVehicleId}
        onSelect={onSelectVehicle}
      />

      <BatteryInput
        batteryPercent={batteryPercent}
        setBatteryPercent={setBatteryPercent}
      />

      <TargetBatteryInput
        targetBatteryPercent={targetBatteryPercent}
        setTargetBatteryPercent={setTargetBatteryPercent}
      />

      <ConsumptionPanel
        conditions={conditions}
        setConditions={setConditions}
        vehicles={vehicles}
        selectedVehicleId={selectedVehicleId}
      />

      <GoogleMapsLinkInput onOriginDestFound={onParsedLink} />

      <LocationSearch
        title="Điểm Xuất Phát"
        placeholder="Vị trí hiện tại..."
        iconColor="#00B14F"
        onLocationSelect={onOriginSelect}
        defaultDisplay={userLocation ? `${userLocation[0].toFixed(5)}, ${userLocation[1].toFixed(5)}` : ''}
        showLocateButton={true}
        onLocateMe={onLocateMe}
        readOnly={true}
      />

      <LocationSearch
        title="Điểm Đến"
        placeholder="Tên địa danh..."
        iconColor="#1464F4"
        onLocationSelect={onDestinationSelect}
        defaultDisplay={destination ? `${destination[0].toFixed(5)}, ${destination[1].toFixed(5)}` : ''}
        readOnly={true}
      />

      <ConditionPanel
        conditions={conditions}
        setConditions={setConditions}
        locationName={locationName}
      />

      <button
        onClick={onSuggestStations}
        className="w-full bg-gradient-to-r from-[#00B14F] to-[#008A3D] hover:from-[#00C259] hover:to-[#00B14F] text-white font-bold py-3.5 px-4 rounded-xl shadow-[0_8px_20px_rgba(0,177,79,0.3)] transition-all flex items-center justify-center gap-2 mt-2 hover:scale-[1.02] active:scale-[0.98]"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
        </svg>
        GỢI Ý TRẠM SẠC
      </button>

      <div className="rounded-xl border border-[#22c55e]/20 bg-[#22c55e]/8 px-3 py-2 text-[11px] text-white/70">
        <span className="font-semibold text-white/85">Ghi chú:</span>{' '}
        vòng tròn <span className="mx-1 inline-block h-2.5 w-2.5 rounded-full bg-[#22c55e] align-middle"></span>
        màu xanh lá là những trạm sạc được hệ thống gợi ý.
      </div>

      {startupMode && (
        <button
          onClick={onDismiss}
          className="w-full rounded-xl border border-white/10 bg-white/5 py-3 text-sm font-semibold text-white/75 transition-colors hover:bg-white/10 hover:text-white"
        >
          Xem bản đồ
        </button>
      )}
    </div>
  );
}
