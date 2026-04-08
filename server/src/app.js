const express = require('express');
const cors = require('cors');
require('dotenv').config();

const { getDb, closeDb } = require('./database/init');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Initialize DB
getDb();

// Routes Placeholder (will create separate files later)
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'EV Smart Range Assistant Backend running' });
});

app.get('/api/vehicles', (req, res) => {
  const db = getDb();
  const vehicles = db.prepare('SELECT * FROM vehicles').all();
  res.json(vehicles);
});

// Import route modules
const rangeRoutes = require('./routes/range');
app.use('/api', rangeRoutes);

const reachabilityRoutes = require('./routes/reachability');
const chargerRoutes = require('./routes/chargers');
const routePlanningRoutes = require('./routes/routePlanning');
app.use('/api', reachabilityRoutes);
app.use('/api', chargerRoutes);
app.use('/api', routePlanningRoutes);

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('Shutting down server...');
  closeDb();
  process.exit();
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
