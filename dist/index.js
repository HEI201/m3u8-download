"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const ffmpeg_static_1 = __importDefault(require("ffmpeg-static"));
const fluent_ffmpeg_1 = __importDefault(require("fluent-ffmpeg"));
const got_1 = __importDefault(require("got"));
const m3u8_parser_1 = require("m3u8-parser");
const config_1 = require("./config");
const utils_1 = require("./utils");
const sanitize_filename_1 = __importDefault(require("sanitize-filename"));
const fFmpegStreamReadable_1 = __importDefault(require("./fFmpegStreamReadable"));
const segmentDownloader_1 = __importDefault(require("./segmentDownloader"));
const ffmpegPath = ffmpeg_static_1.default.replace(/app.asar[\/\\]{1,2}/g, '');
class M3u8Downloader {
    constructor({ taskName = '', m3u8_url, savedPath = config_1.DefaultPathDownloadPath, merge = true, }) {
        this.savedPath = '';
        this.merge = true;
        this.videoSavedPath = '';
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
        this.headers = (0, utils_1.patchHeaders)(this.m3u8_url);
    }
    async parseM3u8() {
        var _a, _b;
        let hlsSrc = this.m3u8_url;
        let parser = new m3u8_parser_1.Parser();
        for (let index = 0; index < 3; index++) {
            const response = await (0, got_1.default)(hlsSrc, {
                headers: this.headers,
                timeout: config_1.HttpTimeout,
            });
            if (!(response === null || response === void 0 ? void 0 : response.body)) {
                continue;
            }
            parser.push(response.body);
            parser.end();
            // if it is not the master playlist, then it is the media playlist
            if (parser.manifest.segments.length > 0 &&
                ((_b = (_a = parser.manifest) === null || _a === void 0 ? void 0 : _a.playlists) === null || _b === void 0 ? void 0 : _b.length) == 0) {
                break;
            }
            // master playlist case, get the first media playlist, continue to parse
            // fixme: this can be optimized to get the best quality
            const uri = parser.manifest.playlists[0].uri;
            if (!uri.startsWith('http')) {
                hlsSrc = uri[0] == '/' ?
                    (hlsSrc.substr(0, hlsSrc.indexOf('/', 10)) + uri) :
                    (hlsSrc.replace(/\/[^\/]*((\?.*)|$)/, '/') + uri);
            }
            else {
                hlsSrc = uri;
            }
            this.m3u8_url = hlsSrc;
            parser = new m3u8_parser_1.Parser();
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
            .forEach((segment) => {
            duration += segment.duration;
        });
        const msg = `
        The resource has been parsed. There are ${count_seg} segments. 
        duration: ${(0, utils_1.formatDuration)(duration)}. 
        start caching ...
        `;
        console.log(msg);
    }
    async download() {
        await this.parseM3u8();
        this.videoSavedPath = path_1.default.join(this.savedPath, (0, sanitize_filename_1.default)(this.taskName));
        !fs_1.default.existsSync(this.videoSavedPath) && fs_1.default.mkdirSync(this.videoSavedPath, { recursive: true });
        let segments = this.parser.manifest.segments;
        const promises = [];
        for (let i = 0; i < segments.length; i++) {
            const segmentDownloadWorker = new segmentDownloader_1.default({
                idx: i,
                segment: segments[i],
                m3u8_url: this.m3u8_url,
                videoSavedPath: this.videoSavedPath,
                headers: this.headers,
            });
            promises.push(segmentDownloadWorker.download());
        }
        await Promise.all(promises);
        if (!this.merge) {
            return;
        }
        // download done, starting to merge ts files
        let fileSegments = [];
        for (let i = 0; i < segments.length; i++) {
            let filepath = path_1.default.join(this.videoSavedPath, `${((i + 1) + '').padStart(6, '0')}.ts`);
            if (fs_1.default.existsSync(filepath)) {
                fileSegments.push(filepath);
            }
        }
        if (!fileSegments.length) {
            // download failed, please check the validity of the link
            return;
        }
        let outPathMP4 = path_1.default.join(this.videoSavedPath, Date.now() + ".mp4");
        let outPathMP4_ = path_1.default.join(this.savedPath, (0, sanitize_filename_1.default)(this.taskName) + '.mp4');
        if (!fs_1.default.existsSync(ffmpegPath)) {
            return;
        }
        let ffmpegInputStream = new fFmpegStreamReadable_1.default(null);
        (0, fluent_ffmpeg_1.default)(ffmpegInputStream)
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
            fs_1.default.existsSync(outPathMP4) && (fs_1.default.renameSync(outPathMP4, outPathMP4_));
        });
        for (let i = 0; i < fileSegments.length; i++) {
            let percent = Math.ceil((i + 1) * 100 / fileSegments.length);
            console.log(`merging ... [${percent}%]`);
            let filePath = fileSegments[i];
            fs_1.default.existsSync(filePath) && ffmpegInputStream.push(fs_1.default.readFileSync(filePath));
            // @ts-ignore
            while (ffmpegInputStream._readableState.length > 0) {
                await (0, utils_1.sleep)(100);
            }
        }
        ffmpegInputStream.push(null);
    }
}
exports.default = M3u8Downloader;
