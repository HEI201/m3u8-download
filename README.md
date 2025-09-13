# example

```js
;(async () => {
  import M3u8Downloader from 'm3u8-downloader-sync'
  const newTask = new M3u8Downloader({
    m3u8_url: 'm3u8_url like https://xxx.com/xxx.m3u8**',
    taskName: 'the name to save the file',
  })
  await newTask.run() // optional await
})()
```

> todo

- download live stream m3u8

This project derived from `https://github.com/HeiSir2014/M3U8-Downloader`
