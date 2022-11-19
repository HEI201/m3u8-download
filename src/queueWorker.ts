import path from 'path';
import fs from 'fs';
import download from "download";
import crypto from 'crypto';
import Task from './index';

export default class QueueWorker {
    idx: number;
    segment: any;
    task: Task;
    constructor({
        segment = null,
        idx = 0,
        task
    }: {
        segment?: any,
        idx?: number,
        task: Task;
    }) {
        this.segment = segment;
        this.task = task;
        this.idx = idx;
    }
    async downloadSegment() {
        let partent_uri = this.task.m3u8_url.replace(/([^\/]*\?.*$)|([^\/]*$)/g, '');
        let segment = this.segment;
        let uri_ts = '';
        if (/^http.*/.test(segment.uri)) {
            uri_ts = segment.uri;
        } else if (/^http/.test(this.task.m3u8_url) && /^\/.*/.test(segment.uri)) {
            let mes = this.task.m3u8_url.match(/^https?:\/\/[^/]*/);
            if (mes && mes.length >= 1) {
                uri_ts = mes[0] + segment.uri;
            } else {
                uri_ts = partent_uri + (partent_uri.endsWith('/') || segment.uri.startWith('/') ? '' : "/") + segment.uri;
            }
        } else if (/^http.*/.test(this.task.m3u8_url)) {
            uri_ts = partent_uri + (partent_uri.endsWith('/') || segment.uri.startWith('/') ? '' : "/") + segment.uri;
        }
        let filename = `${((this.idx + 1) + '').padStart(6, '0')}.ts`;
        let filepath = path.join(this.task.videoToBeSavedDir, filename);
        let filepath_dl = path.join(this.task.videoToBeSavedDir, filename + ".dl");
        // test if file exists
        for (let index = 0; index < 3 && !fs.existsSync(filepath); index++) {
            // use .dl suffix to download, rename it after downloaded
            await download(
                uri_ts,
                this.task.videoToBeSavedDir,
                {
                    filename: filename + ".dl",
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
                // standardly decrypt ts stream
                let aes_path = path.join(this.task.videoToBeSavedDir, "aes.key");
                if (!fs.existsSync(aes_path)) {
                    let key_uri = segment.key.uri;
                    if (/^http/.test(this.task.m3u8_url) && !/^http.*/.test(key_uri) && !/^\/.*/.test(key_uri)) {
                        key_uri = partent_uri + key_uri;
                    } else if (/^http/.test(this.task.m3u8_url) && /^\/.*/.test(key_uri)) {
                        let mes = this.task.m3u8_url.match(/^https?:\/\/[^/]*/);
                        if (mes && mes.length >= 1) {
                            key_uri = mes[0] + key_uri;
                        } else {
                            key_uri = partent_uri + key_uri;
                        }
                    }
                    if (/^http/.test(key_uri)) {
                        await download(key_uri, this.task.videoToBeSavedDir, {
                            filename: "aes.key",
                        }).catch(console.error);
                    }
                }
                if (fs.existsSync(aes_path)) {
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
                        let cipher = crypto.createDecipheriv((segment.key.method + "-cbc").toLowerCase(), key_, iv_);
                        cipher.on('error', console.error);
                        let inputData = fs.readFileSync(filepath_dl);
                        let outputData = Buffer.concat([cipher.update(inputData), cipher.final()]);
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