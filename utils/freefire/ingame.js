'use strict';
const axios = require('axios');
const { encodeProtobuf, decodeProtobuf } = require('./utils');
const { RELEASE_VERSION } = require('./config');

const BASE_HEADERS = {
    'User-Agent': 'Dalvik/2.1.0 (Linux; U; Android 13; A063 Build/TKQ1.221220.001)',
    'Connection': 'Keep-Alive',
    'Accept-Encoding': 'gzip',
    'Content-Type': 'application/x-www-form-urlencoded',
    'Expect': '100-continue',
    'X-Unity-Version': '2018.4.11f1',
    'X-GA': 'v1 1',
    'ReleaseVersion': RELEASE_VERSION
};

async function getPlayerPersonalShow(serverUrl, token, accountId, needGalleryInfo = false, callSignSrc = 7, needBlacklist = false, needSparkInfo = false) {
    const data = {
        accountId: parseInt(accountId),
        callSignSrc: parseInt(callSignSrc)
    };
    if (needGalleryInfo) data.needGalleryInfo = true;
    if (needBlacklist) data.needBlacklist = true;
    if (needSparkInfo) data.needSparkInfo = true;

    const payload = await encodeProtobuf(data, 'PlayerPersonalShow.proto', 'PlayerPersonalShow.request');

    const response = await axios.post(`${serverUrl}/GetPlayerPersonalShow`, payload, {
        headers: {
            'User-Agent': 'UnityPlayer/2022.3.47f1 (UnityWebRequest/1.0, libcurl/8.5.0-DEV)',
            'Accept': '*/*',
            'Accept-Encoding': 'deflate, gzip',
            'Authorization': `Bearer ${token}`,
            'X-GA': 'v1 1',
            'ReleaseVersion': RELEASE_VERSION,
            'Content-Type': 'application/x-www-form-urlencoded',
            'X-Unity-Version': '2022.3.47f1'
        },
        responseType: 'arraybuffer',
        timeout: 20000,
        decompress: true
    });

    return decodeProtobuf(response.data, 'PlayerPersonalShow.proto', 'PlayerPersonalShow.response');
}

async function getPlayerStats(token, serverUrl, mode, uid, matchType = 'CAREER') {
    mode = mode.toLowerCase();
    matchType = matchType.toUpperCase();

    const isBR = mode === 'br';

    const brTypeMap = { 'CAREER': 0, 'NORMAL': 1, 'RANKED': 2 };
    const csTypeMap = { 'CAREER': 0, 'NORMAL': 1, 'RANKED': 6 };

    if (isBR) {
        const matchmode = brTypeMap[matchType];
        const payload = await encodeProtobuf(
            { accountid: parseInt(uid), matchmode },
            'PlayerStats.proto',
            'PlayerStats.request'
        );
        const response = await axios.post(`${serverUrl}/GetPlayerStats`, payload, {
            headers: { ...BASE_HEADERS, 'Authorization': `Bearer ${token}` },
            responseType: 'arraybuffer',
            timeout: 20000,
            decompress: true
        });
        return decodeProtobuf(response.data, 'PlayerStats.proto', 'PlayerStats.response');
    } else {
        const matchmode = csTypeMap[matchType];
        const payload = await encodeProtobuf(
            { accountid: parseInt(uid), gamemode: 15, matchmode },
            'PlayerCSStats.proto',
            'PlayerCSStats.request'
        );
        const response = await axios.post(`${serverUrl}/GetPlayerTCStats`, payload, {
            headers: { ...BASE_HEADERS, 'Authorization': `Bearer ${token}` },
            responseType: 'arraybuffer',
            timeout: 20000,
            decompress: true
        });
        return decodeProtobuf(response.data, 'PlayerCSStats.proto', 'PlayerCSStats.response');
    }
}

async function searchAccountByKeyword(serverUrl, token, keyword) {
    const payload = await encodeProtobuf(
        { keyword: String(keyword) },
        'SearchAccountByName.proto',
        'SearchAccountByName.request'
    );

    const response = await axios.post(`${serverUrl}/FuzzySearchAccountByName`, payload, {
        headers: { ...BASE_HEADERS, 'Authorization': `Bearer ${token}` },
        responseType: 'arraybuffer',
        timeout: 20000,
        decompress: true
    });

    return decodeProtobuf(response.data, 'SearchAccountByName.proto', 'SearchAccountByName.response');
}

module.exports = { getPlayerPersonalShow, getPlayerStats, searchAccountByKeyword };
