const path = require('path');
const fs = require('fs');
const axios = require('axios');
const { getDb, closeDb } = require('./init');

// ─── KML Parsing Helpers ─────────────────────────────────────────────

function htmlToText(value) {
  return String(value || '')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/p>/gi, ' ')
    .replace(/<[^>]*>?/gm, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function extractTag(chunk, tagName) {
  const pattern = new RegExp(
    `<${tagName}>(?:<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>|([\\s\\S]*?))<\\/${tagName}>`,
    'i',
  );
  const match = pattern.exec(chunk);
  return match ? (match[1] || match[2] || '').trim() : '';
}

function parsePowerKw(text) {
  const powerMatches = String(text || '').match(/(\d+)\s*[kK][wW]/g);
  if (!powerMatches?.length) return 60;

  const powerValues = powerMatches
    .map((item) => Number((item.match(/(\d+)/) || [])[1]))
    .filter(Number.isFinite);

  return powerValues.length ? Math.max(...powerValues) : 60;
}

function parseKmlStations(kmlText) {
  const placemarks = [];
  const placemarkRegex = /<Placemark\b[^>]*>([\s\S]*?)<\/Placemark>/g;
  let match;

  while ((match = placemarkRegex.exec(kmlText)) !== null) {
    const chunk = match[1];
    const coordsMatch = /<coordinates>\s*([-\d.]+)\s*,\s*([-\d.]+)/.exec(chunk);
    if (!coordsMatch) continue;

    const longitude = Number(coordsMatch[1]);
    const latitude = Number(coordsMatch[2]);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) continue;
    if (latitude < 8 || latitude > 24 || longitude < 102 || longitude > 110) continue;

    const rawName = extractTag(chunk, 'name') || 'Trạm sạc VinFast';
    const rawDescription = extractTag(chunk, 'description');
    const address = htmlToText(rawDescription || rawName).slice(0, 1500);

    placemarks.push({
      name: htmlToText(rawName),
      address: address || 'Việt Nam',
      latitude,
      longitude,
      power_kw: parsePowerKw(rawDescription),
      city: 'Vietnam',
    });
  }

  return placemarks;
}

// ─── Diff / Comparison Logic ──────────────────────────────────────────

/**
 * Create a unique key for a station based on name + approximate location.
 * Rounds lat/lng to 4 decimals (~11m precision) to handle tiny coordinate shifts.
 */
function stationKey(station) {
  const lat = Number(station.latitude).toFixed(4);
  const lng = Number(station.longitude).toFixed(4);
  return `${station.name}|${lat}|${lng}`;
}

/**
 * Compare old stations vs new stations and return a detailed diff.
 */
function diffStations(oldStations, newStations) {
  const oldMap = new Map();
  for (const st of oldStations) {
    oldMap.set(stationKey(st), st);
  }

  const newMap = new Map();
  for (const st of newStations) {
    newMap.set(stationKey(st), st);
  }

  const added = [];
  const removed = [];
  const modified = [];

  // Find added & modified
  for (const [key, newSt] of newMap) {
    const oldSt = oldMap.get(key);
    if (!oldSt) {
      added.push(newSt);
    } else {
      // Check for changes in power_kw or address
      const changes = [];
      if (oldSt.power_kw !== newSt.power_kw) {
        changes.push({ field: 'power_kw', old: oldSt.power_kw, new: newSt.power_kw });
      }
      if (oldSt.address !== newSt.address) {
        changes.push({ field: 'address', old: oldSt.address, new: newSt.address });
      }
      if (changes.length > 0) {
        modified.push({ station: newSt, changes });
      }
    }
  }

  // Find removed
  for (const [key, oldSt] of oldMap) {
    if (!newMap.has(key)) {
      removed.push(oldSt);
    }
  }

  return { added, removed, modified, unchanged: newStations.length - added.length - modified.length };
}

// ─── Sync Log ─────────────────────────────────────────────────────────

const SYNC_LOG_DIR = path.join(__dirname, 'sync_logs');

/**
 * Write a sync report (JSON + human-readable) to the sync_logs directory.
 */
function writeSyncLog(diff, meta) {
  if (!fs.existsSync(SYNC_LOG_DIR)) {
    fs.mkdirSync(SYNC_LOG_DIR, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const logFile = path.join(SYNC_LOG_DIR, `sync_${timestamp}.json`);

  const report = {
    timestamp: new Date().toISOString(),
    ...meta,
    summary: {
      added: diff.added.length,
      removed: diff.removed.length,
      modified: diff.modified.length,
      unchanged: diff.unchanged,
    },
    hasChanges: diff.added.length > 0 || diff.removed.length > 0 || diff.modified.length > 0,
    details: {
      added: diff.added.map(st => ({ name: st.name, address: st.address, lat: st.latitude, lng: st.longitude, power_kw: st.power_kw })),
      removed: diff.removed.map(st => ({ name: st.name, address: st.address, lat: st.latitude, lng: st.longitude, power_kw: st.power_kw })),
      modified: diff.modified.map(m => ({
        name: m.station.name,
        lat: m.station.latitude,
        lng: m.station.longitude,
        changes: m.changes,
      })),
    },
  };

  fs.writeFileSync(logFile, JSON.stringify(report, null, 2), 'utf-8');
  console.log(`[KML Sync] Sync log saved: ${logFile}`);

  return report;
}

// ─── Main Import Function ─────────────────────────────────────────────

/**
 * Fetch and import charging stations from the VinFast Google Maps KML.
 * - Backs up the DB file before any changes
 * - Compares old vs new stations to produce a diff
 * - Only replaces data if new data was successfully fetched
 * - Writes a sync log with full details
 *
 * Returns { success, count, previousCount, diff, logFile }
 */
async function importKmlStations() {
  const KML_URL = 'https://www.google.com/maps/d/kml?mid=1iIZ3L3KEKU0fg5XsIQ6hbRl7NVY8JNA&forcekml=1';

  console.log('[KML Sync] Fetching KML data from Google Maps...');

  const response = await axios.get(KML_URL, { responseType: 'text', timeout: 30_000 });
  if (response.status !== 200) {
    throw new Error(`Failed to fetch KML: ${response.status}`);
  }

  const kmlText = response.data;
  console.log(`[KML Sync] Received KML data, length: ${kmlText.length} characters`);

  const newStations = parseKmlStations(kmlText);

  console.log(`[KML Sync] Successfully parsed ${newStations.length} stations from KML.`);

  if (newStations.length === 0) {
    console.log('[KML Sync] No stations found. Skipping database update.');
    return { success: false, count: 0, error: 'No stations parsed from KML' };
  }

  const db = getDb();

  // ── Step 1: Snapshot old data for comparison ──
  const oldStations = db.prepare('SELECT name, address, latitude, longitude, power_kw, city FROM charging_stations').all();
  const oldCount = oldStations.length;

  // ── Step 2: Compare old vs new ──
  const diff = diffStations(oldStations, newStations);

  const hasChanges = diff.added.length > 0 || diff.removed.length > 0 || diff.modified.length > 0;

  console.log(`[KML Sync] Diff: +${diff.added.length} added, -${diff.removed.length} removed, ~${diff.modified.length} modified, =${diff.unchanged} unchanged`);

  if (!hasChanges) {
    console.log('[KML Sync] No changes detected. Database is up to date.');
    const report = writeSyncLog(diff, { oldCount, newCount: newStations.length, action: 'skipped_no_changes' });
    return { success: true, count: oldCount, previousCount: oldCount, hasChanges: false, diff: report.summary };
  }

  // ── Step 3: Backup the DB file before making changes ──
  const backupDir = path.join(__dirname, 'backups');
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = path.join(backupDir, `vinfast_backup_${timestamp}.db`);
  await db.backup(backupPath);
  console.log(`[KML Sync] Database backed up: ${backupPath}`);

  // ── Step 4: Replace stations in DB ──
  const insertStation = db.prepare(`
    INSERT INTO charging_stations (name, address, latitude, longitude, power_kw, city)
    VALUES (@name, @address, @latitude, @longitude, @power_kw, @city)
  `);

  let count = 0;
  const insertStationTransaction = db.transaction((items) => {
    db.prepare('DELETE FROM charging_stations').run();
    for (const item of items) {
      insertStation.run(item);
      count++;
    }
  });

  insertStationTransaction(newStations);
  console.log(`[KML Sync] Done! ${oldCount} → ${count} stations (${count - oldCount >= 0 ? '+' : ''}${count - oldCount})`);

  // ── Step 5: Write sync log ──
  const report = writeSyncLog(diff, {
    oldCount,
    newCount: count,
    action: 'updated',
    backupFile: backupPath,
  });

  // ── Step 6: Clean up old backups (keep last 5) ──
  cleanOldBackups(backupDir, 5);

  return {
    success: true,
    count,
    previousCount: oldCount,
    hasChanges: true,
    diff: report.summary,
    backupFile: backupPath,
  };
}

/**
 * Keep only the N most recent backup files, delete older ones.
 */
function cleanOldBackups(dir, keepCount) {
  try {
    const files = fs.readdirSync(dir)
      .filter(f => f.startsWith('vinfast_backup_') && f.endsWith('.db'))
      .sort()
      .reverse();

    const toDelete = files.slice(keepCount);
    for (const file of toDelete) {
      fs.unlinkSync(path.join(dir, file));
      console.log(`[KML Sync] Deleted old backup: ${file}`);
    }
  } catch (err) {
    console.warn('[KML Sync] Cleanup warning:', err.message);
  }
}

module.exports = { importKmlStations, parseKmlStations, diffStations };

// Auto-run only when called directly: node fetchKmlStations.js
if (require.main === module) {
  importKmlStations()
    .then(result => {
      console.log('\n=== Sync Result ===');
      console.log(JSON.stringify(result, null, 2));
    })
    .catch(err => {
      console.error('Error running KML script:', err);
    })
    .finally(() => {
      closeDb();
      process.exit(0);
    });
}
