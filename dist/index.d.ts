import type { Headers } from 'got';
import { Parser } from 'm3u8-parser';
type M3u8DownloaderOptions = {
    taskName?: string;
    m3u8_url: string;
    savedPath?: string;
    merge?: boolean;
    m3u8TsPath?: string;
};
export default class M3u8Downloader {
    taskName: string;
    m3u8_url: string;
    savedPath: string;
    merge: boolean;
    m3u8TsPath: string;
    headers: Headers;
    parser: Parser;
    videoSavedPath: string;
    constructor({ taskName, m3u8_url, savedPath, merge, m3u8TsPath, }: M3u8DownloaderOptions);
    parseM3u8(): Promise<void>;
    generateM3u8(): string;
    download(): Promise<void>;
}
export {};
