import { Readable } from "stream";

export default class FFmpegStreamReadable extends Readable {
    constructor(opt) {
        super(opt);
    }
    _read() { }
}