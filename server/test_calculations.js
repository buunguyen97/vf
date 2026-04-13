/**
 * Comprehensive calculation verification script
 * Tests: estimate-range, check-reachability with various combinations
 */

const BASE = 'http://localhost:3001/api';

async function post(endpoint, body) {
  const res = await fetch(`${BASE}${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  return res.json();
}

async function runTests() {
  let passed = 0;
  let failed = 0;
  const errors = [];

  function check(testName, actual, expected, tolerance = 0) {
    if (typeof expected === 'number') {
      if (Math.abs(actual - expected) <= tolerance) {
        console.log(`  ✅ ${testName}: ${actual} (expected ~${expected})`);
        passed++;
      } else {
        console.log(`  ❌ ${testName}: ${actual} (expected ~${expected})`);
        errors.push(`${testName}: got ${actual}, expected ${expected}`);
        failed++;
      }
    } else {
      if (actual === expected) {
        console.log(`  ✅ ${testName}: ${actual}`);
        passed++;
      } else {
        console.log(`  ❌ ${testName}: ${actual} (expected ${expected})`);
        errors.push(`${testName}: got ${actual}, expected ${expected}`);
        failed++;
      }
    }
  }

  // =========================================================
  // TEST 1: VF3 - Default consumption, standard conditions
  // VF3: 18.64 kWh, base 90 Wh/km
  // 80% battery, 25°C (no temp adjustment), 60km/h (no speed adj), AC on (+5%)
  // consumption = 90 * 1.05 = 94.5 Wh/km
  // available = (80/100) * 18.64 * 1000 = 14912 Wh
  // safe = 14912 * 0.9 = 13420.8 Wh
  // range = 13420.8 / 94.5 = 142.02 ≈ 142 km
  // =========================================================
  console.log('\n=== TEST 1: VF3 Default, 80%, 25°C, 60km/h, AC on ===');
  const t1 = await post('/estimate-range', {
    batteryPercent: 80, vehicleId: 22,
    temperature: 25, speed: 60, acOn: true
  });
  check('Range VF3 default', t1.estimatedRangeKm, 142, 2);
  check('Consumption VF3', t1.adjustedConsumptionWhKm, 95, 1);

  // =========================================================
  // TEST 2: VF3 - WITH user consumption override (120 Wh/km)
  // consumption = 120 * 1.05 = 126 Wh/km
  // available = 14912 Wh, safe = 13420.8 Wh
  // range = 13420.8 / 126 = 106.5 ≈ 107 km
  // =========================================================
  console.log('\n=== TEST 2: VF3 Override 120 Wh/km, 80%, 25°C, 60km/h, AC on ===');
  const t2 = await post('/estimate-range', {
    batteryPercent: 80, vehicleId: 22,
    temperature: 25, speed: 60, acOn: true,
    consumptionWhKm: 120
  });
  check('Range VF3 override', t2.estimatedRangeKm, 107, 2);
  check('Consumption override', t2.adjustedConsumptionWhKm, 126, 1);

  // =========================================================
  // TEST 3: VF3 - NO consumptionWhKm (should use DB default 90)
  // Same as TEST 1
  // =========================================================
  console.log('\n=== TEST 3: VF3 NO override (null), should use DB default ===');
  const t3 = await post('/estimate-range', {
    batteryPercent: 80, vehicleId: 22,
    temperature: 25, speed: 60, acOn: true,
    consumptionWhKm: null
  });
  check('Range VF3 null override = default', t3.estimatedRangeKm, t1.estimatedRangeKm, 0);

  // =========================================================
  // TEST 4: VF8 Eco - Hot weather (40°C), highway (100km/h), AC on
  // VF8 Eco: 87.7 kWh, base 186 Wh/km
  // consumption = 186 * 1.10 (hot) * 1.15 (speed>80) * 1.05 (AC) = 247.3 Wh/km
  // available = (100/100) * 87700 = 87700 Wh, safe = 78930 Wh
  // range = 78930 / 247.3 = 319.2 ≈ 319 km
  // =========================================================
  console.log('\n=== TEST 4: VF8 Eco 100%, 40°C, 100km/h, AC on ===');
  const t4 = await post('/estimate-range', {
    batteryPercent: 100, vehicleId: 27,
    temperature: 40, speed: 100, acOn: true
  });
  check('Consumption VF8 hot+highway+AC', t4.adjustedConsumptionWhKm, 247, 3);
  check('Range VF8 hot conditions', t4.estimatedRangeKm, 319, 5);

  // =========================================================
  // TEST 5: VF8 Eco - WITH user override 200 Wh/km, same conditions
  // consumption = 200 * 1.10 * 1.15 * 1.05 = 266.0 Wh/km
  // range = 78930 / 266.0 = 296.7 ≈ 297 km
  // =========================================================
  console.log('\n=== TEST 5: VF8 Eco override 200 Wh/km, 40°C, 100km/h, AC on ===');
  const t5 = await post('/estimate-range', {
    batteryPercent: 100, vehicleId: 27,
    temperature: 40, speed: 100, acOn: true,
    consumptionWhKm: 200
  });
  check('Consumption VF8 override', t5.adjustedConsumptionWhKm, 266, 3);
  check('Range VF8 override', t5.estimatedRangeKm, 297, 5);

  // =========================================================
  // TEST 6: VF9 Plus - Cold weather (5°C), city (60km/h), AC off
  // VF9 Plus: 123 kWh, base 237 Wh/km
  // consumption = 237 * 1.15 (cold) = 272.55 Wh/km (no AC, no speed adj)
  // available = (50/100) * 123000 = 61500, safe = 55350
  // range = 55350 / 272.55 = 203.1 ≈ 203 km
  // =========================================================
  console.log('\n=== TEST 6: VF9 Plus 50%, 5°C, 60km/h, AC off ===');
  const t6 = await post('/estimate-range', {
    batteryPercent: 50, vehicleId: 30,
    temperature: 5, speed: 60, acOn: false
  });
  check('Consumption VF9 cold no-AC', t6.adjustedConsumptionWhKm, 273, 2);
  check('Range VF9 cold', t6.estimatedRangeKm, 203, 3);

  // =========================================================
  // TEST 7: VF5 - Extreme highway (110km/h > 100), hot (38°C), AC on
  // VF5: 37.23 kWh, base 113 Wh/km
  // consumption = 113 * 1.10 (hot) * 1.25 (speed>100) * 1.05 (AC) = 163.2 Wh/km
  // available = (70/100) * 37230 = 26061, safe = 23454.9
  // range = 23454.9 / 163.2 = 143.7 ≈ 144 km
  // =========================================================
  console.log('\n=== TEST 7: VF5 70%, 38°C, 110km/h, AC on ===');
  const t7 = await post('/estimate-range', {
    batteryPercent: 70, vehicleId: 23,
    temperature: 38, speed: 110, acOn: true
  });
  check('Consumption VF5 extreme', t7.adjustedConsumptionWhKm, 163, 3);
  check('Range VF5 extreme', t7.estimatedRangeKm, 144, 3);

  // =========================================================
  // TEST 8: Reachability - VF3, can it reach station 30km away?
  // Using T1 conditions: range ~142 km → should reach 30km
  // =========================================================
  console.log('\n=== TEST 8: Reachability VF3, 80%, 30km target ===');
  const t8 = await post('/check-reachability', {
    currentLocation: [10.7946, 106.7223], // HCM Landmark 81
    destination: [10.7780, 106.7020],      // Dong Khoi (~3km)
    batteryPercent: 80, vehicleId: 22,
    temperature: 25, speed: 60, acOn: true
  });
  check('Reachability near station', t8.canReach, true);
  console.log(`  ℹ️  Distance: ${t8.distanceKm} km, Battery left: ${t8.batteryLeftPercent}%`);

  // =========================================================
  // TEST 9: Reachability with consumption override
  // Higher consumption = less range = might not reach far
  // =========================================================
  console.log('\n=== TEST 9: Reachability with consumptionWhKm override ===');
  const t9 = await post('/check-reachability', {
    currentLocation: [10.7946, 106.7223],
    destination: [10.7780, 106.7020],
    batteryPercent: 80, vehicleId: 22,
    temperature: 25, speed: 60, acOn: true,
    consumptionWhKm: 120
  });
  check('Reachability with override', t9.canReach, true);
  // With higher consumption, battery left should be LESS than t8
  const lessEfficient = t9.batteryLeftPercent <= t8.batteryLeftPercent;
  check('Higher consumption = less battery left', lessEfficient, true);
  console.log(`  ℹ️  Distance: ${t9.distanceKm} km, Battery left: ${t9.batteryLeftPercent}% (vs ${t8.batteryLeftPercent}% default)`);

  // =========================================================
  // TEST 10: Edge case - 1% battery
  // VF3 at 1%: available = 0.01 * 18640 = 186.4, safe = 167.76
  // range = 167.76 / 94.5 = 1.78 ≈ 2 km
  // =========================================================
  console.log('\n=== TEST 10: Edge case - VF3 at 1% battery ===');
  const t10 = await post('/estimate-range', {
    batteryPercent: 1, vehicleId: 22,
    temperature: 25, speed: 60, acOn: true
  });
  check('Range VF3 1%', t10.estimatedRangeKm, 2, 1);

  // =========================================================
  // TEST 11: Edge case - 100% battery, no modifiers
  // VF3: available = 18640, safe = 16776, consumption = 90 (no AC)
  // range = 16776 / 90 = 186.4 ≈ 186 km
  // =========================================================
  console.log('\n=== TEST 11: VF3 100%, ideal conditions (no AC, mild temp) ===');
  const t11 = await post('/estimate-range', {
    batteryPercent: 100, vehicleId: 22,
    temperature: 25, speed: 60, acOn: false
  });
  check('Range VF3 ideal', t11.estimatedRangeKm, 186, 2);
  check('Consumption VF3 base', t11.adjustedConsumptionWhKm, 90, 0);

  // =========================================================
  // TEST 12: Override consumption = 0 edge (should use default)
  // =========================================================
  console.log('\n=== TEST 12: consumptionWhKm = 0 (falsy, should use default) ===');
  const t12 = await post('/estimate-range', {
    batteryPercent: 80, vehicleId: 22,
    temperature: 25, speed: 60, acOn: true,
    consumptionWhKm: 0
  });
  check('Range with 0 override = default', t12.estimatedRangeKm, t1.estimatedRangeKm, 0);

  // =========================================================
  // SUMMARY
  // =========================================================
  console.log('\n========================================');
  console.log(`RESULTS: ${passed} passed, ${failed} failed`);
  if (errors.length > 0) {
    console.log('\nFAILURES:');
    errors.forEach(e => console.log(`  ❌ ${e}`));
  }
  console.log('========================================\n');
}

runTests().catch(console.error);
