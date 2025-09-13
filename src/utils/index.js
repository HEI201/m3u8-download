// @ts-nocheck

import dayjs from 'dayjs';
import duration from 'dayjs/plugin/duration.js';
import path from 'node:path';

dayjs.extend(duration);

export const formatDuration = (seconds) => {
  return dayjs.duration(seconds, 'seconds').format('HH:mm:ss');
};

export const sleep = (ms) => {
  return new Promise(resolve => setTimeout(resolve, ms));
};

export const extractHostFromUrl = (url) => {
  let matches = url.match(/^https?:\/\/[^/]*/);
  if (matches && matches.length >= 1) {
    return matches[0];
  }
  return '';
};
/**
 * Removes the last path segment (and query) from a URL string, keeping the trailing slash.
 */
export function removeLastPathSegment(url) {
  return url.replace(/\/[^\/]*((\?.*)|$)/, '/');
}
export const patchHeaders = (url) => {
  let _headers = {
    'user-agent': 'Mozilla/5.0 (Windows NT 6.1; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/83.0.4103.61 Safari/537.36Transmission/2.94'
  };

  let _hosts = extractHostFromUrl(url);
  _headers['Origin'] = _hosts;
  _headers['Referer'] = _hosts;
  return _headers;
};

export const getSegmentFilename = (idx) => {
  return `${(idx + '').padStart(6, '0')}.ts`;
};

export const generateM3u8 = (videoFolderName, parser) => {
  const segments = parser.manifest.segments;
  let m3u8 = '';
  m3u8 += '#EXTM3U\n';
  m3u8 += '#EXT-X-VERSION:3\n';
  m3u8 += '#EXT-X-TARGETDURATION:' + segments[0]?.duration + '\n';
  m3u8 += '#EXT-X-MEDIA-SEQUENCE:0\n';
  segments.forEach((segment, index) => {
    m3u8 += '#EXTINF:' + segment.duration + ',\n';
    m3u8 += path.join(
      videoFolderName,
      getSegmentFilename(index)
    ) + '\n';
  });
  m3u8 += '#EXT-X-ENDLIST\n';
  return m3u8;
}