import { z } from 'zod';

const booleanFlag = z
  .enum(['true', 'false', '1', '0'])
  .transform((value) => value === 'true' || value === '1');

const optionalText = z
  .string()
  .optional()
  .transform((value) => (value && value.trim().length > 0 ? value : undefined));

const configSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  HOST: z.string().default('0.0.0.0'),
  PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1).default('redis://localhost:6379'),
  APP_ORIGIN: z.string().url().default('http://localhost:5173'),
  COOKIE_SECURE: booleanFlag.default(false),
  SESSION_TTL_DAYS: z.coerce.number().int().positive().default(30),
  SMTP_URL: optionalText,
  MAIL_FROM: z.string().default('Open Chess Lab <no-reply@localhost>'),
  WEB_DIST_DIR: optionalText,
  STOCKFISH_PATH: optionalText,
  FAIR_PLAY_ENABLED: booleanFlag.default(true),
  FAIR_PLAY_DEPTH: z.coerce.number().int().min(4).max(30).default(12),
});

export type AppConfig = z.infer<typeof configSchema>;

function withPlatformDefaults(environment: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const publicUrl = environment.RENDER_EXTERNAL_URL;
  if (environment.APP_ORIGIN || !publicUrl) return environment;
  return { ...environment, APP_ORIGIN: publicUrl };
}

export function loadConfig(environment: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = configSchema.safeParse(withPlatformDefaults(environment));
  if (!parsed.success) {
    const problems = parsed.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');
    throw new Error(`Invalid configuration: ${problems}`);
  }
  return parsed.data;
}
