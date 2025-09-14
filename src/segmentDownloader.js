// @ts-nocheck
import download from 'download';
import * as crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { extractHostFromUrl, getSegmentFilename } from "./utils/index.js";

const aes_file_name = 'aes.key';

const getParentUri = (m3u8_url = '') => {
  const partent_uri = m3u8_url.replace(/([^\/]*\?.*$)|([^\/]*$)/g, '');
  return partent_uri;
}
const getKeyUrl = (key_uri = '', m3u8_url = '') => {
  const partent_uri = getParentUri(m3u8_url);
  let key_url = key_uri;
  if (
    /^http/.test(m3u8_url) &&
    !/^http.*/.test(key_uri) &&
    !/^\/.*/.test(key_uri)
  ) {
    key_url = partent_uri + key_uri;
  } else if (
    /^http/.test(m3u8_url) &&
    /^\/.*/.test(key_uri)
  ) {
    const mes = m3u8_url.match(/^https?:\/\/[^/]*/);
    if (mes && mes.length >= 1) {
      key_url = mes[0] + key_uri;
    } else {
      key_url = partent_uri + key_uri;
    }
  }
  return key_url;
}
const getSegmentUrl = (segment_uri = '', m3u8_url = '') => {
  const partent_uri = getParentUri(m3u8_url);
  let ts_url = '';
  if (/^http.*/.test(segment_uri)) {
    ts_url = segment_uri;
  } else if (/^http/.test(m3u8_url) && /^\/.*/.test(segment_uri)) {
    const _host = extractHostFromUrl(m3u8_url);
    if (_host) {
      ts_url = _host + segment_uri;
    } else {
      ts_url = partent_uri + (partent_uri.endsWith('/') || segment_uri.startsWith('/') ? '' : "/") + segment_uri;
    }
  } else if (/^http.*/.test(m3u8_url)) {
    ts_url = partent_uri + (partent_uri.endsWith('/') || segment_uri.startsWith('/') ? '' : "/") + segment_uri;
  }
  return ts_url;
}
export default class SegmentDownloader {
  constructor({
    segment,
    idx = 0,
    m3u8_url = '',
    videoSavedPath = '',
    headers = {},
  }) {
    this.segment = segment;
    this.idx = idx;
    this.m3u8_url = m3u8_url;
    this.videoSavedPath = videoSavedPath;
    this.headers = headers;
  }
  async run() {
    const segment = this.segment;
    const ts_url = getSegmentUrl(segment.uri, this.m3u8_url);
    const filename = getSegmentFilename(this.idx);
    const filename_dl = filename + '.dl';
    const filepath = path.join(this.videoSavedPath, filename);
    const filepath_dl = path.join(this.videoSavedPath, filename_dl);
    for (
      let retryIndex = 0;
      retryIndex < 3 && !fs.existsSync(filepath);
      retryIndex++
    ) {
      try {
        await download(
          ts_url,
          this.videoSavedPath,
          {
            filename: filename_dl,
            headers: this.headers
          },
        );
      } catch (error) {
        console.log('Something went wrong while downloading segment', error);
        if (fs.existsSync(filepath_dl)) {
          fs.unlinkSync(filepath_dl);
        }
      }
      if (!fs.existsSync(filepath_dl)) continue;
      fs.statSync(filepath_dl).size <= 0 && fs.unlinkSync(filepath_dl);
      if (!segment.key?.method) {
        fs.renameSync(filepath_dl, filepath);
        break;
      }
      const aes_path = path.join(this.videoSavedPath, aes_file_name);
      if (!fs.existsSync(aes_path)) {
        const key_url = getKeyUrl(segment.key.uri, this.m3u8_url);
        if (/^http/.test(key_url)) {
          try {
            await download(
              key_url,
              this.videoSavedPath,
              {
                filename: aes_file_name,
              }
            );
          } catch (error) {
            console.error(error);
          }
        }
      }
      if (fs.existsSync(aes_path)) {
        let canReturn = true;
        try {
          let key_ = null;
          let iv_ = null;
          key_ = fs.readFileSync(aes_path);
          if (key_.length == 32) {
            key_ = Buffer.from(fs.readFileSync(aes_path, {
              encoding: 'utf8'
            }), 'hex');
          }
          if (segment.key.iv != null && (segment.key.iv).buffer) {
            iv_ = Buffer.from((segment.key.iv).buffer);
          } else {
            iv_ = Buffer.from(this.idx.toString(16).padStart(32, '0'), 'hex');
          }
          const cipher = crypto.createDecipheriv(
            (segment.key.method + "-cbc").toLowerCase(),
            key_,
            iv_
          );
          cipher.on('error', console.error);
          const inputData = fs.readFileSync(filepath_dl);
          const outputData = Buffer.concat([cipher.update(inputData), cipher.final()]);
          fs.writeFileSync(filepath, outputData);
        } catch (error) {
          console.error(error);
          canReturn = false;
        }
        if (fs.existsSync(filepath_dl)) {
          fs.unlinkSync(filepath_dl);
        }
        if (canReturn) {
          return;
        }
      }
    }
    if (!fs.existsSync(filepath)) {
      throw new Error('file does not exist');
    }
  }
}
