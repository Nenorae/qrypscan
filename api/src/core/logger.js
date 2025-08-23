import winston from 'winston';
import path from 'path';
import util from 'util';

const { combine, timestamp, printf, colorize, errors } = winston.format;

// The log file will be created in the project root directory.
const logFilePath = path.resolve(process.cwd(), '..', 'verification_log.txt');

// Custom formatter to correctly handle multiple arguments passed to the logger
const customFormatter = (useColor) => printf(({ level, message, timestamp, stack, ...rest }) => {
  const log = stack || (typeof message === 'object' ? JSON.stringify(message, null, 2) : message);
  
  // The 'splat' symbol holds the additional arguments
  const splat = rest[Symbol.for('splat')] || [];
  const formattedSplat = splat.map(item => util.inspect(item, { colors: useColor, depth: 4 })).join(' ');
  
  const finalLevel = useColor ? level : level.toUpperCase();

  return `${timestamp} ${finalLevel}: ${log} ${formattedSplat}`;
});

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: combine(
    errors({ stack: true }),
    timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' })
  ),
  transports: [
    // Keep logging to the console
    new winston.transports.Console({
      format: combine(
        colorize(),
        customFormatter(true)
      ),
    }),
    // Also, log to the specified file
    new winston.transports.File({
      filename: logFilePath,
      format: customFormatter(false),
    }),
  ],
});

export default logger;
