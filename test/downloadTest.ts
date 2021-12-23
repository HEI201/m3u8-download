import Downloader from '../src/index'


(async () => {
    let url = 'https://fangdaoproduct.yaocaiwuziyou.com/dd384d6c3a464780aea037e2fc4e08b3/f8646767466bd3db387b771ad97cf903-sd-encrypt-stream.m3u8?auth_key=1636642538-e823ef2e8016422185777252e1abf79f-0-56f1b4e3b3d6dac0b6bee1abb8a74059'
    let newTask = new Downloader({
        m3u8_url: url,
        taskName: 'taskName',
        pathDownloadDir: "D:\\Music\\m3u8_downloader",
    })
    await newTask.addTask()
    await newTask.startDownload(newTask.downloadTask, undefined)
})()
