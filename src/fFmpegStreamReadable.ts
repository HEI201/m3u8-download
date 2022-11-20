import { Readable, ReadableOptions } from "stream";

export default class FFmpegStreamReadable extends Readable {
    constructor(opt: ReadableOptions) {
        super(opt);
    }
    _read() { }
}