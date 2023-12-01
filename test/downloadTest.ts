import M3u8Downloader from '../src';
import { urls } from "./urls";


(async () => {
    for (let index = 0; index < urls.length; index++) {
        const url = urls[index];
        let newTask = new M3u8Downloader({
            m3u8_url: url,
            taskName: 'taskName' + index,
            merge: false
        });
        await newTask.download();
    }
})();
