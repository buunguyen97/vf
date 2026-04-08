const { getDb } = require('./init');

async function fetchAndSeedOverpassStations() {
  const query = `[out:json][timeout:25];
area["name"="Việt Nam"]->.searchArea;
(
  node["amenity"="charging_station"](area.searchArea);
);
out body;
>;
out skel qt;`;
  
  const url = 'https://overpass-api.de/api/interpreter';

  console.log("Fetching real VinFast stations from OpenStreetMap via Overpass API...");

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: `data=${encodeURIComponent(query)}`
  });
  
  if (!response.ok) {
    throw new Error(`API returned status: ${response.status}`);
  }

  const data = await response.json();
  
  if (!data.elements) {
    console.log("No elements found from API.");
    return;
  }
  
  const vStations = data.elements.filter(e => 
    e.tags && (
      (e.tags.brand && e.tags.brand.toLowerCase().includes('vinfast')) ||
      (e.tags.network && e.tags.network.toLowerCase().includes('vinfast')) ||
      (e.tags.operator && e.tags.operator.toLowerCase().includes('vinfast')) ||
      (e.tags.name && e.tags.name.toLowerCase().includes('vinfast'))
    )
  );

  console.log(`Found ${data.elements.length} total stations, of which ${vStations.length} are marked as VinFast.`);

  if (vStations.length === 0) {
    console.log("Filtering strict Vinfast didn't yield results. Let's add all charging stations as placeholders for testing.");
    // Fallback: Use all charging stations in testing
    vStations.push(...data.elements.slice(0, 50)); 
  }

  const db = getDb();
  
  const insertStation = db.prepare(`
    INSERT OR IGNORE INTO charging_stations (name, address, latitude, longitude, power_kw, city)
    VALUES (@name, @address, @latitude, @longitude, @power_kw, @city)
  `);

  let count = 0;
  const insertStationTransaction = db.transaction((items) => {
    for (const item of items) {
      if (!item.lat || !item.lon) continue; // skip non-nodes
      insertStation.run({
         name: item.tags?.name || 'Trạm sạc tự động (OSM)',
         address: item.tags?.['addr:street'] ? `${item.tags['addr:housenumber'] || ''} ${item.tags['addr:street']}`.trim() : 'Việt Nam',
         latitude: item.lat,
         longitude: item.lon,
         power_kw: parseInt(item.tags?.['capacity:kw'] || '60', 10),
         city: item.tags?.['addr:city'] || 'Vietnam'
      });
      count++;
    }
  });

  insertStationTransaction(vStations);
  console.log(`Successfully added ${count} charging stations to the database!`);
}

fetchAndSeedOverpassStations().catch(err => {
    console.error("Error running script:", err);
}).finally(() => process.exit(0));
