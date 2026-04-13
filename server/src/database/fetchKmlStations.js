const fs = require('fs');
const { getDb } = require('./init');

async function importKmlStations() {
  const KML_URL = 'https://www.google.com/maps/d/kml?mid=1iIZ3L3KEKU0fg5XsIQ6hbRl7NVY8JNA&forcekml=1';
  
  console.log("Fetching KML data from Google Maps...");
  
  const response = await fetch(KML_URL);
  if (!response.ok) {
    throw new Error(`Failed to fetch KML: ${response.status}`);
  }
  
  const kmlText = await response.text();
  console.log(`Received KML data, length: ${kmlText.length} characters`);
  
  // Very simplistic Regex matching for Placemarks
  // We need <name>, <description> (optional), and <coordinates> (lon,lat)
  const placemarks = [];
  const placemarkRegex = /<Placemark>([\s\S]*?)<\/Placemark>/g;
  let match;
  
  while ((match = placemarkRegex.exec(kmlText)) !== null) {
    const chunk = match[1];
    
    // Extract name
    const nameMatch = /<name><!\[CDATA\[(.*?)\]\]><\/name>|<name>(.*?)<\/name>/.exec(chunk);
    const name = nameMatch ? (nameMatch[1] || nameMatch[2]) : "Trạm sạc VinFast";
    
    // Extract description (usually contains address)
    const descMatch = /<description><!\[CDATA\[([\s\S]*?)\]\]><\/description>|<description>([\s\S]*?)<\/description>/.exec(chunk);
    let address = "Việt Nam";
    if (descMatch) {
      const rawDesc = descMatch[1] || descMatch[2] || "";
      // Strip HTML tags from description if any
      address = rawDesc.replace(/<[^>]*>?/gm, ' ').replace(/\s+/g, ' ').trim();
      if (address.length > 200) {
          address = address.substring(0, 200) + '...';
      }
    }
    
    // Extract coordinates
    const coordsMatch = /<coordinates>\s*([-\d.]+)\s*,\s*([-\d.]+)/.exec(chunk);
    if (coordsMatch) {
      const longitude = parseFloat(coordsMatch[1]);
      const latitude = parseFloat(coordsMatch[2]);
      
      // Try to parse power from description (e.g. "10 cổng 20KW 16 cổng 11KW")
      let power_kw = 60; // default fallback
      if (descMatch) {
        const rawText = descMatch[1] || descMatch[2] || "";
        // Find all power values like "20KW", "60kW", "150 kW"
        const powerMatches = rawText.match(/(\d+)\s*[kK][wW]/g);
        if (powerMatches && powerMatches.length > 0) {
          // Extract the maximum power value
          const powerValues = powerMatches.map(m => parseInt(m.match(/(\d+)/)[1]));
          power_kw = Math.max(...powerValues);
        }
      }

      placemarks.push({
        name,
        address,
        latitude,
        longitude,
        power_kw,
        city: 'Vietnam'
      });
    }
  }
  
  console.log(`Successfully parsed ${placemarks.length} stations from KML.`);
  
  if (placemarks.length === 0) {
    console.log("No stations found. Cannot replace database.");
    return;
  }
  
  const db = getDb();
  
  // Clear old OSM stations
  db.prepare('DELETE FROM charging_stations').run();
  
  const insertStation = db.prepare(`
    INSERT INTO charging_stations (name, address, latitude, longitude, power_kw, city)
    VALUES (@name, @address, @latitude, @longitude, @power_kw, @city)
  `);

  let count = 0;
  const insertStationTransaction = db.transaction((items) => {
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
}).finally(() => process.exit(0));
