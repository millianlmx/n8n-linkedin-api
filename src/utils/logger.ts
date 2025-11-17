import winston from 'winston';

// Custom format for console output
const consoleFormat = winston.format.printf(({ level, message, timestamp, service, ...metadata }) => {
  const meta = Object.keys(metadata).length ? JSON.stringify(metadata) : '';
  const serviceTag = service ? `[${service}]` : '';
  return `${timestamp} ${level.toUpperCase()} ${serviceTag} ${message} ${meta}`;
});

// Determine log level from environment
const logLevel = process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug');

const logger = winston.createLogger({
  level: logLevel,
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.splat(),
    winston.format.json()
  ),
  defaultMeta: { service: 'linkedin-api' },
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        consoleFormat
      ),
    }),
  ],
});

// Helper methods for structured logging
export const createServiceLogger = (serviceName: string) => {
  return {
    debug: (message: string, meta?: any) => logger.debug(message, { service: serviceName, ...meta }),
    info: (message: string, meta?: any) => logger.info(message, { service: serviceName, ...meta }),
    warn: (message: string, meta?: any) => logger.warn(message, { service: serviceName, ...meta }),
    error: (message: string, error?: any, meta?: any) => {
      if (error instanceof Error) {
        logger.error(message, { service: serviceName, error: error.message, stack: error.stack, ...meta });
      } else {
        logger.error(message, { service: serviceName, error, ...meta });
      }
    },
  };
};

export { logger };
