import fs from 'fs';
import path from 'path';

import ffmpegStatic from 'ffmpeg-static';
import ffmpeg from 'fluent-ffmpeg';
import type { Headers } from 'got';
import got from 'got';
import { Parser } from 'm3u8-parser';

import { DefaultPathDownloadPath, HttpTimeout } from './config';
import { formatDuration, patchHeaders, sleep } from "./utils";

import sanitize from "sanitize-filename";
import FFmpegStreamReadable from "./fFmpegStreamReadable";
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
};
export default class M3u8Downloader {
    taskName: string;
    m3u8_url: string;
    savedPath = '';
    merge = true;

    headers: Headers;
    parser: Parser;
    videoSavedPath = '';

    constructor({
        taskName = '',
        m3u8_url,
        savedPath = DefaultPathDownloadPath,
        merge = true,
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

        if (!this.merge) {
            return;
        }

        // download done, starting to merge ts files
        let fileSegments: string[] = [];
        for (let i = 0; i < segments.length; i++) {
            let filepath = path.join(
                this.videoSavedPath,
                `${((i + 1) + '').padStart(6, '0')}.ts`
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
