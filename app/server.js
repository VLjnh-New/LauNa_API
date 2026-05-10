const router = require("express").Router();
const log = require("../utils/logger");
const { readdirSync, readFileSync } = require('fs-extra');
const path = require('path');
const _getIP = require('ipware')().get_ip;

let loadedRoutes = {};

function clientIp(req) {
    try {
        const cf = req.headers['cf-connecting-ip'];
        if (cf) return String(cf).trim();
        const xff = req.headers['x-forwarded-for'];
        if (xff) {
            const first = String(xff).split(',')[0].trim();
            if (first) return first;
        }
        const real = req.headers['x-real-ip'];
        if (real) return String(real).trim();
        if (req.ip) return req.ip;
        const info = _getIP(req);
        return info.clientIp || '';
    } catch {
        return req.ip || '';
    }
}

// Các route được miễn kiểm tra API key (giữ public, không động vào)
const APIKEY_BYPASS_PREFIXES = ['/download/all', '/music/scl-search', '/music/soundcloud', '/vps', '/note', '/vietqr', '/bank-lookup', '/fb-uid', '/ship-track', '/mst', '/lich-am', '/gia', '/random-vn', '/stats', '/shortener', '/s/', '/img-tool', '/ip-info', '/ai/media'];

function isApiKeyBypassed(routeName) {
    if (!routeName) return false;
    return APIKEY_BYPASS_PREFIXES.some(p => routeName === p || routeName.startsWith(p + '/'));
}

function wrapWithApiKey(handler, routeName) {
    if (isApiKeyBypassed(routeName)) return handler;
    return function (req, res, next) {
        try {
            const checkAPI = global.checkAPI;
            if (typeof checkAPI !== 'function') return handler(req, res, next);
            const key = req.query.apikey || req.headers['x-api-key'] || req.headers['apikey'] || req.body?.apikey;
            const result = checkAPI(key, clientIp(req));
            if (result && result.error) {
                return res.status(401).json({ status: false, message: result.msg || 'Yêu cầu API key.' });
            }
            return handler(req, res, next);
        } catch (e) {
            const log = require('../utils/logger');
            log(`[SERVER] xác thực API key lỗi: ${e.message}`, 'WARN');
            return res.status(500).json({ status: false, message: 'Lỗi xác thực API key' });
        }
    };
}

// Nếu route export params[] tường minh → dùng ngay. Không thì fallback regex scan.
const INTERNAL_PARAMS = new Set(['apikey', 'cf-turnstile-response', 'headers', 'body', 'res', 'req', 'next', 'err', 'e', 'cb', 'fn', 'ok', 'resolve', 'reject']);
function _extractParams(route, fileContent) {
    if (Array.isArray(route.params) && route.params.length > 0) {
        return route.params.filter(p => typeof p === 'string' && p.trim());
    }
    const matches = fileContent.match(/req\.query\.(\w+)/g);
    if (!matches) return [];
    return [...new Set(matches.map(p => p.replace('req.query.', '')).filter(p => !INTERNAL_PARAMS.has(p)))];
}

function loadRoute(filePath, category) {
    try {
        const fileContent = readFileSync(filePath, 'utf8');
        const route = require(filePath);

        if (route && route.helper === true) {
            return true;
        }

        if (route.name && route.index) {
            router.get(route.name, wrapWithApiKey(route.index, route.name));

            const params = _extractParams(route, fileContent);

            if (!loadedRoutes[category]) {
                loadedRoutes[category] = [];
            }
            loadedRoutes[category].push({
                name: route.name,
                params: params
            });
            return true;
        } else if (route.name && route.methods) {
            const params = _extractParams(route, fileContent);

            Object.keys(route.methods).forEach(method => {
                if (router[method]) {
                    router[method](route.name, wrapWithApiKey(route.methods[method], route.name));
                }
            });

            if (!loadedRoutes[category]) {
                loadedRoutes[category] = [];
            }
            loadedRoutes[category].push({
                name: route.name,
                params: params
            });
            return true;
        } else {
            log(`Lỗi: File ${filePath} không có cấu trúc hợp lệ (thiếu name hoặc index)`, 'ERROR');
            return false;
        }
    } catch (error) {
        log(`Lỗi khi load file ${filePath}: ${error.message}`, 'ERROR');
        return false;
    }
}

try {
    let n = 0;
    let srcPath = path.join(process.cwd(), "/lib/");
    
    // Load các file trực tiếp trong thư mục lib
    const hosting = readdirSync(srcPath).filter((file) => file.endsWith(".js"));
    for (let file of hosting) {
        if (loadRoute(path.join(srcPath, file), 'Khác')) n++;
    }

    // Các file nội bộ, KHÔNG mount như API public (mount tay ở main.js nếu cần)
    const INTERNAL_FILES = new Set(['AI/support.js', 'Key/getkey.js']);

    // Load các file trong các thư mục con
    const getDirs = readdirSync(srcPath).filter((file) => !file.endsWith(".js") && !file.endsWith(".json"));
    for (let dir of getDirs) {
        const dirPath = path.join(srcPath, dir);
        const files = readdirSync(dirPath).filter((file) => file.endsWith(".js") && file !== 'main.js');
        for (let file of files) {
            if (INTERNAL_FILES.has(`${dir}/${file}`)) continue;
            if (loadRoute(path.join(dirPath, file), dir)) n++;
        }
    }

    log(`Đã load thành công ${n} file`, 'API');
} catch (e) {
    log(`Lỗi khi đọc thư mục lib: ${e.message}`, 'ERROR');
}

module.exports = { router, loadedRoutes };
