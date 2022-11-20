"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const stream_1 = require("stream");
class FFmpegStreamReadable extends stream_1.Readable {
    constructor(opt) {
        super(opt);
    }
    _read() { }
}
exports.default = FFmpegStreamReadable;
