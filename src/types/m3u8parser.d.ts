declare module 'm3u8-parser' {
    export class Parser {
        manifest: {
            segments: [];
            playlists: { uri: string; }[];
            endList: boolean;
        };
        addParser(parser: any): void;
        push(data: any): void;
        end(): void;
    }
}