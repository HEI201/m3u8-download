import M3u8Downloader from '../src';


(async () => {
    const list = [
        'https://fangdaoproduct.yaocaiwuziyou.com/f157b1c0bade4e85921dfb7fcd0eccab/faf704357e4df0d9fcf72f36ac1259da-sd-encrypt-stream.m3u8?auth_key=1665324186-c99d94678f494b0bb362c4da8859a5e7-0-35debcf6951aea66a36e78ef9b33bd71'
    ];
    for (let index = 0; index < list.length; index++) {
        const url = list[index];
        let newTask = new M3u8Downloader({
            m3u8_url: url,
            taskName: 'taskName' + index,
        });
        await newTask.download();
    }
})();
