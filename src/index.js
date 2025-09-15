
import fs from 'node:fs';
import path from 'node:path';

import { execa } from 'execa';
import ffmpegStatic from 'ffmpeg-static';
import ky from 'ky';
import { Parser } from 'm3u8-parser';
import sanitize from 'sanitize-filename';

import { DefaultPathDownloadPath, merge } from './config.js';
import { extractHostFromUrl, formatDuration, generateM3u8, getSegmentFilename, patchHeaders, removeLastPathSegment } from "./utils/index.js";

import chalk from 'chalk';
import dayjs from 'dayjs';
import logger from './log.js';
import SegmentDownloader from "./segmentDownloader.js";

const ffmpegPath = (ffmpegStatic || '').replace(/app.asar[\/\\]{1,2}/g, '');
logger.info(`ffmpegStatic: ${ffmpegStatic}`)
logger.info(`FFmpeg path: ${ffmpegPath}`)


export default class M3u8Downloader {
  m3u8_url;
  videoFolderName = '';
  headers;
  parser = new Parser();

  constructor({
    videoName = '',
    m3u8_url = '',
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

  getVideoFilePath() {
    return path.join(
      DefaultPathDownloadPath,
      this.videoFolderName + '.mp4'
    );
  }

  async parseM3u8() {
    logger.info(`Parsing m3u8 from: ${chalk.yellow(this.m3u8_url)}`);
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
      // @ts-ignore
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
    logger.info(`The resource has been ${chalk.green('parsed')}.`)
    logger.info(`There are ${chalk.blue(count_seg)} segments, duration: ${chalk.blue(formatDuration(duration))}.`);
  }
  async run() {
    logger.info(`download running...`);
    await this.parseM3u8();
    const videoSavedPath = path.join(
      DefaultPathDownloadPath,
      this.videoFolderName
    );
    logger.info(`downloading: ${chalk.yellow(this.videoFolderName)}`);
    logger.info(`m3u8 url: ${chalk.yellow(this.m3u8_url)}`);
    logger.info(`save path: ${chalk.yellow(videoSavedPath)}`);
    // Ensure the directory exists
    if (!fs.existsSync(videoSavedPath)) {
      logger.info(`Creating directory: ${chalk.yellow(videoSavedPath)}`);
      fs.mkdirSync(videoSavedPath, { recursive: true });
    }
    let segments = this.parser.manifest.segments;
    for (let i = 0; i < segments.length; i++) {
      logger.info(`Downloading segment ${chalk.yellow(i + 1)} of ${chalk.yellow(segments.length)}...`);
      const segmentDownloadWorker = new SegmentDownloader({
        idx: i,
        segment: segments[i],
        m3u8_url: this.m3u8_url,
        videoSavedPath,
        headers: this.headers,
      });
      await segmentDownloadWorker.run()
    }
    logger.info(`segments ${chalk.green('downloaded')}`);

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
    let outPathMP4_ = this.getVideoFilePath();
    if (!fs.existsSync(ffmpegPath)) {
      return;
    }
    // Create a file list for ffmpeg concat demuxer
    const concatListPath = path.join(videoSavedPath, 'concat_list.txt');
    const concatListContent = fileSegments.map(seg => `file '${seg.replace(/'/g, "'\\''")}'`).join('\n');
    fs.writeFileSync(concatListPath, concatListContent);

    // Use execa to run ffmpeg
    logger.info('Merging segments into a single MP4 file...');
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
      logger.error('ffmpeg merge error:', e);
    }
  }
}
