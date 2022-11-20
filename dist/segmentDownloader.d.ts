import M3u8Downloader from './m3u8Downloader';
export default class SegmentDownloader {
    idx: number;
    segment: any;
    task: M3u8Downloader;
    constructor({ segment, idx, task }: {
        segment?: any;
        idx?: number;
        task: M3u8Downloader;
    });
    getParentUri(m3u8_url: string): string;
    getTsUrl(m3u8_url: string, segment_uri: string): string;
    getKeyUrl(m3u8_url: string, key_uri: string): string;
    downloadSegment(): Promise<void>;
}
