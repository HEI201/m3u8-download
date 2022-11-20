import path from 'path';
import fs from 'fs';
import download from "download";
import crypto from 'crypto';
import M3u8Downloader from './m3u8Downloader';

const aes_file_name = 'aes.key';

export default class SegmentDownloader {
    idx: number;
    segment: any;
    task: M3u8Downloader;
    constructor({
        segment = null,
        idx = 0,
        task
    }: {
        segment?: any,
        idx?: number,
        task: M3u8Downloader;
    }) {
        this.segment = segment;
        this.task = task;
        this.idx = idx;
    }
    getParentUri(m3u8_url: string) {
        const partent_uri = m3u8_url.replace(/([^\/]*\?.*$)|([^\/]*$)/g, '');
        return partent_uri;
    }
    getTsUrl(m3u8_url: string, segment_uri: string) {
        const partent_uri = this.getParentUri(m3u8_url);
        let ts_url = '';
        if (/^http.*/.test(segment_uri)) {
            ts_url = segment_uri;
        } else if (/^http/.test(m3u8_url) && /^\/.*/.test(segment_uri)) {
            const mes = m3u8_url.match(/^https?:\/\/[^/]*/);
            if (mes && mes.length >= 1) {
                ts_url = mes[0] + segment_uri;
            } else {
                ts_url = partent_uri + (partent_uri.endsWith('/') || segment_uri.startsWith('/') ? '' : "/") + segment_uri;
            }
        } else if (/^http.*/.test(m3u8_url)) {
            ts_url = partent_uri + (partent_uri.endsWith('/') || segment_uri.startsWith('/') ? '' : "/") + segment_uri;
        }
        return ts_url;
    }
    getKeyUrl(m3u8_url: string, key_uri: string) {
        const partent_uri = this.getParentUri(m3u8_url);
        let key_url = key_uri;
        if (
            /^http/.test(m3u8_url) &&
            !/^http.*/.test(key_uri) &&
            !/^\/.*/.test(key_uri)
        ) {
            key_url = partent_uri + key_uri;
        } else if (
            /^http/.test(m3u8_url) &&
            /^\/.*/.test(key_uri)
        ) {
            const mes = m3u8_url.match(/^https?:\/\/[^/]*/);
            if (mes && mes.length >= 1) {
                key_url = mes[0] + key_uri;
            } else {
                key_url = partent_uri + key_uri;
            }
        }
        return key_url;
    }
    async downloadSegment() {
        const segment = this.segment;
        const ts_url = this.getTsUrl(this.task.m3u8_url, segment.uri);
        const filename = `${((this.idx + 1) + '').padStart(6, '0')}.ts`;
        const filename_dl = filename + '.dl';
        const filepath = path.join(this.task.videoToBeSavedDir, filename);
        const filepath_dl = path.join(this.task.videoToBeSavedDir, filename_dl);
        for (let index = 0; index < 3 && !fs.existsSync(filepath); index++) {
            // use .dl suffix to download, rename it after downloaded
            await download(
                ts_url,
                this.task.videoToBeSavedDir,
                {
                    filename: filename_dl,
                    // @ts-ignore
                    headers: this.task.headers
                },
            ).catch((e: any) => {
                console.log('something went wrong while downloading segment', e);
                fs.existsSync(filepath_dl) && fs.unlinkSync(filepath_dl);
            });
            if (!fs.existsSync(filepath_dl)) continue;
            fs.statSync(filepath_dl).size <= 0 && fs.unlinkSync(filepath_dl);
            if (segment.key != null && segment.key.method != null) {
                const aes_path = path.join(this.task.videoToBeSavedDir, aes_file_name);
                if (!fs.existsSync(aes_path)) {
                    const key_url = this.getKeyUrl(this.task.m3u8_url, segment.key.uri);
                    if (/^http/.test(key_url)) {
                        await download(key_url, this.task.videoToBeSavedDir, {
                            filename: aes_file_name,
                        }).catch(console.error);
                    }
                }
                if (fs.existsSync(aes_path)) {
                    // standardly decrypt ts stream
                    try {
                        let key_ = null;
                        let iv_ = null;
                        key_ = fs.readFileSync(aes_path);
                        if (key_.length == 32) {
                            key_ = Buffer.from(fs.readFileSync(aes_path, {
                                encoding: 'utf8'
                            }), 'hex');
                        }
                        iv_ = segment.key.iv != null ? Buffer.from(segment.key.iv.buffer) :
                            Buffer.from(this.idx.toString(16).padStart(32, '0'), 'hex');
                        const cipher = crypto.createDecipheriv((segment.key.method + "-cbc").toLowerCase(), key_, iv_);
                        cipher.on('error', console.error);
                        const inputData = fs.readFileSync(filepath_dl);
                        const outputData = Buffer.concat([cipher.update(inputData), cipher.final()]);
                        fs.writeFileSync(filepath, outputData);
                        if (fs.existsSync(filepath_dl))
                            fs.unlinkSync(filepath_dl);
                    } catch (error) {
                        if (fs.existsSync(filepath_dl))
                            fs.unlinkSync(filepath_dl);
                    }
                    return;
                }
            } else {
                fs.renameSync(filepath_dl, filepath);
                break;
            }
        }
        if (!fs.existsSync(filepath)) {
            throw new Error('file does not exist');
        }
    }
}