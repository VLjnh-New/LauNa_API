'use strict';

const order = { debug: 0, info: 1, warn: 2, error: 3 };
let currentLevel = 'info';

function setLogLevel(level) {
    if (order[level] !== undefined) currentLevel = level;
}

function ts() {
    return new Date().toISOString().replace('T', ' ').replace('Z', '');
}

function log(level, color, args) {
    if (order[level] < order[currentLevel]) return;
    const tag = `\x1b[${color}m${level.toUpperCase()}\x1b[0m`;
    console.log(`[${ts()}] [SHIELD] ${tag}`, ...args);
}

const logger = {
    debug: (...a) => log('debug', '90', a),
    info:  (...a) => log('info',  '36', a),
    warn:  (...a) => log('warn',  '33', a),
    error: (...a) => log('error', '31', a),
};

module.exports = { logger, setLogLevel };
