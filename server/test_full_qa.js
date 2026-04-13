/**
 * FULL QA Test Suite — VF Range Assistant
 * Covers: API endpoints, calculation accuracy, edge cases, error handling
 */

const BASE = 'http://localhost:3001/api';
let passed = 0, failed = 0;
const errors = [];

async function get(endpoint) {
  const res = await fetch(`${BASE}${endpoint}`);
  return { status: res.status, data: await res.json() };
}

async function post(endpoint, body) {
  const res = await fetch(`${BASE}${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  return { status: res.status, data: await res.json() };
}

function check(testId, testName, actual, expected, tolerance = 0) {
  if (typeof expected === 'number') {
    if (Math.abs(actual - expected) <= tolerance) {
      console.log(`  ✅ [${testId}] ${testName}: ${actual}`);
      passed++;
    } else {
      console.log(`  ❌ [${testId}] ${testName}: ${actual} (expected ~${expected})`);
      errors.push(`[${testId}] ${testName}: got ${actual}, expected ${expected}`);
      failed++;
    }
  } else if (typeof expected === 'boolean') {
    if (actual === expected) {
      console.log(`  ✅ [${testId}] ${testName}: ${actual}`);
      passed++;
    } else {
      console.log(`  ❌ [${testId}] ${testName}: ${actual} (expected ${expected})`);
      errors.push(`[${testId}] ${testName}: got ${actual}, expected ${expected}`);
      failed++;
    }
  } else {
    if (actual === expected) {
      console.log(`  ✅ [${testId}] ${testName}: ${actual}`);
      passed++;
    } else {
      console.log(`  ❌ [${testId}] ${testName}: ${actual} (expected ${expected})`);
      errors.push(`[${testId}] ${testName}: got ${actual}, expected ${expected}`);
      failed++;
    }
  }
}

function assert(testId, testName, condition) {
  if (condition) {
    console.log(`  ✅ [${testId}] ${testName}`);
    passed++;
  } else {
    console.log(`  ❌ [${testId}] ${testName}`);
    errors.push(`[${testId}] ${testName}: assertion failed`);
    failed++;
  }
}

async function runAllTests() {

  // ============================================================
  // SUITE 1: GET /api/vehicles
  // ============================================================
  console.log('\n══════════════════════════════════════════');
  console.log('SUITE 1: GET /api/vehicles');
  console.log('══════════════════════════════════════════');

  const vehiclesRes = await get('/vehicles');
  assert('S1-01', '9 xe VinFast trả về', vehiclesRes.data.length === 9);
  
  const vf3 = vehiclesRes.data.find(v => v.name === 'VF3');
  assert('S1-02', 'VF3 có đủ fields', vf3 && vf3.battery_capacity_kwh === 18.64 && vf3.base_consumption_wh_km === 90);
  
  for (const v of vehiclesRes.data) {
    assert('S1-03', `${v.name} battery > 0`, v.battery_capacity_kwh > 0);
    assert('S1-04', `${v.name} consumption > 0`, v.base_consumption_wh_km > 0);
  }

  // ============================================================
  // SUITE 2: POST /api/estimate-range — All Scenarios
  // ============================================================
  console.log('\n══════════════════════════════════════════');
  console.log('SUITE 2: POST /api/estimate-range');
  console.log('══════════════════════════════════════════');

  // TC-R01: VF3 default
  const r01 = await post('/estimate-range', { batteryPercent: 80, vehicleId: vf3.id, temperature: 25, speed: 60, acOn: true });
  check('TC-R01', 'VF3 default 80% range', r01.data.estimatedRangeKm, 142, 2);

  // TC-R02: VF3 with override
  const r02 = await post('/estimate-range', { batteryPercent: 80, vehicleId: vf3.id, temperature: 25, speed: 60, acOn: true, consumptionWhKm: 120 });
  check('TC-R02', 'VF3 override 120 Wh/km', r02.data.estimatedRangeKm, 107, 2);
  assert('TC-R02b', 'Override reduces range', r02.data.estimatedRangeKm < r01.data.estimatedRangeKm);

  // TC-R03: null override → default
  const r03 = await post('/estimate-range', { batteryPercent: 80, vehicleId: vf3.id, temperature: 25, speed: 60, acOn: true, consumptionWhKm: null });
  check('TC-R03', 'null override = default', r03.data.estimatedRangeKm, r01.data.estimatedRangeKm, 0);

  // TC-R04: 0 override → default
  const r04 = await post('/estimate-range', { batteryPercent: 80, vehicleId: vf3.id, temperature: 25, speed: 60, acOn: true, consumptionWhKm: 0 });
  check('TC-R04', '0 override = default', r04.data.estimatedRangeKm, r01.data.estimatedRangeKm, 0);

  // TC-R05: Hot weather >35°C → +10%
  const r05 = await post('/estimate-range', { batteryPercent: 80, vehicleId: vf3.id, temperature: 40, speed: 60, acOn: false });
  const r05base = await post('/estimate-range', { batteryPercent: 80, vehicleId: vf3.id, temperature: 25, speed: 60, acOn: false });
  assert('TC-R05', 'Hot weather reduces range', r05.data.estimatedRangeKm < r05base.data.estimatedRangeKm);
  // 90 * 1.10 = 99 vs 90, range should be ~10% less
  const hotRatio = r05.data.estimatedRangeKm / r05base.data.estimatedRangeKm;
  assert('TC-R05b', 'Hot ≈ -10% range', hotRatio > 0.88 && hotRatio < 0.93);

  // TC-R06: Cold weather <10°C → +15%
  const r06 = await post('/estimate-range', { batteryPercent: 80, vehicleId: vf3.id, temperature: 5, speed: 60, acOn: false });
  assert('TC-R06', 'Cold weather reduces range', r06.data.estimatedRangeKm < r05base.data.estimatedRangeKm);
  const coldRatio = r06.data.estimatedRangeKm / r05base.data.estimatedRangeKm;
  assert('TC-R06b', 'Cold ≈ -15% range', coldRatio > 0.84 && coldRatio < 0.88);

  // TC-R07: Speed >100 → +25%
  const r07 = await post('/estimate-range', { batteryPercent: 80, vehicleId: vf3.id, temperature: 25, speed: 110, acOn: false });
  assert('TC-R07', 'High speed >100 reduces range', r07.data.estimatedRangeKm < r05base.data.estimatedRangeKm);
  const speedHighRatio = r07.data.estimatedRangeKm / r05base.data.estimatedRangeKm;
  assert('TC-R07b', 'Speed>100 ≈ -25% range', speedHighRatio > 0.78 && speedHighRatio < 0.82);

  // TC-R08: Speed 80-100 → +15%
  const r08 = await post('/estimate-range', { batteryPercent: 80, vehicleId: vf3.id, temperature: 25, speed: 90, acOn: false });
  const speedMedRatio = r08.data.estimatedRangeKm / r05base.data.estimatedRangeKm;
  assert('TC-R08', 'Speed 80-100 ≈ -15% range', speedMedRatio > 0.84 && speedMedRatio < 0.88);

  // TC-R09: AC on vs off
  const r09on = await post('/estimate-range', { batteryPercent: 80, vehicleId: vf3.id, temperature: 25, speed: 60, acOn: true });
  const r09off = await post('/estimate-range', { batteryPercent: 80, vehicleId: vf3.id, temperature: 25, speed: 60, acOn: false });
  assert('TC-R09', 'AC on reduces range', r09on.data.estimatedRangeKm < r09off.data.estimatedRangeKm);

  // TC-R10: AC off = no consumption increase
  check('TC-R10', 'AC off base consumption', r09off.data.adjustedConsumptionWhKm, 90, 0);

  // TC-R11: 1% battery edge
  const r11 = await post('/estimate-range', { batteryPercent: 1, vehicleId: vf3.id, temperature: 25, speed: 60, acOn: true });
  check('TC-R11', '1% battery ~2km', r11.data.estimatedRangeKm, 2, 1);

  // TC-R12: 100% ideal conditions
  const r12 = await post('/estimate-range', { batteryPercent: 100, vehicleId: vf3.id, temperature: 25, speed: 60, acOn: false });
  check('TC-R12', '100% ideal conditions', r12.data.estimatedRangeKm, 186, 2);

  // TC-R13: Invalid vehicleId → 404
  const r13 = await post('/estimate-range', { batteryPercent: 80, vehicleId: 99999, temperature: 25, speed: 60, acOn: true });
  check('TC-R13', 'Invalid vehicleId → 404', r13.status, 404);

  // TC-R14: Missing batteryPercent → 400
  const r14 = await post('/estimate-range', { vehicleId: vf3.id, temperature: 25, speed: 60, acOn: true });
  check('TC-R14', 'Missing batteryPercent → 400', r14.status, 400);

  // Multi-vehicle cross check
  console.log('\n  --- Multi-Vehicle Cross Check ---');
  for (const v of vehiclesRes.data) {
    const res = await post('/estimate-range', { batteryPercent: 100, vehicleId: v.id, temperature: 25, speed: 60, acOn: false });
    const expectedMax = (v.battery_capacity_kwh * 1000 * 0.9) / v.base_consumption_wh_km;
    check(`MV-${v.name}`, `${v.name} 100% range`, res.data.estimatedRangeKm, Math.round(expectedMax), 2);
  }

  // ============================================================
  // SUITE 3: POST /api/check-reachability
  // ============================================================
  console.log('\n══════════════════════════════════════════');
  console.log('SUITE 3: POST /api/check-reachability');
  console.log('══════════════════════════════════════════');

  // TC-RE01: Near station
  const re01 = await post('/check-reachability', {
    currentLocation: [10.7946, 106.7223], destination: [10.7780, 106.7020],
    batteryPercent: 80, vehicleId: vf3.id, temperature: 25, speed: 60, acOn: true
  });
  check('TC-RE01', 'Near station reachable', re01.data.canReach, true);
  assert('TC-RE01b', 'Has batteryLeftPercent', re01.data.batteryLeftPercent !== undefined);
  assert('TC-RE01c', 'Has distanceKm', re01.data.distanceKm > 0);

  // TC-RE02: Override increases consumption → less battery
  const re02 = await post('/check-reachability', {
    currentLocation: [10.7946, 106.7223], destination: [10.7780, 106.7020],
    batteryPercent: 80, vehicleId: vf3.id, temperature: 25, speed: 60, acOn: true, consumptionWhKm: 200
  });
  assert('TC-RE02', 'Higher consumption → less battery', re02.data.batteryLeftPercent <= re01.data.batteryLeftPercent);

  // ============================================================
  // SUITE 4: GET /api/search-location
  // ============================================================
  console.log('\n══════════════════════════════════════════');
  console.log('SUITE 4: GET /api/search-location');
  console.log('══════════════════════════════════════════');

  const sl01 = await get('/search-location?q=H%C3%A0%20N%E1%BB%99i');
  assert('TC-SL01', 'Search "Hà Nội" returns results', sl01.data.length > 0);

  const sl02 = await get('/search-location?q=');
  assert('TC-SL02', 'Empty query returns []', sl02.data.length === 0);

  // ============================================================
  // SUITE 5: GET /api/nearby-chargers
  // ============================================================
  console.log('\n══════════════════════════════════════════');
  console.log('SUITE 5: GET /api/nearby-chargers');
  console.log('══════════════════════════════════════════');

  const ch01 = await get('/nearby-chargers?lat=10.7946&lng=106.7223&radius=50');
  assert('TC-CH01', 'Returns stations near HCM', ch01.data.length > 0);
  
  // Check sorting
  if (ch01.data.length > 1) {
    assert('TC-CH02', 'Sorted by distance', ch01.data[0].distanceKm <= ch01.data[1].distanceKm);
  }

  // ============================================================
  // SUITE 6: GET /api/nearby-amenities
  // ============================================================
  console.log('\n══════════════════════════════════════════');
  console.log('SUITE 6: GET /api/nearby-amenities');
  console.log('══════════════════════════════════════════');

  const am01 = await get('/nearby-amenities?lat=10.7946&lng=106.7223&radius=500');
  assert('TC-AM01', 'Returns amenities', Array.isArray(am01.data));
  if (am01.data.length > 0) {
    const first = am01.data[0];
    assert('TC-AM02', 'Amenity has name', !!first.name);
    assert('TC-AM03', 'Amenity has distance', first.distance !== undefined);
    assert('TC-AM04', 'Amenity has type', !!first.type);
  }

  // ============================================================
  // SUITE 7: Consumption Override Consistency Across All Routes
  // ============================================================
  console.log('\n══════════════════════════════════════════');
  console.log('SUITE 7: Consistency Check — Override propagation');
  console.log('══════════════════════════════════════════');

  const vf8 = vehiclesRes.data.find(v => v.name === 'VF8_Eco');
  
  // Same conditions, estimate-range vs reachability should use same consumption
  const estDefault = await post('/estimate-range', {
    batteryPercent: 80, vehicleId: vf8.id, temperature: 30, speed: 80, acOn: true
  });
  const estOverride = await post('/estimate-range', {
    batteryPercent: 80, vehicleId: vf8.id, temperature: 30, speed: 80, acOn: true, consumptionWhKm: 250
  });
  assert('TC-CON01', 'Override consumption used in range calc', 
    estOverride.data.adjustedConsumptionWhKm > estDefault.data.adjustedConsumptionWhKm);
  assert('TC-CON02', 'Higher consumption = lower range', 
    estOverride.data.estimatedRangeKm < estDefault.data.estimatedRangeKm);

  // ============================================================
  // SUITE 8: Edge Cases
  // ============================================================
  console.log('\n══════════════════════════════════════════');
  console.log('SUITE 8: Edge Cases');
  console.log('══════════════════════════════════════════');

  // Battery 0 → 0 range
  const ec01 = await post('/estimate-range', { batteryPercent: 0, vehicleId: vf3.id, temperature: 25, speed: 60, acOn: false });
  check('TC-EC01', 'Battery 0% = 0km range', ec01.data.estimatedRangeKm, 0, 0);

  // All multipliers stacked: hot + fast + AC
  const ec02 = await post('/estimate-range', { 
    batteryPercent: 100, vehicleId: vf3.id, temperature: 40, speed: 110, acOn: true 
  });
  // 90 * 1.10 * 1.25 * 1.05 = 129.9 → round 130
  check('TC-EC02', 'All multipliers stacked consumption', ec02.data.adjustedConsumptionWhKm, 130, 2);

  // Very high consumption override
  const ec03 = await post('/estimate-range', { 
    batteryPercent: 100, vehicleId: vf3.id, temperature: 25, speed: 60, acOn: false, consumptionWhKm: 350 
  });
  assert('TC-EC03', 'High consumption → still positive range', ec03.data.estimatedRangeKm > 0);
  check('TC-EC03b', 'Very high consumption range', ec03.data.estimatedRangeKm, 48, 3);

  // ============================================================
  // FINAL SUMMARY
  // ============================================================
  console.log('\n════════════════════════════════════════════');
  console.log(`🏁 FINAL RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('════════════════════════════════════════════');
  if (errors.length > 0) {
    console.log('\n❌ FAILURES:');
    errors.forEach(e => console.log(`   ${e}`));
  } else {
    console.log('🎉 ALL TESTS PASSED!');
  }
  console.log('');
}

runAllTests().catch(err => {
  console.error('Test runner crashed:', err);
  process.exit(1);
});
