declare class Task {
    playlistUri: string;
    headers: object;
    myKeyIV: string;
    taskName: string;
    taskIsDelTs: boolean;
    url_prefix: string;
    addTaskMessage: string;
    playlists: any;
    url: string;
    id: string;
    pathDownloadDir: string;
    proxy_agent: any;
    constructor({ m3u8_url, playlistUri, headers, myKeyIV, taskName, taskIsDelTs, pathDownloadDir, configDir, id, config_proxy, url_prefix, }: {
        m3u8_url?: string;
        playlistUri?: string;
        headers?: string;
        myKeyIV?: string;
        taskName?: string;
        taskIsDelTs?: boolean;
        pathDownloadDir: any;
        configDir?: any;
        id?: string;
        config_proxy?: any;
        url_prefix?: string;
    });
    parseM3u8(): Promise<{
        code: number;
        message: string;
    } | {
        code: number;
        message: string;
        playlists: any;
    }>;
    afterParseM3u8(data: any): void;
    startDownload(): Promise<unknown>;
}
export default Task;
