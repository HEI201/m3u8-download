import path from 'path';
import winston from "winston";
import { DefaultPathDownloadPath } from "../config";

const logPath = DefaultPathDownloadPath;
const logFolder = 'm3u8';
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
            filename: path.join(logPath, logFolder, 'logs/error.log'),
            level: 'error'
        }),
        new winston.transports.File({
            filename: path.join(logPath, logFolder, 'logs/all.log')
        }),
    ],
});

export default logger;