import Joi from 'joi';

const envSchema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'production', 'test').default('development'),
  PORT: Joi.number().default(3001),
  JWT_SECRET: Joi.string().min(32).required(),
  JWT_EXPIRES_IN: Joi.string().default('7d'),
  DATABASE_URL: Joi.string().uri().required(),
  CORS_ORIGIN: Joi.string().default('http://localhost:5173'),
  RATE_LIMIT_WINDOW_MS: Joi.number().default(900000),
  RATE_LIMIT_MAX: Joi.number().default(100),
  BCRYPT_ROUNDS: Joi.number().default(12),
  GROQ_API_KEY: Joi.string().optional(),
  CHAT_ENCRYPTION_KEY: Joi.string().optional(),
  REDIS_URL: Joi.string().allow('').optional()
}).unknown(true);

const { value: env, error } = envSchema.validate(process.env);
if (error) {
  console.error('Invalid env:', error.message);
  process.exit(1);
}

export default env;
