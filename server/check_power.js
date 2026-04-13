const { getDb } = require('./src/database/init');
const db = getDb();

// Check power distribution
console.log('\n=== PHÂN BỐ CÔNG SUẤT TRẠM SẠC ===');
const dist = db.prepare('SELECT power_kw, COUNT(*) as count FROM charging_stations GROUP BY power_kw ORDER BY power_kw').all();
console.table(dist);

// Spot check: sample stations for each power level
console.log('\n=== MẪU TRẠM THEO CÔNG SUẤT ===');
[20, 30, 60, 120, 180, 250].forEach(pw => {
  const sample = db.prepare('SELECT name, power_kw, address FROM charging_stations WHERE power_kw = ? LIMIT 2').all(pw);
  sample.forEach(s => {
    // Extract just the "Cổng sạc" info from address
    const idx = s.address.indexOf('Cổng sạc');
    const chargerInfo = idx >= 0 ? s.address.substring(idx, idx + 120) : '(no charger info)';
    console.log(`[${s.power_kw}kW] ${s.name}`);
    console.log(`  → ${chargerInfo}`);
  });
});
