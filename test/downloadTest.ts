import Task from '../src'


(async () => {
    const list = [
        'https://fangdaoproduct.yaocaiwuziyou.com/dd384d6c3a464780aea037e2fc4e08b3/f8646767466bd3db387b771ad97cf903-sd-encrypt-stream.m3u8?auth_key=1636819000-048218fe97e343f68efd67fc1fff6b9d-0-b41aeef96cb8a9bd14ea016af85c872a',
        'https://fangdaoproduct.yaocaiwuziyou.com/cab10b0c27204637a86786ac548ba4d6/3883b83aa85b054ae92675aba873026b-sd-encrypt-stream.m3u8?auth_key=1636819050-82a4a40561a64997a8245f3272f72d99-0-b6a72f020c87005cc748f3e2f2896768'
    ]
    console.log('object')
    for (let index = 0; index < list.length; index++) {
        const url = list[index];
        console.log('for')
        let newTask = new Task({
            m3u8_url: url,
            taskName: 'taskName' + index,
            pathDownloadDir: "D:\\Music\\m3u8_downloader",
        })
        await newTask.parseM3u8()
        await newTask.startDownload()
    }
})()
