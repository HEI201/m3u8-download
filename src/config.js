import path from 'node:path';

const downloadSegments = ['G:', 'videos', 'm3u8', 'weimiao'];
export const DefaultPathDownloadPath = path.join(...downloadSegments);
export const merge = true;

