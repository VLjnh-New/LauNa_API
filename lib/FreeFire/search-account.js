'use strict';
const { ACCOUNTS } = require('../../utils/freefire/config');
const { getGarenaToken, getMajorLogin } = require('../../utils/freefire/account');
const { searchAccountByKeyword } = require('../../utils/freefire/ingame');

module.exports = {
    name: '/freefire/search-account',
    index: async (req, res) => {
        const keyword = req.query.keyword;
        const server = (req.query.server || 'IND').toUpperCase();

        if (!keyword) {
            return res.status(400).json({
                status: false,
                message: "Thiếu tham số 'keyword'",
                example: '/freefire/search-account?keyword=Hello&server=IND'
            });
        }
        if (keyword.trim().length < 3) {
            return res.status(400).json({ status: false, message: "Keyword phải có ít nhất 3 ký tự" });
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

            const results = await searchAccountByKeyword(majorLogin.serverUrl, majorLogin.token, keyword);
            return res.json({ status: true, data: results });
        } catch (e) {
            const log = require('../../utils/logger');
            log(`[FF-SEARCH] lỗi: ${e.message}`, 'WARN');
            return res.status(500).json({ status: false, message: 'Lỗi tìm kiếm tài khoản FreeFire' });
        }
    }
};
