'use strict';
const crypto = require('crypto');
const path = require('path');
const protobuf = require('protobufjs');
const { MAIN_KEY, MAIN_IV } = require('./config');

const PROTO_DIR = path.join(__dirname, '../../lib/FreeFire/proto');

const rootCache = {};

async function getRoot(protoFile) {
    if (rootCache[protoFile]) return rootCache[protoFile];
    const root = await protobuf.load(path.join(PROTO_DIR, protoFile));
    rootCache[protoFile] = root;
    return root;
}

function aesCbcEncrypt(data) {
    const blockSize = 16;
    const padLen = blockSize - (data.length % blockSize);
    const padded = Buffer.concat([data, Buffer.alloc(padLen, padLen)]);
    const cipher = crypto.createCipheriv('aes-128-cbc', MAIN_KEY, MAIN_IV);
    cipher.setAutoPadding(false);
    return Buffer.concat([cipher.update(padded), cipher.final()]);
}

function aesCbcDecrypt(data) {
    const buf = Buffer.from(data);
    if (buf.length === 0 || buf.length % 16 !== 0) return null;
    try {
        const decipher = crypto.createDecipheriv('aes-128-cbc', MAIN_KEY, MAIN_IV);
        decipher.setAutoPadding(true);
        return Buffer.concat([decipher.update(buf), decipher.final()]);
    } catch (e) {
        return null;
    }
}

async function encodeProtobuf(data, protoFile, messageName) {
    const root = await getRoot(protoFile);
    const MsgType = root.lookupType(messageName);
    const errMsg = MsgType.verify(data);
    if (errMsg) throw new Error(`Protobuf verify error: ${errMsg}`);
    const message = MsgType.create(data);
    const encoded = MsgType.encode(message).finish();
    return aesCbcEncrypt(Buffer.from(encoded));
}

async function decodeProtobuf(data, protoFile, messageName) {
    const root = await getRoot(protoFile);
    const MsgType = root.lookupType(messageName);

    const raw = Buffer.from(data);

    const decrypted = aesCbcDecrypt(raw);
    const buf = decrypted !== null ? decrypted : raw;

    const message = MsgType.decode(buf);
    return MsgType.toObject(message, {
        longs: String,
        enums: String,
        bytes: String,
        defaults: false,
        arrays: true,
        objects: true,
        oneofs: true
    });
}

module.exports = { encodeProtobuf, decodeProtobuf };
