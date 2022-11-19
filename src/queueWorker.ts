import path from 'path';
import fs from 'fs';
import download from "download";
import crypto from 'crypto';
import Task from './index';

export default class QueueWorker {
    idx: number;
    segment: any;
    task: Task;
    catch: () => void;
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
        let partent_uri = this.task.url.replace(/([^\/]*\?.*$)|([^\/]*$)/g, '');
        let segment = this.segment;
        let uri_ts = '';
        if (/^http.*/.test(segment.uri)) {
            uri_ts = segment.uri;
        } else if (/^http/.test(this.task.url) && /^\/.*/.test(segment.uri)) {
            let mes = this.task.url.match(/^https?:\/\/[^/]*/);
            if (mes && mes.length >= 1) {
                uri_ts = mes[0] + segment.uri;
            } else {
                uri_ts = partent_uri + (partent_uri.endsWith('/') || segment.uri.startWith('/') ? '' : "/") + segment.uri;
            }
        } else if (/^http.*/.test(this.task.url)) {
            uri_ts = partent_uri + (partent_uri.endsWith('/') || segment.uri.startWith('/') ? '' : "/") + segment.uri;
        } else if (/^file:\/\/\//.test(this.task.url)) {
            let fileDir = this.task.url.replace('file:///', '').replace(/[^\\/]{1,}$/, '');
            uri_ts = path.join(fileDir, segment.uri);
            if (!fs.existsSync(uri_ts)) {
                const me = segment.uri.match(/[^\\\/\?]{1,}\?|$/i);
                if (me && me.length > 1) {
                    uri_ts = path.join(fileDir, me[0].replace(/\?$/, ''));
                }
                if (!fs.existsSync(uri_ts)) {
                    throw new Error('文件不存在');
                }
            }
            uri_ts = "file:///" + uri_ts;
        }
        let filename = `${((this.idx + 1) + '').padStart(6, '0')}.ts`;
        let filepath = path.join(this.task.videoToBeSavedDir, filename);
        let filepath_dl = path.join(this.task.videoToBeSavedDir, filename + ".dl");
        //检测文件是否存在
        for (let index = 0; index < 3 && !fs.existsSync(filepath); index++) {
            // 下载的时候使用.dl后缀的文件名，下载完成后重命名
            if (/^file:\/\/\//.test(uri_ts)) {
                fs.copyFileSync(uri_ts.replace(/^file:\/\/\//, ''), filepath_dl);
            } else {
                await download(
                    uri_ts,
                    this.task.videoToBeSavedDir,
                    {
                        filename: filename + ".dl",
                        // @ts-ignore
                        headers: this.task.headers
                    },
                ).catch((e) => {
                    fs.existsSync(filepath_dl) && fs.unlinkSync(filepath_dl);
                });
            }
            if (!fs.existsSync(filepath_dl)) continue;
            fs.statSync(filepath_dl).size <= 0 && fs.unlinkSync(filepath_dl);
            if (segment.key != null && segment.key.method != null) {
                //标准解密TS流
                let aes_path = path.join(this.task.videoToBeSavedDir, "aes.key");
                if (!fs.existsSync(aes_path)) {
                    let key_uri = segment.key.uri;
                    if (/^http/.test(this.task.url) && !/^http.*/.test(key_uri) && !/^\/.*/.test(key_uri)) {
                        key_uri = partent_uri + key_uri;
                    } else if (/^http/.test(this.task.url) && /^\/.*/.test(key_uri)) {
                        let mes = this.task.url.match(/^https?:\/\/[^/]*/);
                        if (mes && mes.length >= 1) {
                            key_uri = mes[0] + key_uri;
                        } else {
                            key_uri = partent_uri + key_uri;
                        }
                    } else if (/^file:\/\/\//.test(this.task.url) && !/^http.*/.test(key_uri)) {
                        let fileDir = this.task.url.replace('file:///', '').replace(/[^\\/]{1,}$/, '');
                        let key_uri_ = path.join(fileDir, key_uri);
                        if (!fs.existsSync(key_uri_)) {
                            const me = key_uri.match(/([^\\\/\?]{1,})(\?|$)/i);
                            if (me && me.length > 1) {
                                key_uri_ = path.join(fileDir, me[1]);
                            }
                            if (!fs.existsSync(key_uri_)) {
                                throw new Error('文件不存在');
                            }
                        }
                        key_uri = "file:///" + key_uri_;
                    }
                    if (/^http/.test(key_uri)) {
                        await download(key_uri, this.task.videoToBeSavedDir, {
                            filename: "aes.key",
                        }).catch(console.error);
                    } else if (/^file:\/\/\//.test(key_uri)) {
                        key_uri = key_uri.replace('file:///', '');
                        if (fs.existsSync(key_uri)) {
                            fs.copyFileSync(key_uri, aes_path);
                        } else {
                            throw new Error('文件不存在');
                        }
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
            throw new Error('文件不存在');
        }
    }
}