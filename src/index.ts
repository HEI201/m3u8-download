import NewTask from "./server";
let url = 'https://fangdaoproduct.yaocaiwuziyou.com/316bf014b1b448d38fc20794cac3e7be/d90bf2bdc5775b9e10dcc25a360fbe6b-sd-encrypt-stream.m3u8?auth_key=1636322753-a2feeb81994f407db4d9075fc09c52e8-0-d7407308d446bbcf11162bb6dd148e68'

var newTask = new NewTask({ m3u8_url: url, taskName: 'test' })