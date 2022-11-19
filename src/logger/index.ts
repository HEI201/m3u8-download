import winston from "winston";
import path from 'path';

const logPath = '';

const logger = winston.createLogger({
    level: 'debug',
    format: winston.format.combine(
        winston.format.timestamp({
            format: 'YYYY-MM-DD HH:mm:ss'
        }),
        winston.format.printf(info => `${info.timestamp} ${info.level}: ${info.message}` + (info.splat !== undefined ? `${info.splat}` : " "))
    ),
    transports: [
        new winston.transports.Console(),
        new winston.transports.File({
            filename: path.join(logPath, 'logs/error.log'),
            level: 'error'
        }),
        new winston.transports.File({
            filename: path.join(logPath, 'logs/all.log')
        }),
    ],
});

export default logger;