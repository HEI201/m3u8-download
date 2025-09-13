import M3u8Downloader from '../src/index.js';
import { urls } from "./urls.js";


(async () => {
    for (let index = 0; index < urls.length; index++) {
        const url = urls[index];
        let newTask = new M3u8Downloader({
            m3u8_url: url,
            videoName: 'taskName' + index,
        });
        await newTask.run();
    }
})();
