import M3u8Downloader from '../src';


(async () => {
    const list = [
        // 'https://fangdaoproduct.yaocaiwuziyou.com/f157b1c0bade4e85921dfb7fcd0eccab/faf704357e4df0d9fcf72f36ac1259da-sd-encrypt-stream.m3u8?auth_key=1665324186-c99d94678f494b0bb362c4da8859a5e7-0-35debcf6951aea66a36e78ef9b33bd71',
        'https://fangdaoproduct.yaocaiwuziyou.com/702472747cdd40979717d69bfb7f9f60/a1c55a291859a7d639890837aa267aaa-sd-encrypt-stream.m3u8?auth_key=1679296070-b3a7527200064616ab048344ae7cebca-0-a5b0349c0d9de77ef59ca52568f46e97'
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
