const { CosmosClient } = require('@azure/cosmos');

// Cosmos DB setup - singleton client
const client = new CosmosClient({
  endpoint: process.env.COSMOS_ENDPOINT,
  key: process.env.COSMOS_KEY
});

// KWatch database and container (Final database)
const kwatchDatabase = client.database(process.env.COSMOS_KWATCH_DATABASE);
const kwatchContainer = kwatchDatabase.container(process.env.COSMOS_KWATCH_CONTAINER); // Container for KWatch Raw Data
const kwatchProcessedContainer = kwatchDatabase.container(process.env.COSMOS_KWATCH_PROCESSED_CONTAINER); // Container for Processed KWatch Data

// Google Alerts containers (same database as KWatch)
const googleAlertsRawContainer = kwatchDatabase.container(process.env.COSMOS_GOOGLE_ALERTS_RAW_CONTAINER || 'GoogleAlertsRawData');
const googleAlertsProcessedContainer = kwatchDatabase.container(process.env.COSMOS_GOOGLE_ALERTS_PROCESSED_CONTAINER || 'GoogleAlertsProcessedData');
const googleAlertsStateContainer = kwatchDatabase.container(process.env.COSMOS_GOOGLE_ALERTS_STATE_CONTAINER || 'GoogleAlertsState');

module.exports = {
  client,
  kwatchDatabase,
  kwatchContainer,
  kwatchProcessedContainer,
  googleAlertsRawContainer,
  googleAlertsProcessedContainer,
  googleAlertsStateContainer,
};
