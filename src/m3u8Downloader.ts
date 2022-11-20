import fs from 'fs';
import path from 'path';

import got from 'got';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegStatic from 'ffmpeg-static';
import { Parser } from 'm3u8-parser';

import type { Headers } from 'got';

import { defaultPathDownloadDir, httpTimeout } from './config';
import { formatDuration, sleep, patchHeaders } from "./utils";

import SegmentDownloader from "./segmentDownloader";
import FFmpegStreamReadable from "./fFmpegStreamReadable";

const ffmpegPath = ffmpegStatic.replace(/app.asar[\/\\]{1,2}/g, '');

export default class M3u8Downloader {
    taskName: string;
    m3u8_url: string;
    headers: Headers;
    parser: Parser;
    videoToBeSavedDir = '';
    pathDownloadDir = '';
    constructor({
        taskName = '',
        m3u8_url = '',
        pathDownloadDir = defaultPathDownloadDir,
    }: {
        taskName?: string,
        m3u8_url?: string,
        pathDownloadDir?: string,
    }) {
        if (!m3u8_url) {
            throw new Error('请输入正确的M3U8-URL');
        }
        this.m3u8_url = m3u8_url;

        if (!taskName) {
            taskName = new Date().getTime() + '';
        }
        this.taskName = taskName;

        this.pathDownloadDir = pathDownloadDir;
        this.headers = patchHeaders(this.m3u8_url);
    }
    async parseM3u8() {
        let hlsSrc = this.m3u8_url;
        let parser = new Parser();

        for (let index = 0; index < 3; index++) {
            let response = await got(hlsSrc, {
                headers: this.headers,
                timeout: httpTimeout,
            });

            if (response?.body) {
                parser.push(response.body);
                parser.end();
                if (
                    parser.manifest.segments.length == 0 &&
                    parser.manifest?.playlists?.length >= 1
                ) {
                    let uri = parser.manifest.playlists[0].uri;
                    if (!uri.startsWith('http')) {
                        hlsSrc = uri[0] == '/' ?
                            (hlsSrc.substr(0, hlsSrc.indexOf('/', 10)) + uri) :
                            (hlsSrc.replace(/\/[^\/]*((\?.*)|$)/, '/') + uri);
                    } else {
                        hlsSrc = uri;
                    }
                    this.m3u8_url = hlsSrc;
                    parser = new Parser();
                    continue;
                }
                break;
            }
        }

        this.parser = parser;

        let count_seg = parser.manifest.segments.length;
        if (count_seg > 0) {
            if (parser.manifest.endList) {
                let duration = 0;
                parser.manifest
                    .segments
                    .forEach((segment: any) => {
                        duration += segment.duration;
                    });
                const msg = `The resource has been parsed. There are ${count_seg} segments.` +
                    `duration: ${formatDuration(duration)}.` +
                    'start caching ...';
                console.log(msg);
            }
        }
    }

    async download() {
        await this.parseM3u8();
        this.videoToBeSavedDir = path.join(
            this.pathDownloadDir,
            this.taskName.replace(/["“”，\.。\|\/\\ \*:;\?<>]/g, "")
        );
        !fs.existsSync(this.videoToBeSavedDir) && fs.mkdirSync(this.videoToBeSavedDir, { recursive: true });

        let segments = this.parser.manifest.segments;
        const promises: Promise<any>[] = [];
        for (let iSeg = 0; iSeg < segments.length; iSeg++) {
            const segmentDownloadWorker = new SegmentDownloader(
                {
                    idx: iSeg,
                    segment: segments[iSeg],
                    task: this,
                }
            );
            promises.push(segmentDownloadWorker.downloadSegment());
        }
        await Promise.all(promises);
        // download done, starting to merge ts files
        let fileSegments: string[] = [];
        for (let iSeg = 0; iSeg < segments.length; iSeg++) {
            let filepath = path.join(
                this.videoToBeSavedDir,
                `${((iSeg + 1) + '').padStart(6, '0')}.ts`
            );
            if (fs.existsSync(filepath)) {
                fileSegments.push(filepath);
            }
        }
        if (!fileSegments.length) {
            // download failed, please check the validity of the link
            return;
        }
        let outPathMP4 = path.join(this.videoToBeSavedDir, Date.now() + ".mp4");
        let outPathMP4_ = path.join(
            this.pathDownloadDir,
            this.taskName.replace(/["“”，\.。\|\/\\ \*:;\?<>]/g, "") + '.mp4'
        );
        if (fs.existsSync(ffmpegPath)) {
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
                    // merge done          
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
}
