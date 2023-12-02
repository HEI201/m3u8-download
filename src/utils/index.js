

export const formatDuration = (duration) => {
    let sec = Math.floor(duration % 60).toLocaleString();
    let min = Math.floor(duration / 60 % 60).toLocaleString();
    let hour = Math.floor(duration / 3600 % 60).toLocaleString();
    if (sec.length != 2) sec = '0' + sec;
    if (min.length != 2) min = '0' + min;
    if (hour.length != 2) hour = '0' + hour;
    return hour + ":" + min + ":" + sec;
};

export const sleep = (ms) => {
    return new Promise(resolve => setTimeout(resolve, ms));
};


export const patchHeaders = (url) => {
    let _headers = {};
    const headersString = 'user-agent: Mozilla/5.0 (Windows NT 6.1; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/83.0.4103.61 Safari/537.36Transmission/2.94';
    if (headersString) {
        let __ = headersString.match(/(.*?): ?(.*?)(\n|\r|$)/g);
        __ && __.forEach((_) => {
            let ___ = _.match(/(.*?): ?(.*?)(\n|\r|$)/i);
            ___ && (_headers[___[1]] = ___[2]);
        });
    }
    let mes = url.match(/^https?:\/\/[^/]*/);
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
    return _headers;
};

export const getSegmentFilename = (idx) => {
    return `${(idx + '').padStart(6, '0')}.ts`;
};