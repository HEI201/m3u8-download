import Task from '../src'


(async () => {
    const list = [
        ''
    ]
    for (let index = 0; index < list.length; index++) {
        const url = list[index];
        let newTask = new Task({
            m3u8_url: url,
            taskName: 'taskName' + index,
            pathDownloadDir: "D:\\Music\\m3u8_downloader",
        })
        await newTask.parseM3u8()
        await newTask.startDownload()
    }
})()
