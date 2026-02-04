const express = require('express');
const router = express.Router();
const { generateKWatchId, addToQueue } = require('../services/kwatchQueue');

// POST /api/webhook/kwatch - KWatch Webhook Endpoint
router.post('/kwatch', async (req, res) => {
  try {
    const payload = req.body;
    
    // Validate required fields
    if (!payload.platform || !payload.query || !payload.datetime || 
        !payload.link || !payload.author || !payload.content) {
      return res.status(400).json({ 
        error: 'Missing required fields',
        received: Object.keys(payload)
      });
    }

    // Respond immediately to prevent timeout
    res.status(200).json({ 
      message: 'Notification received',
    });

    // Process asynchronously after response is sent
    setImmediate(() => {
      try {
        // Generate ID using content hash
        const uniqueId = generateKWatchId(payload.content);

        // Create normalized document for Cosmos DB
        const kwatchDocument = {
          id: uniqueId,
          platform: payload.platform,
          query: payload.query,
          datetime: payload.datetime,
          link: payload.link,
          author: payload.author,
          title: payload.title || '',
          content: payload.content,
          sentiment: payload.sentiment || 'neutral',
          receivedAt: new Date().toISOString(),
          isDuplicate: false // Default, may be updated during processing
        };

        const queuePosition = addToQueue(kwatchDocument);

        console.log(`KWatch notification queued: ${payload.platform} - ${uniqueId}`);
        console.log(`Queue size: ${queuePosition}`);
      } catch (error) {
        console.error('Failed to queue notification:', error);
      }
    });
  } catch (error) {
    console.error('KWatch webhook error:', error);
    res.status(500).json({ error: 'Failed to process webhook' });
  }
});

module.exports = router;
