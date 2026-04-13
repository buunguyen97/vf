/**
 * EV Range Estimation Engine
 * 
 * Uses real-world data on how temperature, AC, and speed affect EV consumption.
 * 
 * Real-world AC impact data (source: Recurrent, AAA, Car and Driver):
 * - 27°C + AC: ~3% range reduction
 * - 32°C + AC: ~5-10% range reduction  
 * - 35-38°C + AC: ~15-18% range reduction
 * - Cold <10°C + heating: ~25-40% range reduction (much worse than AC)
 * - No AC at comfortable temps: negligible impact
 * 
 * Key insight: AC cooling is MUCH more efficient than heating.
 * In tropical climates (Vietnam), AC always on is the norm.
 */

function estimateRange({ batteryPercent, batteryCapacityKwh, baseConsumption, consumptionOverride, temperature, speed, acOn }) {
  // Use user-provided consumption if available, otherwise fall back to vehicle default
  let consumption = consumptionOverride || baseConsumption; // Wh/km
  
  // ========================================================
  // Temperature + AC combined adjustment (real-world data)
  // ========================================================
  // The impact depends on BOTH temperature AND whether AC/heating is on.
  // Temperature alone affects battery chemistry efficiency.
  // AC/heating adds additional energy draw from the battery.
  
  if (acOn) {
    // AC is ON — impact depends on how hard the system works (temp delta)
    if (temperature >= 40) {
      // Extreme heat: AC compressor works maximum + battery cooling
      consumption *= 1.20; // +20%
    } else if (temperature >= 35) {
      // Very hot: significant AC load + some battery thermal management
      consumption *= 1.15; // +15%
    } else if (temperature >= 30) {
      // Hot (typical Vietnam): moderate AC load
      consumption *= 1.08; // +8%
    } else if (temperature >= 25) {
      // Warm: light AC load
      consumption *= 1.03; // +3%
    } else if (temperature >= 15) {
      // Mild: AC barely needed, minimal impact
      consumption *= 1.01; // +1%
    } else if (temperature >= 5) {
      // Cold: heating needed (heat pump or resistive)
      consumption *= 1.25; // +25%
    } else if (temperature >= -5) {
      // Very cold: heavy heating + battery chemistry degradation
      consumption *= 1.35; // +35%
    } else {
      // Extreme cold: maximum heating + severe battery inefficiency
      consumption *= 1.45; // +45%
    }
  } else {
    // AC is OFF — only battery chemistry effects from temperature
    if (temperature >= 40) {
      // Extreme heat still degrades battery performance
      consumption *= 1.08; // +8%
    } else if (temperature >= 35) {
      consumption *= 1.05; // +5%  
    } else if (temperature >= 15 && temperature <= 30) {
      // Optimal temperature range — no penalty
      consumption *= 1.00;
    } else if (temperature >= 5) {
      // Cold: battery chemistry less efficient even without heating
      consumption *= 1.10; // +10%
    } else if (temperature >= -5) {
      consumption *= 1.20; // +20%
    } else {
      consumption *= 1.30; // +30%
    }
  }
  
  // ========================================================
  // Speed adjustment (aerodynamic drag increases with v²)
  // ========================================================
  // Real-world data: highway driving at 120 km/h uses ~35-50% more 
  // energy than city driving at 50 km/h due to aerodynamic drag.
  if (speed >= 120) {
    consumption *= 1.35; // +35% — high-speed highway
  } else if (speed >= 100) {
    consumption *= 1.22; // +22%
  } else if (speed >= 80) {
    consumption *= 1.10; // +10% — moderate highway
  } else if (speed >= 60) {
    consumption *= 1.00; // baseline — mixed driving
  } else if (speed >= 40) {
    consumption *= 0.95; // -5% — city driving (less aero drag)
  } else {
    consumption *= 0.92; // -8% — slow city/traffic (regen helps)
  }
  
  // Available energy in Watt-hours
  const availableEnergy = (batteryPercent / 100) * batteryCapacityKwh * 1000;
  
  // 10% safety buffer so users don't completely drain
  const safeAvailableEnergy = availableEnergy * 0.90;
  
  const estimatedRangeKm = safeAvailableEnergy / consumption;
  
  return {
    estimatedRangeKm: Math.max(0, Math.round(estimatedRangeKm)),
    adjustedConsumptionWhKm: Math.round(consumption)
  };
}

module.exports = { estimateRange };
