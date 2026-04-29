const path = require('path');
const { getDb, closeDb } = require('./init');

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

async function importKmlStations() {
  const KML_URL = 'https://www.google.com/maps/d/kml?mid=1iIZ3L3KEKU0fg5XsIQ6hbRl7NVY8JNA&forcekml=1';
  
  console.log("Fetching KML data from Google Maps...");
  
  const response = await fetch(KML_URL);
  if (!response.ok) {
    throw new Error(`Failed to fetch KML: ${response.status}`);
  }
  
  const kmlText = await response.text();
  console.log(`Received KML data, length: ${kmlText.length} characters`);

  const placemarks = parseKmlStations(kmlText);
  
  console.log(`Successfully parsed ${placemarks.length} stations from KML.`);
  
  if (placemarks.length === 0) {
    console.log("No stations found. Cannot replace database.");
    return;
  }
  
  const db = getDb();
  const backupPath = path.join(
    __dirname,
    `vinfast.backup-before-kml-${new Date().toISOString().replace(/[:.]/g, '-')}.db`,
  );
  await db.backup(backupPath);
  console.log(`Database backup created: ${backupPath}`);
  
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

  insertStationTransaction(placemarks);
  console.log(`Successfully seeded ${count} real VinFast charging stations to the database!`);
}

importKmlStations().catch(err => {
    console.error("Error running KML script:", err);
}).finally(() => {
    closeDb();
    process.exit(0);
});
