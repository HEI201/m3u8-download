import type { Headers } from 'got';
export declare const formatDuration: (duration: number) => string;
export declare const sleep: (ms: number) => Promise<unknown>;
export declare const patchHeaders: (url: string) => Headers;
