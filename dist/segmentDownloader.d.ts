export default class SegmentDownloader {
    idx: number;
    segment: any;
    m3u8_url: string;
    videoSavedPath: string;
    headers: any;
    constructor({ segment, idx, m3u8_url, videoSavedPath, headers, }: {
        segment?: any;
        idx?: number;
        m3u8_url: string;
        videoSavedPath: string;
        headers: any;
    });
    getParentUri(): string;
    getTsUrl(segment_uri: string): string;
    getKeyUrl(key_uri: string): string;
    download(): Promise<void>;
}
