/// <reference types="node" />
import { Readable, ReadableOptions } from "stream";
export default class FFmpegStreamReadable extends Readable {
    constructor(opt: ReadableOptions);
    _read(): void;
}
