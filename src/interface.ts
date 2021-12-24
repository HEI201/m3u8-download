interface Video {
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
    videopath: string,
    pathDownloadDir: string;

}

interface MergeTask {
    name: string,
    ts_files: Array<string>,
    mergeType: string
}
export {
    Video,
    MergeTask,
}