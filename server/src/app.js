const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const { getDb, closeDb } = require('./database/init');
const { seed } = require('./database/seed');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json({ limit: '5mb' }));

// Initialize DB & auto-seed data
getDb();
seed();

// Routes Placeholder (will create separate files later)
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'EV Smart Range Assistant Backend running' });
});

app.get('/api/vehicles', (req, res) => {
  const db = getDb();
  const vehicles = db.prepare(`
    SELECT *
    FROM vehicles
    ORDER BY CASE name
      WHEN 'VF3' THEN 1
      WHEN 'VF5' THEN 2
      WHEN 'VFe34' THEN 3
      WHEN 'VF6_Eco' THEN 4
      WHEN 'VF6' THEN 5
      WHEN 'VF7_Eco' THEN 6
      WHEN 'VF7' THEN 7
      WHEN 'VF8_Eco' THEN 8
      WHEN 'VF8_Plus' THEN 9
      WHEN 'VF9_Eco' THEN 10
      WHEN 'VF9_Plus' THEN 11
      WHEN 'Minio_Green' THEN 12
      WHEN 'Herio_Green' THEN 13
      WHEN 'Nerio_Green' THEN 14
      WHEN 'Limo_Green' THEN 15
      WHEN 'EC_Van' THEN 16
      ELSE 99
    END,
    display_name COLLATE NOCASE
  `).all();
  res.json(vehicles);
});

// Import route modules
const rangeRoutes = require('./routes/range');
app.use('/api', rangeRoutes);

const reachabilityRoutes = require('./routes/reachability');
const chargerRoutes = require('./routes/chargers');
const routePlanningRoutes = require('./routes/routePlanning');
const googleMapsParserRoutes = require('./routes/googleMapsParser');
app.use('/api', reachabilityRoutes);
app.use('/api', chargerRoutes);
app.use('/api', routePlanningRoutes);
app.use('/api', googleMapsParserRoutes);

// Nominatim search proxy (avoids 403 from browser - User-Agent required)
app.get('/api/search-location', async (req, res) => {
  try {
    const { q } = req.query;
    if (!q) return res.json([]);
    
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&countrycodes=vn&limit=5&accept-language=vi`;
    const response = await fetch(url, {
      headers: { 'User-Agent': 'VFRangeAssistant/1.0' }
    });
    const data = await response.json();
    res.json(data);
  } catch (err) {
    console.error('Nominatim search error:', err);
    res.json([]);
  }
});

// Nearby amenities (restaurants, cafes) via Overpass API with auto-expanding radius
app.get('/api/nearby-amenities', async (req, res) => {
  try {
    const { lat, lng, radius: initialRadius = 500 } = req.query;
    if (!lat || !lng) return res.json([]);

    // Auto-expanding radius: try 500m, 1km, 2km, 3km until we find results
    const radiusSteps = [parseInt(initialRadius), 1000, 2000, 3000];
    let amenities = [];

    for (const radius of radiusSteps) {
      const overpassQuery = `
        [out:json][timeout:15];
        (
          node["amenity"="restaurant"](around:${radius},${lat},${lng});
          node["amenity"="cafe"](around:${radius},${lat},${lng});
          node["amenity"="fast_food"](around:${radius},${lat},${lng});
          node["shop"="convenience"](around:${radius},${lat},${lng});
          node["shop"="supermarket"](around:${radius},${lat},${lng});
        );
        out body 20;
      `;

      const response = await fetch('https://overpass-api.de/api/interpreter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'VFRangeAssistant/1.0' },
        body: `data=${encodeURIComponent(overpassQuery)}`
      });
      const data = await response.json();

      // Parse and return clean results
      amenities = (data.elements || []).map(el => {
        const tags = el.tags || {};
        // Calculate distance from station
        const dLat = (el.lat - parseFloat(lat)) * 111320;
        const dLng = (el.lon - parseFloat(lng)) * 111320 * Math.cos(parseFloat(lat) * Math.PI / 180);
        const distance = Math.round(Math.sqrt(dLat * dLat + dLng * dLng));

        // Determine type - shops get mapped to a friendly type
        let type = tags.amenity || tags.shop || 'other';
        if (tags.shop === 'convenience') type = 'convenience';
        if (tags.shop === 'supermarket') type = 'supermarket';

        return {
          name: tags.name || tags['name:vi'] || tags['name:en'] || 'Không tên',
          type,
          cuisine: tags.cuisine || '',
          address: tags['addr:street'] || tags['addr:full'] || '',
          lat: el.lat,
          lng: el.lon,
          distance, // meters from station
          openingHours: tags.opening_hours || '',
          searchRadius: radius // include which radius found it
        };
      })
      .filter(a => a.name !== 'Không tên')
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 15);

      // If we found results, stop expanding
      if (amenities.length > 0) break;
    }

    res.json(amenities);
  } catch (err) {
    console.error('Overpass API error:', err);
    res.json([]);
  }
});

// Serve React client in production
if (process.env.NODE_ENV === 'production') {
  const clientBuildPath = path.join(__dirname, '../../client/dist');
  app.use(express.static(clientBuildPath));
  // All non-API routes serve the React app (SPA fallback)
  app.get('*', (req, res) => {
    if (!req.path.startsWith('/api')) {
      res.sendFile(path.join(clientBuildPath, 'index.html'));
    }
  });
}

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('Shutting down server...');
  closeDb();
  process.exit();
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
