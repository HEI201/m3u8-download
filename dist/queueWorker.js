"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const download_1 = __importDefault(require("download"));
const crypto_1 = __importDefault(require("crypto"));
class QueueWorker {
    constructor({ segment = null, idx = 0, task }) {
        this.segment = segment;
        this.task = task;
        this.idx = idx;
    }
    async downloadSeg() {
        let partent_uri = this.task.url.replace(/([^\/]*\?.*$)|([^\/]*$)/g, '');
        let segment = this.segment;
        let uri_ts = '';
        if (/^http.*/.test(segment.uri)) {
            uri_ts = segment.uri;
        }
        else if (/^http/.test(this.task.url) && /^\/.*/.test(segment.uri)) {
            let mes = this.task.url.match(/^https?:\/\/[^/]*/);
            if (mes && mes.length >= 1) {
                uri_ts = mes[0] + segment.uri;
            }
            else {
                uri_ts = partent_uri + (partent_uri.endsWith('/') || segment.uri.startWith('/') ? '' : "/") + segment.uri;
            }
        }
        else if (/^http.*/.test(this.task.url)) {
            uri_ts = partent_uri + (partent_uri.endsWith('/') || segment.uri.startWith('/') ? '' : "/") + segment.uri;
        }
        else if (/^file:\/\/\//.test(this.task.url)) {
            let fileDir = this.task.url.replace('file:///', '').replace(/[^\\/]{1,}$/, '');
            uri_ts = path_1.default.join(fileDir, segment.uri);
            if (!fs_1.default.existsSync(uri_ts)) {
                const me = segment.uri.match(/[^\\\/\?]{1,}\?|$/i);
                if (me && me.length > 1) {
                    uri_ts = path_1.default.join(fileDir, me[0].replace(/\?$/, ''));
                }
                if (!fs_1.default.existsSync(uri_ts)) {
                    throw new Error('文件不存在');
                }
            }
            uri_ts = "file:///" + uri_ts;
        }
        let filename = `${((this.idx + 1) + '').padStart(6, '0')}.ts`;
        let filepath = path_1.default.join(this.task.videoToBeSavedDir, filename);
        let filepath_dl = path_1.default.join(this.task.videoToBeSavedDir, filename + ".dl");
        //检测文件是否存在
        for (let index = 0; index < 3 && !fs_1.default.existsSync(filepath); index++) {
            // 下载的时候使用.dl后缀的文件名，下载完成后重命名
            if (/^file:\/\/\//.test(uri_ts)) {
                fs_1.default.copyFileSync(uri_ts.replace(/^file:\/\/\//, ''), filepath_dl);
            }
            else {
                await (0, download_1.default)(uri_ts, this.task.videoToBeSavedDir, {
                    filename: filename + ".dl",
                    // @ts-ignore
                    headers: this.task.headers
                }).catch((e) => {
                    fs_1.default.existsSync(filepath_dl) && fs_1.default.unlinkSync(filepath_dl);
                });
            }
            if (!fs_1.default.existsSync(filepath_dl))
                continue;
            fs_1.default.statSync(filepath_dl).size <= 0 && fs_1.default.unlinkSync(filepath_dl);
            if (segment.key != null && segment.key.method != null) {
                //标准解密TS流
                let aes_path = path_1.default.join(this.task.videoToBeSavedDir, "aes.key");
                if (!fs_1.default.existsSync(aes_path)) {
                    let key_uri = segment.key.uri;
                    if (/^http/.test(this.task.url) && !/^http.*/.test(key_uri) && !/^\/.*/.test(key_uri)) {
                        key_uri = partent_uri + key_uri;
                    }
                    else if (/^http/.test(this.task.url) && /^\/.*/.test(key_uri)) {
                        let mes = this.task.url.match(/^https?:\/\/[^/]*/);
                        if (mes && mes.length >= 1) {
                            key_uri = mes[0] + key_uri;
                        }
                        else {
                            key_uri = partent_uri + key_uri;
                        }
                    }
                    else if (/^file:\/\/\//.test(this.task.url) && !/^http.*/.test(key_uri)) {
                        let fileDir = this.task.url.replace('file:///', '').replace(/[^\\/]{1,}$/, '');
                        let key_uri_ = path_1.default.join(fileDir, key_uri);
                        if (!fs_1.default.existsSync(key_uri_)) {
                            const me = key_uri.match(/([^\\\/\?]{1,})(\?|$)/i);
                            if (me && me.length > 1) {
                                key_uri_ = path_1.default.join(fileDir, me[1]);
                            }
                            if (!fs_1.default.existsSync(key_uri_)) {
                                throw new Error('文件不存在');
                            }
                        }
                        key_uri = "file:///" + key_uri_;
                    }
                    if (/^http/.test(key_uri)) {
                        await (0, download_1.default)(key_uri, this.task.videoToBeSavedDir, {
                            filename: "aes.key",
                        }).catch(console.error);
                    }
                    else if (/^file:\/\/\//.test(key_uri)) {
                        key_uri = key_uri.replace('file:///', '');
                        if (fs_1.default.existsSync(key_uri)) {
                            fs_1.default.copyFileSync(key_uri, aes_path);
                        }
                        else {
                            throw new Error('文件不存在');
                        }
                    }
                }
                if (fs_1.default.existsSync(aes_path)) {
                    try {
                        let key_ = null;
                        let iv_ = null;
                        key_ = fs_1.default.readFileSync(aes_path);
                        if (key_.length == 32) {
                            key_ = Buffer.from(fs_1.default.readFileSync(aes_path, {
                                encoding: 'utf8'
                            }), 'hex');
                        }
                        iv_ = segment.key.iv != null ? Buffer.from(segment.key.iv.buffer) :
                            Buffer.from(this.idx.toString(16).padStart(32, '0'), 'hex');
                        let cipher = crypto_1.default.createDecipheriv((segment.key.method + "-cbc").toLowerCase(), key_, iv_);
                        cipher.on('error', console.error);
                        let inputData = fs_1.default.readFileSync(filepath_dl);
                        let outputData = Buffer.concat([cipher.update(inputData), cipher.final()]);
                        fs_1.default.writeFileSync(filepath, outputData);
                        if (fs_1.default.existsSync(filepath_dl))
                            fs_1.default.unlinkSync(filepath_dl);
                    }
                    catch (error) {
                        if (fs_1.default.existsSync(filepath_dl))
                            fs_1.default.unlinkSync(filepath_dl);
                    }
                    return;
                }
            }
            else {
                fs_1.default.renameSync(filepath_dl, filepath);
                break;
            }
        }
        if (!fs_1.default.existsSync(filepath)) {
            throw new Error('文件不存在');
        }
    }
}
exports.default = QueueWorker;
