"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const crypto_1 = __importDefault(require("crypto"));
const download_1 = __importDefault(require("download"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const utils_1 = require("./utils");
const aes_file_name = 'aes.key';
class SegmentDownloader {
    constructor({ segment = null, idx = 0, m3u8_url, videoSavedPath, headers, }) {
        this.segment = segment;
        this.idx = idx;
        this.m3u8_url = m3u8_url;
        this.videoSavedPath = videoSavedPath;
        this.headers = headers;
    }
    getParentUri() {
        const partent_uri = this.m3u8_url.replace(/([^\/]*\?.*$)|([^\/]*$)/g, '');
        return partent_uri;
    }
    getTsUrl(segment_uri) {
        const partent_uri = this.getParentUri();
        let ts_url = '';
        if (/^http.*/.test(segment_uri)) {
            ts_url = segment_uri;
        }
        else if (/^http/.test(this.m3u8_url) && /^\/.*/.test(segment_uri)) {
            const mes = this.m3u8_url.match(/^https?:\/\/[^/]*/);
            if (mes && mes.length >= 1) {
                ts_url = mes[0] + segment_uri;
            }
            else {
                ts_url = partent_uri + (partent_uri.endsWith('/') || segment_uri.startsWith('/') ? '' : "/") + segment_uri;
            }
        }
        else if (/^http.*/.test(this.m3u8_url)) {
            ts_url = partent_uri + (partent_uri.endsWith('/') || segment_uri.startsWith('/') ? '' : "/") + segment_uri;
        }
        return ts_url;
    }
    getKeyUrl(key_uri) {
        const partent_uri = this.getParentUri();
        let key_url = key_uri;
        if (/^http/.test(this.m3u8_url) &&
            !/^http.*/.test(key_uri) &&
            !/^\/.*/.test(key_uri)) {
            key_url = partent_uri + key_uri;
        }
        else if (/^http/.test(this.m3u8_url) &&
            /^\/.*/.test(key_uri)) {
            const mes = this.m3u8_url.match(/^https?:\/\/[^/]*/);
            if (mes && mes.length >= 1) {
                key_url = mes[0] + key_uri;
            }
            else {
                key_url = partent_uri + key_uri;
            }
        }
        return key_url;
    }
    async download() {
        var _a;
        const segment = this.segment;
        const ts_url = this.getTsUrl(segment.uri);
        const filename = (0, utils_1.getSegmentFilename)(this.idx);
        const filename_dl = filename + '.dl';
        const filepath = path_1.default.join(this.videoSavedPath, filename);
        const filepath_dl = path_1.default.join(this.videoSavedPath, filename_dl);
        for (let index = 0; index < 3 && !fs_1.default.existsSync(filepath); index++) {
            // use .dl suffix to download, rename it after downloaded
            try {
                await (0, download_1.default)(ts_url, this.videoSavedPath, {
                    filename: filename_dl,
                    // @ts-ignore
                    headers: this.headers
                });
            }
            catch (error) {
                console.log('Something went wrong while downloading segment', error);
                if (fs_1.default.existsSync(filepath_dl)) {
                    fs_1.default.unlinkSync(filepath_dl);
                }
            }
            if (!fs_1.default.existsSync(filepath_dl))
                continue;
            fs_1.default.statSync(filepath_dl).size <= 0 && fs_1.default.unlinkSync(filepath_dl);
            if (!((_a = segment.key) === null || _a === void 0 ? void 0 : _a.method)) {
                fs_1.default.renameSync(filepath_dl, filepath);
                break;
            }
            const aes_path = path_1.default.join(this.videoSavedPath, aes_file_name);
            if (!fs_1.default.existsSync(aes_path)) {
                const key_url = this.getKeyUrl(segment.key.uri);
                if (/^http/.test(key_url)) {
                    try {
                        await (0, download_1.default)(key_url, this.videoSavedPath, {
                            filename: aes_file_name,
                        });
                    }
                    catch (error) {
                        console.error(error);
                    }
                }
            }
            if (fs_1.default.existsSync(aes_path)) {
                let canReturn = true;
                // standardly decrypt ts stream
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
                    const cipher = crypto_1.default.createDecipheriv((segment.key.method + "-cbc").toLowerCase(), key_, iv_);
                    cipher.on('error', console.error);
                    const inputData = fs_1.default.readFileSync(filepath_dl);
                    const outputData = Buffer.concat([cipher.update(inputData), cipher.final()]);
                    fs_1.default.writeFileSync(filepath, outputData);
                }
                catch (error) {
                    console.error(error);
                    canReturn = false;
                }
                if (fs_1.default.existsSync(filepath_dl)) {
                    fs_1.default.unlinkSync(filepath_dl);
                }
                if (canReturn) {
                    return;
                }
            }
        }
        if (!fs_1.default.existsSync(filepath)) {
            throw new Error('file does not exist');
        }
    }
}
exports.default = SegmentDownloader;
