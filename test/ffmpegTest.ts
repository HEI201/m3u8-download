const ffmpeg = require('fluent-ffmpeg');
const fs = require('fs')
const { Readable } = require('stream');
// const path = require('path');
// const got = require('got');
// const { default: async } = require('async');
import ffmpegPath from 'ffmpeg-static';

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
class FFmpegStreamReadable extends Readable {
    constructor(opt) {
        super(opt);
    }
    _read() { }
}
async function merge() {

    const outPathMP4 = 'D:\\Music\\m3u8_downloader\\test.mp4'
    const fileSegments = [
        'D:\\Music\\m3u8_downloader\\test\\000001.ts',
        'D:\\Music\\m3u8_downloader\\test\\000002.ts',
        'D:\\Music\\m3u8_downloader\\test\\000003.ts',
        'D:\\Music\\m3u8_downloader\\test\\000004.ts',
        'D:\\Music\\m3u8_downloader\\test\\000005.ts'
    ]
    const ffmpegInputStream = new FFmpegStreamReadable(null)
    console.log(ffmpegPath);
    console.log(ffmpegInputStream);
    new ffmpeg(ffmpegInputStream)
        .setFfmpegPath(ffmpegPath)
        .videoCodec('copy')
        .audioCodec('copy')
        .format('mp4')
        .on('error', (err) => {
            console.log(err)
        }).on('end', () => {
            console.log('end')
        }).on('progress', () => {
            console.log('progress')
        })
        .save(outPathMP4)
    // .output(outPathMP4)
    // .run()



    for (let i = 0; i < fileSegments.length; i++) {
        let percent = Math.ceil((i + 1) * 100 / fileSegments.length);
        let filePath = fileSegments[i];
        console.log(filePath)
        fs.existsSync(filePath) && ffmpegInputStream.push(fs.readFileSync(filePath));
        console.log('before while', ffmpegInputStream)
        while (ffmpegInputStream._readableState.length > 0) {
            console.log(ffmpegInputStream)
            await sleep(100);
        }
        console.log("push " + percent);
    }
    console.log("push(null) end");
    ffmpegInputStream.push(null);


}
merge()