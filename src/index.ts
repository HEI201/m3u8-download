import NewTask from "./server";
import Db from "./model/query";

Db.queryVideos().then(res => {
    test(res)
})


const test = async (list) => {
    for (let i = 0; i < list.length; i++) {
        const item = list[i]
        const {
            aliAllUrl,
            video_name,
            course_id,
            course_name,
            week_id,
            week_title,
            chapter_id,
            chapter_name,
            sort,
        } = item
        const taskName = `${course_id}_${course_name}_${week_id}_${week_title}_` +
            `${chapter_id}_${chapter_name}_${sort}_${video_name}`
        let newTask = new NewTask({ m3u8_url: aliAllUrl, taskName })
        await newTask.addTask(newTask.newTaskInfo)
        await newTask.startDownload(newTask.downloadTask, undefined)
    }
}
