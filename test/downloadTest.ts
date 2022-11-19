import Task from '../src';


(async () => {
    const list = [
        'https://fangdaoproduct.yaocaiwuziyou.com/1430af66db424084abf3bead9906f6a3/a5055930689fcb48e6344b9ddc8f613d-sd-encrypt-stream.m3u8?auth_key=1665292289-b967194cb34b424a8ae791ebed171fa0-0-257bab70b987bc68bff8cd86caa946b7'
    ];
    for (let index = 0; index < list.length; index++) {
        const url = list[index];
        let newTask = new Task({
            m3u8_url: url,
            taskName: 'taskName' + index,
        });
        await newTask.parseM3u8();
        await newTask.startDownload();
    }
})();
