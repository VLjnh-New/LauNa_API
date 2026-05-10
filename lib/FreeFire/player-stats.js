'use strict';
const { ACCOUNTS } = require('../../utils/freefire/config');
const { getGarenaToken, getMajorLogin } = require('../../utils/freefire/account');
const { getPlayerStats } = require('../../utils/freefire/ingame');

module.exports = {
    name: '/freefire/player-stats',
    index: async (req, res) => {
        const uid = req.query.uid;
        const server = (req.query.server || 'IND').toUpperCase();
        const gamemode = (req.query.gamemode || 'br').toLowerCase();
        const matchmode = (req.query.matchmode || 'CAREER').toUpperCase();

        if (!uid) {
            return res.status(400).json({
                status: false,
                message: "Thiếu tham số 'uid'",
                example: '/freefire/player-stats?uid=11959685790&server=IND&gamemode=br&matchmode=RANKED'
            });
        }
        if (!/^\d+$/.test(uid)) {
            return res.status(400).json({ status: false, message: "UID phải là số nguyên hợp lệ" });
        }
        if (!ACCOUNTS[server]) {
            return res.status(400).json({ status: false, message: `Server '${server}' không hợp lệ. Các server có thể dùng: ${Object.keys(ACCOUNTS).join(', ')}` });
        }
        if (!['br', 'cs'].includes(gamemode)) {
            return res.status(400).json({ status: false, message: "gamemode phải là 'br' hoặc 'cs'" });
        }
        if (!['CAREER', 'NORMAL', 'RANKED'].includes(matchmode)) {
            return res.status(400).json({ status: false, message: "matchmode phải là 'CAREER', 'NORMAL' hoặc 'RANKED'" });
        }

        try {
            const acct = ACCOUNTS[server];
            const garenaToken = await getGarenaToken(acct.uid, acct.password);
            if (!garenaToken?.access_token) throw new Error('Xác thực Garena thất bại');

            const majorLogin = await getMajorLogin(garenaToken.access_token, garenaToken.open_id);
            if (!majorLogin?.token) throw new Error('Đăng nhập Major thất bại');

            const stats = await getPlayerStats(majorLogin.token, majorLogin.serverUrl, gamemode, uid, matchmode);
            return res.json({ status: true, data: stats, metadata: { server, uid, gamemode, matchmode } });
        } catch (e) {
            const log = require('../../utils/logger');
            log(`[FF-STATS] lỗi: ${e.message}`, 'WARN');
            return res.status(500).json({ status: false, message: 'Lỗi lấy thống kê FreeFire' });
        }
    }
};
