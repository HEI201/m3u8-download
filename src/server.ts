const crypto = require('crypto');
const winston = require('winston');
const download = require('download');
const {
  spawn
} = require('child_process');
const {
  Readable
} = require('stream');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static').replace(/app.asar[\/\\]{1,2}/g, '');
const dateFormat = require('dateformat');
const {
  Parser
} = require('m3u8-parser');
const path = require('path');
const async = require('async');
const fs = require('fs');
const got = require('got');
const {
  HttpProxyAgent,
  HttpsProxyAgent
} = require('hpagent');
const nconf = require('nconf');

const httpTimeout = {
  socket: 30000,
  request: 30000,
  response: 60000
};

const formatTime = (duration) => {
  let sec = Math.floor(duration % 60).toLocaleString();
  let min = Math.floor(duration / 60 % 60).toLocaleString();
  let hour = Math.floor(duration / 3600 % 60).toLocaleString();
  if (sec.length != 2) sec = '0' + sec;
  if (min.length != 2) min = '0' + min;
  if (hour.length != 2) hour = '0' + hour;
  return hour + ":" + min + ":" + sec;
}
const sleep = (ms) => {
  return new Promise(resolve => setTimeout(resolve, ms));
}
const queue_callback = (that: QueueObject, callback) => {
  that.callback(callback);
}

type Video = {
  id: string,
  url: string,
  url_prefix?: string,
  dir: string,
  segment_total: number,
  segment_downloaded: number,
  time: string,
  status: string,
  isLiving: boolean,
  headers: object,
  taskName: string,
  myKeyIV: string,
  taskIsDelTs?: boolean,
  success?: boolean,
  videopath: string
}
const globalCond = {};
const pathConfigDir = 'config';
const pathConfigFile = path.join(pathConfigDir, 'config.json');
const logger = winston.createLogger({
  level: 'debug',
  format: winston.format.combine(
    winston.format.timestamp({
      format: 'YYYY-MM-DD HH:mm:ss'
    }),
    winston.format.printf(info => `${info.timestamp} ${info.level}: ${info.message}` + (info.splat !== undefined ? `${info.splat}` : " "))
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({
      filename: path.join(pathConfigDir, 'logs/error.log'),
      level: 'error'
    }),
    new winston.transports.File({
      filename: path.join(pathConfigDir, 'logs/all.log')
    }),
  ],
});
nconf.argv().env()
try {
  nconf.file({
    file: pathConfigFile
  })
} catch (error) {
  logger.error('Please correct the mistakes in your configuration file: [%s].\n' + error,)
}
const pathDownloadDir = nconf.get('SaveVideoDir');
const config_proxy = nconf.get('config_proxy');
const httpProxy = new HttpProxyAgent({
  keepAlive: true,
  keepAliveMsecs: 1000,
  maxSockets: 256,
  maxFreeSockets: 256,
  scheduling: 'lifo',
  proxy: config_proxy
});
const proxy_agent = config_proxy ? {
  http: httpProxy,
  https: httpProxy
} : null;
type NewTaskInfo = {
  url: string,
  headers: string,
  myKeyIV: string,
  taskName: string,
  taskIsDelTs: boolean,
  url_prefix: string
}
type DownloadTask = {
  url: string,
  headers: object,
  myKeyIV: string,
  taskName: string,
  taskIsDelTs: boolean,
  url_prefix: string
}
class FFmpegStreamReadable extends Readable {
  constructor(opt) {
    super(opt);
  }
  _read() { }
}
class NewTask {
  m3u8_url: string
  playlistUri: string
  headers: string
  myKeyIV: string
  taskName: string
  taskIsDelTs: boolean
  m3u8_url_prefix: string
  addTaskMessage: string
  playlists: any
  newTaskInfo: NewTaskInfo;
  downloadTask: DownloadTask;
  constructor({
    m3u8_url = '',
    playlistUri = '',
    headers = 'user-agent: Mozilla/5.0 (Windows NT 6.1; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/83.0.4103.61 Safari/537.36Transmission/2.94',
    myKeyIV = '',
    taskName = '',
    taskIsDelTs = false,
    m3u8_url_prefix = '', }) {
    if (!m3u8_url) {
      throw new Error('请输入正确的M3U8-URL或者导入(.m3u8)文件')

    }
    this.m3u8_url = m3u8_url
    this.playlistUri = playlistUri
    this.headers = headers
    this.myKeyIV = myKeyIV
    this.taskName = taskName
    this.taskIsDelTs = taskIsDelTs
    this.m3u8_url_prefix = m3u8_url_prefix
    if (this.playlistUri != "") {
      const uri = this.playlistUri
      if (!uri.startsWith("http")) {
        m3u8_url =
          uri[0] == "/"
            ? m3u8_url.substr(0, m3u8_url.indexOf("/", 10)) + uri
            : m3u8_url.replace(/\/[^\/]*((\?.*)|$)/, "/") + uri
      } else {
        m3u8_url = uri
      }
    }
    this.newTaskInfo = {
      url: m3u8_url,
      headers: this.headers,
      myKeyIV: this.myKeyIV,
      taskName: this.taskName,
      taskIsDelTs: this.taskIsDelTs,
      url_prefix: this.m3u8_url_prefix,
    }
    this.addTaskMessage = "正在检查链接..."

  }
  addTask(object: NewTaskInfo) {
    return new Promise(async (resolve, reject) => {

      let hlsSrc = object.url;
      let _headers = {};
      if (object.headers) {
        let __ = object.headers.match(/(.*?): ?(.*?)(\n|\r|$)/g);
        __ && __.forEach((_) => {
          let ___ = _.match(/(.*?): ?(.*?)(\n|\r|$)/i);
          ___ && (_headers[___[1]] = ___[2]);
        });
      }
      let mes = hlsSrc.match(/^https?:\/\/[^/]*/);
      let _hosts = '';
      if (mes && mes.length >= 1) {
        _hosts = mes[0];
        if (_headers['Origin'] == null && _headers['origin'] == null) {
          _headers['Origin'] = _hosts;
        }
        if (_headers['Referer'] == null && _headers['referer'] == null) {
          _headers['Referer'] = _hosts;
        }
      }
      let object1: DownloadTask = {
        ...object,
        headers: _headers
      }
      let info = '解析资源失败！';
      let code = -1;
      let parser = new Parser();
      if (/^file:\/\/\//g.test(hlsSrc)) {
        parser.push(fs.readFileSync(hlsSrc.replace(/^file:\/\/\//g, '')));
        parser.end();
      } else {
        for (let index = 0; index < 3; index++) {
          let response = await got(hlsSrc, {
            headers: _headers,
            timeout: httpTimeout,
            agent: proxy_agent
          }).catch(logger.error); {
            if (response && response.body != null &&
              response.body != '') {
              parser.push(response.body);
              parser.end();
              if (
                parser.manifest.segments.length == 0 &&
                parser.manifest.playlists &&
                parser.manifest.playlists.length &&
                parser.manifest.playlists.length == 1
              ) {
                let uri = parser.manifest.playlists[0].uri;
                if (!uri.startsWith('http')) {
                  hlsSrc = uri[0] == '/' ? (hlsSrc.substr(0, hlsSrc.indexOf('/', 10)) + uri) :
                    (hlsSrc.replace(/\/[^\/]*((\?.*)|$)/, '/') + uri);
                }
                else {
                  hlsSrc = uri;
                }
                object1.url = hlsSrc;
                parser = new Parser();
                continue;
              }
              break;
            }
          }
        }
      }
      let count_seg = parser.manifest.segments.length;
      if (count_seg > 0) {
        code = 0;
        if (parser.manifest.endList) {
          let duration = 0;
          parser.manifest.segments.forEach(segment => {
            duration += segment.duration;
          });
          info = `点播资源解析成功，有 ${count_seg} 个片段，时长: ${formatTime(duration)}，即将开始缓存...`;
          this.downloadTask = object1
          // return this.startDownload(object1, undefined);
        } else {
          info = `直播资源解析成功，即将开始缓存...`;
          startDownloadLive(object1);
        }
      } else if (
        parser.manifest.playlists &&
        parser.manifest.playlists.length &&
        parser.manifest.playlists.length >= 1
      ) {
        resolve({
          code: 1,
          message: '',
          playlists: parser.manifest.playlists
        })
        return;
      }
      const data = {
        code,
        message: info
      }
      if (code != -1) {
        resolve(data)
      } else {
        reject(data);
      }
    })
  }
  taskAddReply(data) {
    if (data.code != 1) {
      console.log(data.code, data.message, 'rr');
      return;
    }
    this.playlists = data.playlists;
    this.playlistUri = this.playlists[0].uri;
    this.addTaskMessage = "请选择一种画质";
  }
  startDownload(object, iidx) {
    return new Promise(async (resolve, reject) => {

      logger.info(object)
      logger.info(iidx)
      let id = object.id || (iidx && (new Date().getTime() + iidx) || new Date().getTime())
      let {
        headers,
        url_prefix,
        taskName,
        myKeyIV,
        url,
        taskIsDelTs
      } = object

      if (!taskName) {
        taskName = `${id}`;
      }
      let dir = path.join(pathDownloadDir, taskName.replace(/["“”，\.。\|\/\\ \*:;\?<>]/g, ""));
      logger.info(dir);
      !fs.existsSync(dir) && fs.mkdirSync(dir, { recursive: true });
      let parser = new Parser();
      if (/^file:\/\/\//g.test(url)) {
        parser.push(fs.readFileSync(url.replace(/^file:\/\/\//, ''), { encoding: 'utf-8' }));
        parser.end();
      } else {
        for (let index = 0; index < 3; index++) {
          let response = await got(url, {
            headers,
            timeout: httpTimeout,
            agent: proxy_agent
          }).catch(logger.error); {
            if (response && response.body != null &&
              response.body != '') {
              parser.push(response.body);
              parser.end();
              if (
                parser.manifest.segments.length == 0 &&
                parser.manifest.playlists &&
                parser.manifest.playlists.length &&
                parser.manifest.playlists.length >= 1
              ) {
                let uri = parser.manifest.playlists[0].uri;
                if (!uri.startsWith('http')) {
                  url = uri[0] == '/' ? (url.substr(0, url.indexOf('/', 10)) + uri) :
                    (url.replace(/\/[^\/]*((\?.*)|$)/, '/') + uri);
                }
                else {
                  url = uri;
                }
                parser = new Parser();
                continue;
              }
              break;
            }
          }
        }
      }

      //并发 2 个线程下载
      var tsQueues = async.queue(queue_callback, 5);
      let count_seg = parser.manifest.segments.length;
      let count_downloaded = 0;
      var video: Video = {
        id,
        url,
        url_prefix,
        dir,
        segment_total: count_seg,
        segment_downloaded: count_downloaded,
        time: dateFormat(new Date(), "yyyy-mm-dd HH:MM:ss"),
        status: '初始化...',
        isLiving: false,
        headers,
        taskName,
        myKeyIV,
        taskIsDelTs,
        success: true,
        videopath: ''
      };
      if (!object.id) {
        taskNotifyCreate(video)
      }
      globalCond[id] = true;
      let segments = parser.manifest.segments;
      for (let iSeg = 0; iSeg < segments.length; iSeg++) {
        let qo = new QueueObject(
          {
            dir,
            idx: iSeg,
            id,
            url,
            url_prefix,
            headers,
            myKeyIV,
            segment: segments[iSeg],
            then: function () {
              count_downloaded += 1
              video.segment_downloaded = count_downloaded;
              video.status = `下载中...${count_downloaded}/${count_seg}`
              if (video.success) {
                taskNotifyUpdate(video)
              }
            },
            catchFn: function () {
              if (this.retry < 5) {
                tsQueues.push(this);
              } else {
                globalCond[id] = false;
                video.success = false;
                logger.info(`URL:${video.url} | ${this.segment.uri} download failed`);
                video.status = "多次尝试，下载片段失败";
                taskNotifyEnd(video)
              }
            }
          }
        );
        tsQueues.push(qo);
      }
      tsQueues.drain(async () => {
        if (!video.success) {
          reject()
          return;
        }
        logger.info('download success');
        resolve({})
        video.status = "已完成，合并中...";
        taskNotifyEnd(video)
        let fileSegments = [];
        for (let iSeg = 0; iSeg < segments.length; iSeg++) {
          let filpath = path.join(dir, `${((iSeg + 1) + '').padStart(6, '0')}.ts`);
          if (fs.existsSync(filpath)) {
            fileSegments.push(filpath);
          }
        }
        if (!fileSegments.length) {
          video.status = "下载失败，请检查链接有效性";
          taskNotifyEnd(video)
          logger.error(`[${url}] 下载失败，请检查链接有效性`);
          return;
        }
        let outPathMP4 = path.join(dir, Date.now() + ".mp4");
        let outPathMP4_ = path.join(pathDownloadDir, taskName.replace(/["“”，\.。\|\/\\ \*:;\?<>]/g, "") + '.mp4');
        if (fs.existsSync(ffmpegPath)) {
          let ffmpegInputStream = new FFmpegStreamReadable(null);
          new ffmpeg(ffmpegInputStream)
            .setFfmpegPath(ffmpegPath)
            .videoCodec('copy')
            .audioCodec('copy')
            .format('mp4')
            .save(outPathMP4)
            .on('error', (error) => {
              logger.error(error)
              video.videopath = "";
              video.status = "合并出错，请尝试手动合并";
              reject()
              taskNotifyEnd(video)
            })
            .on('end', function () {
              logger.info(`${outPathMP4} merge finished.`)
              video.videopath = "";
              fs.existsSync(outPathMP4) && (fs.renameSync(outPathMP4, outPathMP4_), video.videopath = outPathMP4_);
              video.status = "已完成"
              taskNotifyEnd(video)
              if (video.taskIsDelTs) {
                let index_path = path.join(dir, 'index.txt');
                fs.existsSync(index_path) && fs.unlinkSync(index_path);
                fileSegments.forEach(item => fs.existsSync(item) && fs.unlinkSync(item));
                fs.rmdirSync(dir);
              }
            })
            .on('progress', (info) => {
              logger.info(JSON.stringify(info));
            });
          for (let i = 0; i < fileSegments.length; i++) {
            let percent = Math.ceil((i + 1) * 100 / fileSegments.length);
            video.status = `合并中[${percent}%]`;
            taskNotifyEnd(video)
            let filePath = fileSegments[i];
            fs.existsSync(filePath) && ffmpegInputStream.push(fs.readFileSync(filePath));
            while (ffmpegInputStream._readableState.length > 0) {
              await sleep(100);
            }
          }
          ffmpegInputStream.push(null);
        } else {
          video.videopath = outPathMP4;
          video.status = "已完成，未发现本地FFMPEG，不进行合成。"
          taskNotifyEnd(video)
        }
      });
    })
  }
}

async function startDownloadLive(object) {
  let id = object.id || new Date().getTime();
  let headers = object.headers;
  let taskName = object.taskName;
  let myKeyIV = object.myKeyIV;
  let url = object.url;
  if (!taskName) {
    taskName = `${id}`;
  }
  let dir = path.join(pathDownloadDir, taskName.replace(/["“”，\.。\|\/\\ \*:;\?<>]/g, ""));
  logger.info(dir);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, {
      recursive: true
    });
  }
  let count_downloaded = 0;
  let count_seg = 100;
  var video: Video = {
    id: id,
    url: url,
    dir: dir,
    segment_total: count_seg,
    segment_downloaded: count_downloaded,
    time: dateFormat(new Date(), "yyyy-mm-dd HH:MM:ss"),
    status: '初始化...',
    isLiving: true,
    myKeyIV: myKeyIV,
    taskName: taskName,
    headers: headers,
    videopath: '',
    // url_prefix: '',
    // taskIsDelTs: false,
    // success: false,
  };
  if (!object.id) {
    taskNotifyCreate(video)
  }
  let partent_uri = url.replace(/([^\/]*\?.*$)|([^\/]*$)/g, '');
  let segmentSet = new Set();
  let ffmpegInputStream = null;
  let ffmpegObj = null;
  globalCond[id] = true;
  while (globalCond[id]) {
    try {
      const response = await got(url, {
        headers: headers,
        timeout: httpTimeout,
        agent: proxy_agent
      }).catch(logger.error);
      if (response == null || response.body == null || response.body == '') {
        break;
      }
      let parser = new Parser();
      parser.push(response.body);
      parser.end();
      let count_seg = parser.manifest.segments.length;
      let segments = parser.manifest.segments;
      logger.info(`解析到 ${count_seg} 片段`)
      if (count_seg > 0) {
        //开始下载片段的时间，下载完毕后，需要计算下次请求的时间
        let _startTime = new Date();
        let _videoDuration = 0;
        for (let iSeg = 0; iSeg < segments.length; iSeg++) {
          let segment = segments[iSeg];
          if (segmentSet.has(segment.uri)) {
            continue;
          }
          if (!globalCond[id]) {
            break;
          }
          _videoDuration = _videoDuration + segment.duration * 1000;
          let uri_ts = '';
          if (/^http.*/.test(segment.uri)) {
            uri_ts = segment.uri;
          } else if (/^\/.*/.test(segment.uri)) {
            let mes = url.match(/^https?:\/\/[^/]*/);
            if (mes && mes.length >= 1) {
              uri_ts = mes[0] + segment.uri;
            } else {
              uri_ts = partent_uri + segment.uri;
            }
          } else {
            uri_ts = partent_uri + segment.uri;
          }
          let filename = `${((count_downloaded + 1) + '').padStart(6, '0')}.ts`;
          let filpath = path.join(dir, filename);
          let filpath_dl = path.join(dir, filename + ".dl");
          for (let index = 0; index < 3; index++) {
            if (!globalCond[id]) {
              break;
            }
            //let tsStream = await got.get(uri_ts, {responseType:'buffer', timeout:httpTimeout ,headers:headers}).catch(logger.error).body();
            await download(uri_ts, dir, {
              filename: filename + ".dl",
              timeout: httpTimeout,
              headers: headers,
              agent: proxy_agent
            }).catch((err) => {
              logger.error(err)
              if (fs.existsSync(filpath_dl)) {
                fs.unlinkSync(filpath_dl);
              }
            });
            if (fs.existsSync(filpath_dl)) {
              let stat = fs.statSync(filpath_dl);
              if (stat.size > 0) {
                fs.renameSync(filpath_dl, filpath);
              } else {
                fs.unlinkSync(filpath_dl);
              }
            }
            if (fs.existsSync(filpath)) {
              segmentSet.add(segment.uri);
              if (ffmpegObj == null) {
                let outPathMP4 = path.join(dir, id + '.mp4');
                let newid = id;
                //不要覆盖之前下载的直播内容
                while (fs.existsSync(outPathMP4)) {
                  outPathMP4 = path.join(dir, newid + '.mp4');
                  newid = newid + 1;
                }
                if (fs.existsSync(ffmpegPath)) {
                  ffmpegInputStream = new FFmpegStreamReadable(null);
                  ffmpegObj = new ffmpeg(ffmpegInputStream)
                    .setFfmpegPath(ffmpegPath)
                    .videoCodec('copy')
                    .audioCodec('copy')
                    .save(outPathMP4)
                    .on('error', logger.info)
                    .on('end', function () {
                      video.videopath = outPathMP4;
                      video.status = "已完成";
                      taskNotifyEnd(video)
                    })
                    .on('progress', logger.info);
                } else {
                  video.videopath = outPathMP4;
                  video.status = "已完成，未发现本地FFMPEG，不进行合成。"

                  taskNotifyUpdate(video)
                }
              }
              if (ffmpegInputStream) {
                ffmpegInputStream.push(fs.readFileSync(filpath));
                fs.unlinkSync(filpath);
              }
              //fs.appendFileSync(path.join(dir,'index.txt'),`file '${filpath}'\r\n`);
              count_downloaded = count_downloaded + 1;
              video.segment_downloaded = count_downloaded;
              video.status = `直播中... [${count_downloaded}]`;

              taskNotifyUpdate(video)
              break;
            }
          }
        }
        if (globalCond[id]) {
          //使下次下载M3U8时间提前1秒钟。
          _videoDuration = _videoDuration - 1000;
          let _downloadTime = (new Date().getTime() - _startTime.getTime());
          if (_downloadTime < _videoDuration) {
            await sleep(_videoDuration - _downloadTime);
          }
        }
      } else {
        break;
      }
      parser = null;
    } catch (error) {
      logger.info(error.response.body);
    }
  }
  if (ffmpegInputStream) {
    ffmpegInputStream.push(null);
  }
  if (count_downloaded <= 0) {
    video.videopath = '';
    video.status = "已完成，下载失败"
    taskNotifyEnd(video)
    return;
  }
}
type MergeTaskI = {
  name: string,
  ts_files: Array<string>,
  mergeType: string
}
async function mergeTs(task: MergeTaskI) {

  if (!task) return
  let name = task.name ? task.name : (new Date().getTime() + '');

  let dir = path.join(pathDownloadDir, name);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, {
      recursive: true
    });
  }
  let outPathMP4 = path.join(dir, `${new Date().getTime()}.mp4`);

  if (fs.existsSync(ffmpegPath)) {
    console.log({
      code: 0,
      progress: 1,
      status: '开始合并...'
    })
    const ffmpegInputStream = new FFmpegStreamReadable(null);

    let ffmpegObj = new ffmpeg(ffmpegInputStream)
      .setFfmpegPath(ffmpegPath)
      .videoCodec(task.mergeType == 'speed' ? 'copy' : 'libx264')
      .audioCodec(task.mergeType == 'speed' ? 'copy' : 'aac')
      .format('mp4')
      .save(outPathMP4)
      .on('error', (error) => {
        logger.error(error)
        console.log({
          code: -2,
          progress: 100,
          status: '合并出错|' + error
        })
      })
      .on('end', function () {
        logger.info(`${outPathMP4} merge finished.`)
        console.log({
          code: 1,
          progress: 100,
          status: 'success',
          dir: dir,
          path: outPathMP4
        })
      })
      .on('progress', (info) => {
        logger.info(JSON.stringify(info));
        console.log({
          code: 0,
          progress: -1,
          status: JSON.stringify(info)
        })
      });
    let count = task.ts_files.length
    for (let index = 0; index < count; index++) {
      const file = task.ts_files[index];
      ffmpegInputStream.push(fs.readFileSync(file));
      while (ffmpegInputStream._readableState.length > 0) {
        await sleep(200);
      }
      let precent = Math.ceil((index + 1) * 100 / count);
      console.log({
        code: 0,
        progress: precent,
        status: `合并中...[${precent}%]`
      })
    }
    ffmpegInputStream.push(null);
  } else {
    console.log({
      code: -1,
      progress: 100,
      status: '未检测到FFMPEG,不进行合并操作。'
    })
  }
}


class QueueObject {
  dir: any;
  idx: number;
  id: any;
  url: any;
  url_prefix: any;
  headers: any;
  myKeyIV: any;
  segment: any;
  then: () => void;
  catch: () => void;
  retry: number;
  constructor({
    segment = null,
    url = '',
    url_prefix = '',
    headers = '',
    myKeyIV = '',
    id = 0,
    idx = 0,
    dir = '',
    then = null,
    catchFn = null,
    retry = 0
  }) {
    this.segment = segment;
    this.url = url;
    this.url_prefix = url_prefix;
    this.headers = headers;
    this.myKeyIV = myKeyIV;
    this.id = id;
    this.idx = idx;
    this.dir = dir;
    this.then = then
    this.catch = catchFn;
    this.retry = retry;
  }
  async callback(_callback) {
    try {
      this.retry = this.retry + 1;
      if (this.retry > 5) {
        this.catch && this.catch();
        return;
      }
      if (!globalCond[this.id]) {
        logger.debug(`globalCond[this.id] is not exsited.`);
        return;
      }
      let partent_uri = this.url.replace(/([^\/]*\?.*$)|([^\/]*$)/g, '');
      let segment = this.segment;
      let uri_ts = '';
      if (/^http.*/.test(segment.uri)) {
        uri_ts = segment.uri;
      } else if (/^http/.test(this.url) && /^\/.*/.test(segment.uri)) {
        let mes = this.url.match(/^https?:\/\/[^/]*/);
        if (mes && mes.length >= 1) {
          uri_ts = mes[0] + segment.uri;
        } else {
          uri_ts = partent_uri + (partent_uri.endsWith('/') || segment.uri.startWith('/') ? '' : "/") + segment.uri;
        }
      } else if (/^http.*/.test(this.url)) {
        uri_ts = partent_uri + (partent_uri.endsWith('/') || segment.uri.startWith('/') ? '' : "/") + segment.uri;
      } else if (/^file:\/\/\//.test(this.url) && !this.url_prefix) {
        let fileDir = this.url.replace('file:///', '').replace(/[^\\/]{1,}$/, '');
        uri_ts = path.join(fileDir, segment.uri);
        if (!fs.existsSync(uri_ts)) {
          var me = segment.uri.match(/[^\\\/\?]{1,}\?|$/i);
          if (me && me.length > 1) {
            uri_ts = path.join(fileDir, me[0].replace(/\?$/, ''));
          }
          if (!fs.existsSync(uri_ts)) {
            globalCond[this.id] = false;
            this.catch && this.catch();
            return;
          }
        }
        uri_ts = "file:///" + uri_ts
      } else if (/^file:\/\/\//.test(this.url) && this.url_prefix) {
        uri_ts = this.url_prefix + (this.url_prefix.endsWith('/') || segment.uri.startWith('/') ? '' : "/") + segment.uri;
      }
      let filename = `${((this.idx + 1) + '').padStart(6, '0')}.ts`;
      let filpath = path.join(this.dir, filename);
      let filpath_dl = path.join(this.dir, filename + ".dl");
      logger.debug(`2 ${segment.uri}`, `${filename}`);
      //检测文件是否存在
      for (let index = 0; index < 3 && !fs.existsSync(filpath); index++) {
        // 下载的时候使用.dl后缀的文件名，下载完成后重命名
        let that = this;
        if (/^file:\/\/\//.test(uri_ts)) {
          fs.copyFileSync(uri_ts.replace(/^file:\/\/\//, ''), filpath_dl);
        } else {
          var _headers = [];
          if (that.headers) {
            for (var _key in that.headers) {
              _headers.push(_key + ": " + that.headers[_key])
            }
          }
          //aria2Client && aria2Client.call("addUri", [uri_ts], { dir:that.dir, out: filename + ".dl", split: "16", header: _headers});
          //break;
          await download(uri_ts, that.dir, {
            filename: filename + ".dl",
            timeout: httpTimeout,
            headers: that.headers,
            agent: proxy_agent
          }).catch((err) => {
            logger.error(err)
            fs.existsSync(filpath_dl) && fs.unlinkSync(filpath_dl);
          });
        }
        if (!fs.existsSync(filpath_dl)) continue;
        fs.statSync(filpath_dl).size <= 0 && fs.unlinkSync(filpath_dl);
        if (segment.key != null && segment.key.method != null) {
          //标准解密TS流
          let aes_path = path.join(this.dir, "aes.key");
          if (!this.myKeyIV && !fs.existsSync(aes_path)) {
            let key_uri = segment.key.uri;
            if (/^http/.test(this.url) && !/^http.*/.test(key_uri) && !/^\/.*/.test(key_uri)) {
              key_uri = partent_uri + key_uri;
            } else if (/^http/.test(this.url) && /^\/.*/.test(key_uri)) {
              let mes = this.url.match(/^https?:\/\/[^/]*/);
              if (mes && mes.length >= 1) {
                key_uri = mes[0] + key_uri;
              } else {
                key_uri = partent_uri + key_uri;
              }
            } else if (/^file:\/\/\//.test(this.url) && !this.url_prefix && !/^http.*/.test(key_uri)) {
              let fileDir = this.url.replace('file:///', '').replace(/[^\\/]{1,}$/, '');
              let key_uri_ = path.join(fileDir, key_uri);
              if (!fs.existsSync(key_uri_)) {
                var me = key_uri.match(/([^\\\/\?]{1,})(\?|$)/i);
                if (me && me.length > 1) {
                  key_uri_ = path.join(fileDir, me[1]);
                }
                if (!fs.existsSync(key_uri_)) {
                  globalCond[this.id] = false;
                  this.catch && this.catch();
                  return;
                }
              }
              key_uri = "file:///" + key_uri_;
            } else if (/^file:\/\/\//.test(this.url) && this.url_prefix && !/^http.*/.test(key_uri)) {
              key_uri = this.url_prefix + (this.url_prefix.endsWith('/') || key_uri.startWith('/') ? '' : "/") + key_uri;
            }
            if (/^http/.test(key_uri)) {
              await download(key_uri, that.dir, {
                filename: "aes.key",
                headers: that.headers,
                timeout: httpTimeout,
                agent: proxy_agent
              }).catch(console.error);
            } else if (/^file:\/\/\//.test(key_uri)) {
              key_uri = key_uri.replace('file:///', '')
              if (fs.existsSync(key_uri)) {
                fs.copyFileSync(key_uri, aes_path);
              } else {
                globalCond[this.id] = false;
                this.catch && this.catch();
                return;
              }
            }
          }
          if (this.myKeyIV || fs.existsSync(aes_path)) {
            try {
              let key_ = null;
              let iv_ = null;
              if (!this.myKeyIV) {
                key_ = fs.readFileSync(aes_path);
                if (key_.length == 32) {
                  key_ = Buffer.from(fs.readFileSync(aes_path, {
                    encoding: 'utf8'
                  }), 'hex');
                }
                iv_ = segment.key.iv != null ? Buffer.from(segment.key.iv.buffer) :
                  Buffer.from(that.idx.toString(16).padStart(32, '0'), 'hex');
              } else {
                key_ = Buffer.from(this.myKeyIV.substr(0, 32), 'hex');
                if (this.myKeyIV.length >= 64) {
                  iv_ = Buffer.from(this.myKeyIV.substr(this.myKeyIV.length - 32, 32), 'hex');
                } else {
                  iv_ = Buffer.from(that.idx.toString(16).padStart(32, '0'), 'hex')
                }
              }
              logger.debug(`key:${key_.toString('hex')} | iv:${iv_.toString('hex')}`)
              let cipher = crypto.createDecipheriv((segment.key.method + "-cbc").toLowerCase(), key_, iv_);
              cipher.on('error', console.error);
              let inputData = fs.readFileSync(filpath_dl);
              let outputData = Buffer.concat([cipher.update(inputData), cipher.final()]);
              fs.writeFileSync(filpath, outputData);
              if (fs.existsSync(filpath_dl))
                fs.unlinkSync(filpath_dl);
              that.then && that.then();
            } catch (error) {
              logger.error(error)
              if (fs.existsSync(filpath_dl))
                fs.unlinkSync(filpath_dl);
            }
            return;
          }
        } else {
          fs.renameSync(filpath_dl, filpath);
          break;
        }
      }
      if (fs.existsSync(filpath)) {
        this.then && this.then();
      } else {
        this.catch && this.catch();
      }
    } catch (e) {
      logger.error(e);
    } finally {
      _callback();
    }
  }
}
function taskNotifyUpdate(video) {
  console.log(video)
}
function taskNotifyCreate(video) {
  console.log(video)
}
function taskNotifyEnd(video) {
  console.log(video)
}
export default NewTask