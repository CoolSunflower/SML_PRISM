const express = require('express');
const router = express.Router();

const kwatchRoutes = require('./kwatch');
const webhookRoutes = require('./webhook');
const itemsRoutes = require('./items'); // Testing routes
const healthRoutes = require('./health');
const classifyRoutes = require('./classify');
const googleAlertsRoutes = require('./googleAlerts');
const analyticsRoutes = require('./analytics');
const filtersRoutes = require('./filters');
const feedRoutes = require('./feed');

// Mount routes
router.use('/webhook', webhookRoutes);
router.use('/kwatch', kwatchRoutes);
router.use('/items', itemsRoutes);
router.use('/health', healthRoutes);
router.use('/classify', classifyRoutes);
router.use('/google-alerts', googleAlertsRoutes);
router.use('/analytics', analyticsRoutes);
router.use('/filters', filtersRoutes);
router.use('/feed', feedRoutes);

module.exports = router;
