const { Kafka } = require('kafkajs');
const config = require('../config');
const logger = require('../utils/logger');

let producer = null;
let isConnected = false;

/**
 * Creates and connects the Kafka producer singleton.
 * Called once during server startup.
 */
async function connect() {
  const kafka = new Kafka({
    clientId: config.kafka.clientId,
    brokers: config.kafka.brokers,
    retry: {
      initialRetryTime: 1000,
      retries: 5,
    },
    connectionTimeout: 10000,
  });

  producer = kafka.producer();

  producer.on('producer.connect', () => {
    logger.info('✅ Kafka producer connected', {
      brokers: config.kafka.brokers,
    });
    isConnected = true;
  });

  producer.on('producer.disconnect', () => {
    logger.warn('Kafka producer disconnected');
    isConnected = false;
  });

  await producer.connect();
}

/**
 * Publishes a RECORDS_UPLOADED event to the configured Kafka topic.
 *
 * @param {Object} params
 * @param {string} params.eventId - Unique event identifier for deduplication
 * @param {string} params.uploadId - Upload operation identifier
 * @param {string} params.fileName - Original CSV file name
 * @param {number} params.recordCount - Total records processed
 * @param {number} params.inserted - Number of new records inserted
 * @param {number} params.updated - Number of existing records updated
 * @returns {Promise<boolean>} true if published successfully, false otherwise
 */
async function publishUploadEvent({ eventId, uploadId, fileName, recordCount, inserted, updated }) {
  if (!producer || !isConnected) {
    logger.warn('Kafka producer not connected, skipping event publish', {
      eventId,
      uploadId,
    });
    return false;
  }

  const event = {
    eventId,
    eventType: 'RECORDS_UPLOADED',
    timestamp: new Date().toISOString(),
    payload: {
      uploadId,
      fileName,
      recordCount,
      inserted,
      updated,
    },
  };

  try {
    await producer.send({
      topic: config.kafka.topic,
      messages: [
        {
          key: uploadId,
          value: JSON.stringify(event),
          headers: {
            'event-type': 'RECORDS_UPLOADED',
            'event-id': eventId,
          },
        },
      ],
    });

    logger.info('📤 Kafka event published', {
      eventId,
      topic: config.kafka.topic,
      uploadId,
      recordCount,
    });

    return true;
  } catch (err) {
    logger.error('Failed to publish Kafka event', {
      eventId,
      uploadId,
      error: err.message,
    });
    return false;
  }
}

/**
 * Returns the current connection status of the Kafka producer.
 * Used by the health endpoint.
 *
 * @returns {boolean}
 */
function getIsConnected() {
  return isConnected;
}

/**
 * Gracefully disconnects the Kafka producer.
 * Called during server shutdown.
 */
async function disconnect() {
  if (producer) {
    await producer.disconnect();
    producer = null;
    isConnected = false;
    logger.info('Kafka producer disconnected');
  }
}

module.exports = {
  connect,
  publishUploadEvent,
  isConnected: getIsConnected,
  disconnect,
};