
import fs from 'node:fs';
import path from 'node:path';

import { execa } from 'execa';
import ffmpegStatic from 'ffmpeg-static';
import ky from 'ky';
import { Parser } from 'm3u8-parser';
import sanitize from 'sanitize-filename';

import { DefaultPathDownloadPath, merge } from './config.js';
import { extractHostFromUrl, formatDuration, generateM3u8, getSegmentFilename, patchHeaders, removeLastPathSegment } from "./utils/index.js";

import dayjs from 'dayjs';
import SegmentDownloader from "./segmentDownloader.js";

const ffmpegPath = ffmpegStatic.replace(/app.asar[\/\\]{1,2}/g, '');


export default class M3u8Downloader {
  m3u8_url;
  videoFolderName = '';
  headers;
  parser;

  constructor({
    videoName = '',
    m3u8_url,
  }) {
    if (!m3u8_url) {
      throw new Error('请输入正确的M3U8-URL');
    }
    if (!videoName) {
      videoName = dayjs().format('YYYYMMDD_HHmmss');
    }
    this.m3u8_url = m3u8_url;
    this.headers = patchHeaders(m3u8_url);
    this.videoFolderName = sanitize(videoName);
  }

  async parseM3u8() {
    let hlsSrc = this.m3u8_url;
    let parser = new Parser();
    for (let retryIndex = 0; retryIndex < 3; retryIndex++) {
      const response = await ky(hlsSrc, {
        headers: this.headers,
        timeout: 30000,
      }).text();
      if (!response) {
        continue;
      }
      parser.push(response);
      parser.end();
      if (
        parser.manifest.segments.length > 0 &&
        !parser.manifest?.playlists?.length
      ) {
        break;
      }

      // handle master playlist and resolve to first variant playlist
      // get the uri of the first playlist
      // and resolve it to absolute url
      // then re-parse the playlist
      // until we get the segments
      // or we reach the retry limit
      // then we give up
      const uri = parser.manifest.playlists?.[0]?.uri || '';
      if (!uri.startsWith('http')) {
        if (uri[0] === '/') {
          hlsSrc = extractHostFromUrl(hlsSrc) + uri;
        } else {
          hlsSrc = removeLastPathSegment(hlsSrc) + uri;
        }
      } else {
        hlsSrc = uri;
      }
      this.m3u8_url = hlsSrc;
      parser = new Parser();
    }
    this.parser = parser;
    const count_seg = parser.manifest.segments.length;
    if (count_seg == 0 || !parser.manifest.endList) {
      return;
    }
    const duration = parser
      .manifest
      .segments
      .reduce((acc, segment) => {
        acc += segment.duration;
        return acc;
      }, 0);
    console.log(`The resource has been parsed.`)
    console.log(`There are ${count_seg} segments, duration: ${formatDuration(duration)}.`);
  }
  async run() {
    await this.parseM3u8();
    const videoSavedPath = path.join(
      DefaultPathDownloadPath,
      this.videoFolderName
    );

    // Ensure the directory exists
    if (!fs.existsSync(videoSavedPath)) {
      fs.mkdirSync(videoSavedPath, { recursive: true });
    }

    if (!fs.existsSync(videoSavedPath)) {
      fs.mkdirSync(videoSavedPath, { recursive: true })
    };
    let segments = this.parser.manifest.segments;
    const promises = [];
    for (let i = 0; i < segments.length; i++) {
      const segmentDownloadWorker = new SegmentDownloader({
        idx: i,
        segment: segments[i],
        m3u8_url: this.m3u8_url,
        videoSavedPath,
        headers: this.headers,
      });
      promises.push(segmentDownloadWorker.run());
    }
    await Promise.all(promises);
    console.log('segments downloaded');

    const m3u8 = generateM3u8(this.videoFolderName, this.parser);
    const m3u8Path = path.join(videoSavedPath, 'index.m3u8');
    fs.writeFileSync(m3u8Path, m3u8);
    if (!merge) {
      return;
    }
    let fileSegments = [];
    for (let i = 0; i < segments.length; i++) {
      let filepath = path.join(
        videoSavedPath,
        getSegmentFilename(i)
      );
      if (fs.existsSync(filepath)) {
        fileSegments.push(filepath);
      }
    }
    if (!fileSegments.length) {
      return;
    }
    let outPathMP4 = path.join(videoSavedPath, Date.now() + ".mp4");
    let outPathMP4_ = path.join(
      DefaultPathDownloadPath,
      this.videoFolderName + '.mp4'
    );
    if (!fs.existsSync(ffmpegPath)) {
      return;
    }
    // Create a file list for ffmpeg concat demuxer
    const concatListPath = path.join(videoSavedPath, 'concat_list.txt');
    const concatListContent = fileSegments.map(seg => `file '${seg.replace(/'/g, "'\\''")}'`).join('\n');
    fs.writeFileSync(concatListPath, concatListContent);

    // Use execa to run ffmpeg
    try {
      await execa(
        ffmpegPath,
        [
          '-f', 'concat',
          '-safe', '0',
          '-i', concatListPath,
          '-c', 'copy',
          outPathMP4
        ],
        { stdio: 'inherit' }
      );
      if (fs.existsSync(outPathMP4)) {
        fs.renameSync(outPathMP4, outPathMP4_);
      }
    } catch (e) {
      console.log('ffmpeg merge error:', e);
    }
  }
}
