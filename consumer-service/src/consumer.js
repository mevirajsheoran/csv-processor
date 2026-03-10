const { Kafka } = require('kafkajs');
const config = require('./config');
const logger = require('./utils/logger');
const recordsUploadedHandler = require('./handlers/records-uploaded.handler');

let kafka = null;
let consumer = null;

/**
 * Creates and connects the Kafka consumer.
 */
async function createConsumer() {
  kafka = new Kafka({
    clientId: config.kafka.clientId,
    brokers: config.kafka.brokers,
    retry: {
      initialRetryTime: 1000,
      retries: 10,
    },
    connectionTimeout: 10000,
  });

  consumer = kafka.consumer({
    groupId: config.kafka.groupId,
    sessionTimeout: 30000,
    heartbeatInterval: 3000,
    // CRITICAL: Disable auto-commit — we commit manually after successful processing
    autoCommit: false,
  });

  consumer.on('consumer.connect', () => {
    logger.info('✅ Kafka consumer connected', {
      groupId: config.kafka.groupId,
      brokers: config.kafka.brokers,
    });
  });

  consumer.on('consumer.disconnect', () => {
    logger.warn('Kafka consumer disconnected');
  });

  consumer.on('consumer.crash', (event) => {
    logger.error('Kafka consumer crashed', {
      error: event.payload.error.message,
      restart: event.payload.restart,
    });
  });

  await consumer.connect();
}

/**
 * Subscribes to the topic and starts consuming messages.
 * Each message is processed individually with manual offset commits.
 */
async function startConsuming() {
  await consumer.subscribe({
    topic: config.kafka.topic,
    fromBeginning: false,
  });

  logger.info('📡 Subscribed to topic', { topic: config.kafka.topic });
  logger.info('⏳ Waiting for messages...');

  await consumer.run({
    // Process one message at a time for simplicity and reliability
    partitionsConsumedConcurrently: 1,

    eachMessage: async ({ topic, partition, message }) => {
      const messageInfo = {
        topic,
        partition,
        offset: message.offset,
        timestamp: message.timestamp,
      };

      try {
        // Parse message value
        const event = JSON.parse(message.value.toString());

        // Validate event structure
        if (!event.eventId || !event.eventType || !event.payload) {
          logger.error('Malformed event — missing required fields, skipping', {
            ...messageInfo,
            receivedKeys: Object.keys(event),
          });
          // Commit offset to skip malformed messages permanently
          await commitOffset(topic, partition, message.offset);
          return;
        }

        // Route to appropriate handler based on event type
        if (event.eventType === 'RECORDS_UPLOADED') {
          await recordsUploadedHandler.handle(event);
        } else {
          logger.warn('Unknown event type, skipping', {
            ...messageInfo,
            eventType: event.eventType,
          });
        }

        // Success — commit offset so this message is not redelivered
        await commitOffset(topic, partition, message.offset);
      } catch (error) {
        // Processing failed — DO NOT commit offset
        // Kafka will redeliver this message on the next poll
        logger.error('Failed to process message — will be retried', {
          ...messageInfo,
          error: error.message,
        });

        // Optional: add a small delay before the next attempt to avoid tight retry loops
        await new Promise((resolve) => setTimeout(resolve, 5000));
      }
    },
  });
}

/**
 * Commits the offset for a specific partition.
 * Called only after successful message processing.
 *
 * @param {string} topic
 * @param {number} partition
 * @param {string} offset - Current message offset
 */
async function commitOffset(topic, partition, offset) {
  await consumer.commitOffsets([
    {
      topic,
      partition,
      // Commit offset + 1 because Kafka commits the NEXT offset to read
      offset: (parseInt(offset, 10) + 1).toString(),
    },
  ]);
}

/**
 * Gracefully disconnects the Kafka consumer.
 */
async function disconnect() {
  if (consumer) {
    await consumer.disconnect();
    consumer = null;
    logger.info('Kafka consumer disconnected');
  }
}

module.exports = {
  createConsumer,
  startConsuming,
  disconnect,
};