const dotenv = require('dotenv');
const path = require('path');

// Load .env from project root (one level above api-service)
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

const requiredVars = [
  'PORT',
  'DATABASE_URL',
  'REDIS_HOST',
  'REDIS_PORT',
  'KAFKA_BROKERS',
  'KAFKA_TOPIC',
];

function validateEnv() {
  const missing = requiredVars.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    // Using console.error here intentionally — logger isn't initialized yet
    console.error(
      `\n❌ Missing required environment variables:\n   ${missing.join('\n   ')}\n`
    );
    console.error('   Copy .env.example to .env and fill in the values.\n');
    process.exit(1);
  }
}

function loadConfig() {
  validateEnv();

  return Object.freeze({
    port: parseInt(process.env.PORT, 10),

    database: {
      connectionString: process.env.DATABASE_URL,
      poolSize: parseInt(process.env.DB_POOL_SIZE || '10', 10),
    },

    redis: {
      host: process.env.REDIS_HOST,
      port: parseInt(process.env.REDIS_PORT, 10),
      cacheTTL: parseInt(process.env.CACHE_TTL || '3600', 10),
    },

    kafka: {
      brokers: process.env.KAFKA_BROKERS.split(','),
      topic: process.env.KAFKA_TOPIC,
      clientId: process.env.KAFKA_CLIENT_ID_API || 'csv-api-producer',
    },

    logging: {
      level: process.env.LOG_LEVEL || 'info',
    },
  });
}

module.exports = loadConfig();