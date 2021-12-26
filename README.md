### example

```js
;(async () => {
  import Task from "m3u8-downloader-sync"
  const task = new Task({
    m3u8_url: "m3u8_url",
    taskName: "the name to save file",
    pathDownloadDir: "path to save the file",
  })
  await newTask.parseM3u8()
  await newTask.startDownload()
})()
```

This project derived from `https://github.com/HeiSir2014/M3U8-Downloader`
