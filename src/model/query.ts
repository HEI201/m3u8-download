// const mysqlConf = require('../conf/mysql');
import mysqlConf from '../conf/mysql'
const Mysql = require('mysql');
var connection = Mysql.createConnection(mysqlConf);
connection.connect();

const queryCourses = () => {
    return new Promise((resolve, reject) => {
        connection.query('SELECT DISTINCT course_name, course_id FROM courses', function (error, results, fields) {
            if (error) reject(error);
            resolve(results);
        });
    });

}
const queryVideos = () => {
    return new Promise((resolve, reject) => {
        connection.query(
            `SELECT
            courses.course_id,
            courses.course_name,
            weeks.week_id,
            weeks.week_title,
            chapters.chapter_id,
            chapters.chapter_name,
            videos.video_id,
            videos.aliAllUrl,
            videos.video_name,
            videos.sort,
            videos.id 
        FROM
            courses
            LEFT JOIN weeks ON courses.course_id = weeks.course_id
            LEFT JOIN chapters ON weeks.week_id = chapters.week_id 
            AND weeks.course_id = chapters.course_id
            LEFT JOIN videos ON chapters.chapter_id = videos.chapter_id 
            AND chapters.week_id = videos.week_id 
            AND chapters.course_id = videos.course_id 
        ORDER BY
            videos.video_id`,
            function (error, results, fields) {
                if (error) reject(error);
                resolve(results);
            });
    });

}
const insertCourse = ({ course_id, course_name }) => {
    return new Promise((resolve, reject) => {
        connection.query('INSERT INTO courses (course_id,course_name) VALUES(?,?)', [course_id, course_name], function (error, results, fields) {
            if (error) reject(error);
            resolve(results);
        })
    });
}
const insertSchedule = ({ course_id, lesson_id, course_week_name }) => {
    return new Promise((resolve, reject) => {
        connection.query('INSERT INTO lessons (course_id,lesson_id,course_week_name) VALUES(?,?,?)', [course_id, lesson_id, course_week_name], function (error, results, fields) {
            if (error) reject(error);
            resolve(results);
        })
    });
}

const insertWeek = ({ course_id, lesson_id, week_id, week_title }) => {
    return new Promise((resolve, reject) => {
        connection.query('INSERT INTO weeks (course_id,lesson_id,week_id,week_title) VALUES(?,?,?,?)', [course_id, lesson_id, week_id, week_title], function (error, results, fields) {
            if (error) reject(error);
            resolve(results);
        })
    });
}
const insertChapter = ({ week_id, chapter_id, chapter_name }) => {
    return new Promise((resolve, reject) => {
        connection.query('INSERT INTO chapters (week_id,chapter_id,chapter_name) VALUES(?,?,?)', [week_id, chapter_id, chapter_name], function (error, results, fields) {
            if (error) reject(error);
            resolve(results);
        })
    });
}
const insertVideo = ({ chapter_id,
    video_id, name, aliAllUrl,
    category_id, version_id, sort,
    course_id, week_id, duration }) => {
    return new Promise((resolve, reject) => {
        connection.query('INSERT INTO videos (chapter_id,video_id,name,aliAllUrl,category_id,version_id,sort, course_id, week_id,duration ) VALUES(?,?,?,?,?,?,?,?,?,?)',
            [chapter_id, video_id, name,
                aliAllUrl, category_id,
                version_id, sort, course_id,
                week_id, duration], function (error, results, fields) {
                    if (error) reject(error);
                    resolve(results);
                })
    });
}

export default {
    queryCourses,
    insertCourse,
    insertSchedule,
    insertWeek,
    insertChapter,
    insertVideo,
    queryVideos
}