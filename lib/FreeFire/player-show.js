'use strict';
const { ACCOUNTS } = require('../../utils/freefire/config');
const { getGarenaToken, getMajorLogin } = require('../../utils/freefire/account');
const { getPlayerPersonalShow } = require('../../utils/freefire/ingame');

module.exports = {
    name: '/freefire/player-show',
    index: async (req, res) => {
        const uid = req.query.uid;
        const server = (req.query.server || 'IND').toUpperCase();
        const needGalleryInfo = ['true', '1', 'yes'].includes(String(req.query.need_gallery_info).toLowerCase());
        const needBlacklist = ['true', '1', 'yes'].includes(String(req.query.need_blacklist).toLowerCase());
        const needSparkInfo = ['true', '1', 'yes'].includes(String(req.query.need_spark_info).toLowerCase());
        const callSignSrc = parseInt(req.query.call_sign_src) || 7;

        if (!uid) {
            return res.status(400).json({
                status: false,
                message: "Thiếu tham số 'uid'",
                example: '/freefire/player-show?uid=1633864660&server=IND'
            });
        }
        if (!/^\d+$/.test(uid) || parseInt(uid) <= 0) {
            return res.status(400).json({ status: false, message: "UID phải là số nguyên dương hợp lệ" });
        }
        if (!ACCOUNTS[server]) {
            return res.status(400).json({ status: false, message: `Server '${server}' không hợp lệ. Các server có thể dùng: ${Object.keys(ACCOUNTS).join(', ')}` });
        }

        try {
            const acct = ACCOUNTS[server];
            const garenaToken = await getGarenaToken(acct.uid, acct.password);
            if (!garenaToken?.access_token) throw new Error('Xác thực Garena thất bại');

            const majorLogin = await getMajorLogin(garenaToken.access_token, garenaToken.open_id);
            if (!majorLogin?.token) throw new Error('Đăng nhập Major thất bại');

            const data = await getPlayerPersonalShow(
                majorLogin.serverUrl, majorLogin.token,
                uid, needGalleryInfo, callSignSrc, needBlacklist, needSparkInfo
            );
            return res.json({ status: true, data });
        } catch (e) {
            const log = require('../../utils/logger');
            log(`[FF-SHOW] lỗi: ${e.message}`, 'WARN');
            return res.status(500).json({ status: false, message: 'Lỗi lấy thông tin người chơi FreeFire' });
        }
    }
};
