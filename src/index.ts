import fs from 'fs';
import path from 'path';

import ffmpegStatic from 'ffmpeg-static';
import ffmpeg from 'fluent-ffmpeg';
import type { Headers } from 'got';
import got from 'got';
import { Parser } from 'm3u8-parser';

import { DefaultPathDownloadPath, HttpTimeout } from './config';
import { formatDuration, getSegmentFilename, patchHeaders, sleep } from "./utils";

import sanitize from "sanitize-filename";
import FFmpegStreamReadable from "./FFmpegStreamReadable";
import SegmentDownloader from "./segmentDownloader";

const ffmpegPath = ffmpegStatic.replace(/app.asar[\/\\]{1,2}/g, '');

// folder structure:
// savedPath
//    videoSavedPath
//        video.ts
//        audio.ts
//        video.mp4
//    videoSavedPath
//        video.ts
//        audio.ts
//        video.mp4

type M3u8DownloaderOptions = {
    taskName?: string,
    m3u8_url: string,
    savedPath?: string,
    merge?: boolean,
    m3u8TsPath?: string,
};
export default class M3u8Downloader {
    taskName: string;
    m3u8_url: string;
    savedPath = '';
    merge = true;
    m3u8TsPath = '';

    headers: Headers;
    parser: Parser;
    videoSavedPath = '';

    constructor({
        taskName = '',
        m3u8_url,
        savedPath = DefaultPathDownloadPath,
        merge = true,
        m3u8TsPath = '',
    }: M3u8DownloaderOptions) {
        if (!m3u8_url) {
            throw new Error('请输入正确的M3U8-URL');
        }

        if (!taskName) {
            taskName = new Date().getTime() + '';
        }

        this.merge = merge;
        this.taskName = taskName;
        this.m3u8_url = m3u8_url;
        this.savedPath = savedPath;
        this.m3u8TsPath = m3u8TsPath;
        this.headers = patchHeaders(this.m3u8_url);
    }

    async parseM3u8() {
        let hlsSrc = this.m3u8_url;
        let parser = new Parser();

        for (let index = 0; index < 3; index++) {
            const response = await got(hlsSrc, {
                headers: this.headers,
                timeout: HttpTimeout,
            });

            if (!response?.body) {
                continue;
            }

            parser.push(response.body);
            parser.end();

            // if it is not the master playlist, then it is the media playlist
            if (
                parser.manifest.segments.length > 0 &&
                !parser.manifest?.playlists?.length
            ) {
                break;
            }

            // master playlist case, get the first media playlist, continue to parse
            // fixme: this can be optimized to get the best quality
            const uri = parser.manifest.playlists[0].uri;
            if (!uri.startsWith('http')) {
                hlsSrc = uri[0] == '/' ?
                    (hlsSrc.substr(0, hlsSrc.indexOf('/', 10)) + uri) :
                    (hlsSrc.replace(/\/[^\/]*((\?.*)|$)/, '/') + uri);
            } else {
                hlsSrc = uri;
            }

            this.m3u8_url = hlsSrc;
            parser = new Parser();
        }

        this.parser = parser;

        // log
        const count_seg = parser.manifest.segments.length;
        if (count_seg == 0 || !parser.manifest.endList) {
            return;
        }

        let duration = 0;
        parser.manifest
            .segments
            .forEach((segment: any) => {
                duration += segment.duration;
            });
        const msg = `
        The resource has been parsed. There are ${count_seg} segments. 
        duration: ${formatDuration(duration)}. 
        start caching ...
        `;
        console.log(msg);

    }

    generateM3u8() {
        const segments = this.parser.manifest.segments;
        let m3u8 = '';
        m3u8 += '#EXTM3U\n';
        m3u8 += '#EXT-X-VERSION:3\n';
        // @ts-ignore
        m3u8 += '#EXT-X-TARGETDURATION:' + segments[0]?.duration + '\n';
        m3u8 += '#EXT-X-MEDIA-SEQUENCE:0\n';
        const videoFolder = path.basename(this.videoSavedPath);
        segments.forEach((segment: any, index: number) => {
            m3u8 += '#EXTINF:' + segment.duration + ',\n';
            m3u8 += path.join(
                this.m3u8TsPath,
                videoFolder,
                getSegmentFilename(index)
            ) + '\n';
        });
        m3u8 += '#EXT-X-ENDLIST\n';
        return m3u8;
    }

    async download() {
        await this.parseM3u8();

        this.videoSavedPath = path.join(
            this.savedPath,
            sanitize(this.taskName)
        );
        !fs.existsSync(this.videoSavedPath) && fs.mkdirSync(this.videoSavedPath, { recursive: true });

        let segments = this.parser.manifest.segments;
        const promises: Promise<any>[] = [];
        for (let i = 0; i < segments.length; i++) {
            const segmentDownloadWorker = new SegmentDownloader(
                {
                    idx: i,
                    segment: segments[i],
                    m3u8_url: this.m3u8_url,
                    videoSavedPath: this.videoSavedPath,
                    headers: this.headers,
                }
            );
            promises.push(segmentDownloadWorker.download());
        }
        await Promise.all(promises);

        console.log('download segments done');

        // generate m3u8 file
        const m3u8 = this.generateM3u8();
        const m3u8Path = path.join(this.videoSavedPath, 'index.m3u8');
        fs.writeFileSync(m3u8Path, m3u8);

        if (!this.merge) {
            return;
        }

        // download done, starting to merge ts files
        let fileSegments: string[] = [];
        for (let i = 0; i < segments.length; i++) {
            let filepath = path.join(
                this.videoSavedPath,
                getSegmentFilename(i)
            );
            if (fs.existsSync(filepath)) {
                fileSegments.push(filepath);
            }
        }
        if (!fileSegments.length) {
            // download failed, please check the validity of the link
            return;
        }

        let outPathMP4 = path.join(this.videoSavedPath, Date.now() + ".mp4");
        let outPathMP4_ = path.join(
            this.savedPath,
            sanitize(this.taskName) + '.mp4'
        );

        if (!fs.existsSync(ffmpegPath)) {
            return;
        }

        let ffmpegInputStream = new FFmpegStreamReadable(null);
        ffmpeg(ffmpegInputStream)
            .setFfmpegPath(ffmpegPath)
            .videoCodec('copy')
            .audioCodec('copy')
            .format('mp4')
            .save(outPathMP4)
            .on('error', (e) => {
                // something went wrong while merging, try to merge manually
                console.log(e);
            })
            .on('end', function () {
                fs.existsSync(outPathMP4) && (fs.renameSync(outPathMP4, outPathMP4_));
            });

        for (let i = 0; i < fileSegments.length; i++) {

            let percent = Math.ceil((i + 1) * 100 / fileSegments.length);
            console.log(`merging ... [${percent}%]`);

            let filePath = fileSegments[i];
            fs.existsSync(filePath) && ffmpegInputStream.push(fs.readFileSync(filePath));

            // @ts-ignore
            while (ffmpegInputStream._readableState.length > 0) {
                await sleep(100);
            }
        }

        ffmpegInputStream.push(null);

    }
}
