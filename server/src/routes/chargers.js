const express = require('express');
const router = express.Router();
const { getNearbyChargers } = require('../services/chargerService');

router.get('/nearby-chargers', (req, res) => {
  try {
    const lat = parseFloat(req.query.lat);
    const lng = parseFloat(req.query.lng);
    const radius = parseFloat(req.query.radius) || 50;

    if (isNaN(lat) || isNaN(lng)) {
      return res.status(400).json({ error: 'Valid lat and lng query parameters are required' });
    }

    const chargers = getNearbyChargers(lat, lng, radius);
    res.json(chargers);
  } catch (error) {
    console.error('Error in /nearby-chargers:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
