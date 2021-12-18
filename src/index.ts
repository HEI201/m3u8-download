import NewTask from "./server";
let url = 'https://fangdaoproduct.yaocaiwuziyou.com/5fea887c7b1d47f4bc5080b6196a4076/8e5abb301a02e43852864dd0911430b5-sd-encrypt-stream.m3u8?auth_key=1636247588-9688f07de91c4adfada92a60c5b479ed-0-08c75a760aec67d4876b7de9a516aa34'

var newTask = new NewTask({ m3u8_url: url, taskName: 'test' })