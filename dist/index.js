"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const stream_1 = require("stream");
const got_1 = __importDefault(require("got"));
const fluent_ffmpeg_1 = __importDefault(require("fluent-ffmpeg"));
const ffmpeg_static_1 = __importDefault(require("ffmpeg-static"));
const m3u8_parser_1 = require("m3u8-parser");
const queueWorker_1 = __importDefault(require("./queueWorker"));
const config_1 = require("./config");
const ffmpegPath = ffmpeg_static_1.default.replace(/app.asar[\/\\]{1,2}/g, '');
const formatDuration = (duration) => {
    let sec = Math.floor(duration % 60).toLocaleString();
    let min = Math.floor(duration / 60 % 60).toLocaleString();
    let hour = Math.floor(duration / 3600 % 60).toLocaleString();
    if (sec.length != 2)
        sec = '0' + sec;
    if (min.length != 2)
        min = '0' + min;
    if (hour.length != 2)
        hour = '0' + hour;
    return hour + ":" + min + ":" + sec;
};
const sleep = (ms) => {
    return new Promise(resolve => setTimeout(resolve, ms));
};
const httpTimeout = {
    socket: 30000,
    request: 30000,
    response: 60000
};
class FFmpegStreamReadable extends stream_1.Readable {
    constructor(opt) {
        super(opt);
    }
    _read() { }
}
const patchHeaders = (url) => {
    let _headers = {};
    const headersString = 'user-agent: Mozilla/5.0 (Windows NT 6.1; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/83.0.4103.61 Safari/537.36Transmission/2.94';
    if (headersString) {
        let __ = headersString.match(/(.*?): ?(.*?)(\n|\r|$)/g);
        __ && __.forEach((_) => {
            let ___ = _.match(/(.*?): ?(.*?)(\n|\r|$)/i);
            ___ && (_headers[___[1]] = ___[2]);
        });
    }
    let mes = url.match(/^https?:\/\/[^/]*/);
    let _hosts = '';
    if (mes && mes.length >= 1) {
        _hosts = mes[0];
        if (_headers['Origin'] == null && _headers['origin'] == null) {
            _headers['Origin'] = _hosts;
        }
        if (_headers['Referer'] == null && _headers['referer'] == null) {
            _headers['Referer'] = _hosts;
        }
    }
    return _headers;
};
class Task {
    constructor({ taskName = '', m3u8_url = '', pathDownloadDir = config_1.defaultPathDownloadDir, }) {
        this.videoToBeSavedDir = '';
        this.pathDownloadDir = '';
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
        var _a, _b;
        let hlsSrc = this.m3u8_url;
        let parser = new m3u8_parser_1.Parser();
        for (let index = 0; index < 3; index++) {
            let response = await (0, got_1.default)(hlsSrc, {
                headers: this.headers,
                timeout: httpTimeout,
            });
            if (response === null || response === void 0 ? void 0 : response.body) {
                parser.push(response.body);
                parser.end();
                if (parser.manifest.segments.length == 0 &&
                    ((_b = (_a = parser.manifest) === null || _a === void 0 ? void 0 : _a.playlists) === null || _b === void 0 ? void 0 : _b.length) >= 1) {
                    let uri = parser.manifest.playlists[0].uri;
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
                parser.manifest.segments.forEach((segment) => {
                    duration += segment.duration;
                });
                const msg = `The resource has been parsed. There are ${count_seg} segments. duration: ${formatDuration(duration)}, start caching ...`;
                console.log(msg);
            }
        }
    }
    async download() {
        await this.parseM3u8();
        this.videoToBeSavedDir = path_1.default.join(this.pathDownloadDir, this.taskName.replace(/["“”，\.。\|\/\\ \*:;\?<>]/g, ""));
        !fs_1.default.existsSync(this.videoToBeSavedDir) && fs_1.default.mkdirSync(this.videoToBeSavedDir, { recursive: true });
        let segments = this.parser.manifest.segments;
        const promises = [];
        for (let iSeg = 0; iSeg < segments.length; iSeg++) {
            const segmentDownloadQueueWorker = new queueWorker_1.default({
                idx: iSeg,
                segment: segments[iSeg],
                task: this,
            });
            promises.push(segmentDownloadQueueWorker.downloadSegment());
        }
        await Promise.all(promises);
        // download done, starting to merge ts files
        let fileSegments = [];
        for (let iSeg = 0; iSeg < segments.length; iSeg++) {
            let filepath = path_1.default.join(this.videoToBeSavedDir, `${((iSeg + 1) + '').padStart(6, '0')}.ts`);
            if (fs_1.default.existsSync(filepath)) {
                fileSegments.push(filepath);
            }
        }
        if (!fileSegments.length) {
            // download failed, please check the validity of the link
            return;
        }
        let outPathMP4 = path_1.default.join(this.videoToBeSavedDir, Date.now() + ".mp4");
        let outPathMP4_ = path_1.default.join(this.pathDownloadDir, this.taskName.replace(/["“”，\.。\|\/\\ \*:;\?<>]/g, "") + '.mp4');
        if (fs_1.default.existsSync(ffmpegPath)) {
            let ffmpegInputStream = new FFmpegStreamReadable(null);
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
                // merge done          
            });
            for (let i = 0; i < fileSegments.length; i++) {
                let percent = Math.ceil((i + 1) * 100 / fileSegments.length);
                console.log(`merging ... [${percent}%]`);
                let filePath = fileSegments[i];
                fs_1.default.existsSync(filePath) && ffmpegInputStream.push(fs_1.default.readFileSync(filePath));
                // @ts-ignore
                while (ffmpegInputStream._readableState.length > 0) {
                    await sleep(100);
                }
            }
            ffmpegInputStream.push(null);
        }
        else {
            // download done, no local FFMPEG found, do not merge
        }
    }
}
exports.default = Task;
