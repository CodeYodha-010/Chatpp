import Joi from 'joi';

const isProduction = process.env.NODE_ENV === 'production';

const envSchema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'production', 'test').default('development'),
  PORT: Joi.number().default(process.env.PORT || 3001),
  JWT_SECRET: isProduction
    ? Joi.string().min(32).required()
    : Joi.string().min(32).default('dev-secret-change-in-production-!!'),
  JWT_EXPIRES_IN: Joi.string().default('7d'),
  DATABASE_URL: isProduction
    ? Joi.string().required()
    : Joi.string().default('postgresql://postgres:password@localhost:5432/chatdb?schema=public'),
  CORS_ORIGIN: Joi.string().custom((value) => {
    // Support comma-separated list in production
    const origins = value.split(',').map(o => o.trim());
    return value;
  }, 'CORS origin validation').default(isProduction ? '*' : 'http://localhost:5173,https://localhost'),
  RATE_LIMIT_WINDOW_MS: Joi.number().default(900000),
  RATE_LIMIT_MAX: Joi.number().default(100),
  BCRYPT_ROUNDS: Joi.number().default(12),
  GROQ_API_KEY: Joi.string().allow('').optional(),
  CHAT_ENCRYPTION_KEY: isProduction
    ? Joi.string().pattern(/^[a-f0-9]{64}$/).required()
    : Joi.string().pattern(/^[a-f0-9]{64}$/).allow('').default('').optional(),
  REDIS_URL: Joi.string().allow('').optional()
}).unknown(true);

const { value: env, error } = envSchema.validate(process.env);
if (error) {
  console.error('Invalid environment configuration:', error.message);
  if (isProduction) {
    console.error('Production requires: DATABASE_URL, JWT_SECRET, CHAT_ENCRYPTION_KEY (64-char hex)');
  }
  process.exit(1);
}

// Warn on production misconfiguration (but don't crash if validation passes with defaults)
if (isProduction) {
  if (!env.GROQ_API_KEY) {
    console.warn('[config] GROQ_API_KEY not set — AI priority classification disabled (graceful fallback).');
  }
  if (!env.REDIS_URL) {
    console.warn('[config] REDIS_URL not set — using in-memory presence (single instance only).');
  }
}

export default env;
