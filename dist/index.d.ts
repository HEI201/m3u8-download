import { Parser } from 'm3u8-parser';
import type { Headers } from 'got';
declare class Task {
    taskName: string;
    m3u8_url: string;
    headers: Headers;
    parser: Parser;
    videoToBeSavedDir: string;
    pathDownloadDir: string;
    constructor({ taskName, m3u8_url, pathDownloadDir, }: {
        taskName?: string;
        m3u8_url?: string;
        pathDownloadDir?: string;
    });
    parseM3u8(): Promise<void>;
    download(): Promise<void>;
}
export default Task;
