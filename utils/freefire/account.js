'use strict';
const axios = require('axios');
const { encodeProtobuf, decodeProtobuf } = require('./utils');
const { RELEASE_VERSION } = require('./config');

async function getGarenaToken(uid, password) {
    const url = 'https://ffmconnect.live.gop.garenanow.com/oauth/guest/token/grant';
    const params = new URLSearchParams({
        uid: String(uid),
        password: String(password),
        response_type: 'token',
        client_type: '2',
        client_secret: '2ee44819e9b4598845141067b281621874d0d5d7af9d8f7e00c1e54715b7d1e3',
        client_id: '100067'
    });
    const response = await axios.post(url, params.toString(), {
        headers: {
            'User-Agent': 'GarenaMSDK/4.0.19P9(A063 ;Android 13;en;IN;)',
            'Connection': 'Keep-Alive',
            'Accept-Encoding': 'gzip',
            'Content-Type': 'application/x-www-form-urlencoded'
        },
        timeout: 15000,
        decompress: true
    });
    return response.data;
}

async function getMajorLogin(logintoken, openid) {
    const payload = await encodeProtobuf(
        { openid: String(openid), logintoken: String(logintoken), platform: '4' },
        'MajorLogin.proto',
        'MajorLogin.request'
    );

    const url = 'https://loginbp.ggpolarbear.com/MajorLogin';
    const response = await axios.post(url, payload, {
        headers: {
            'User-Agent': 'Dalvik/2.1.0 (Linux; U; Android 13; A063 Build/TKQ1.221220.001)',
            'Connection': 'Keep-Alive',
            'Accept-Encoding': 'gzip',
            'Content-Type': 'application/x-www-form-urlencoded',
            'Expect': '100-continue',
            'Authorization': 'Bearer',
            'X-Unity-Version': '2018.4.11f1',
            'X-GA': 'v1 1',
            'ReleaseVersion': RELEASE_VERSION
        },
        responseType: 'arraybuffer',
        timeout: 15000,
        decompress: true
    });

    return decodeProtobuf(response.data, 'MajorLogin.proto', 'MajorLogin.response');
}

module.exports = { getGarenaToken, getMajorLogin };
