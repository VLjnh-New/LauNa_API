'use strict';

/**
 * /random-vn — Sinh profile Việt Nam giả lập:
 *   - Họ tên đệm + tên (theo giới tính)
 *   - Ngày sinh trong khoảng tuổi
 *   - CCCD 12 số đúng format (3 mã tỉnh + 1 giới tính/thế kỷ + 2 năm + 6 random)
 *   - SĐT 10 số theo đầu số nhà mạng VN
 *   - Email gợi ý
 *   - Tỉnh / thành phố
 *
 * Cách dùng:
 *   /random-vn                       (1 profile, random gender)
 *   /random-vn?gender=nam&age=22-30&n=10
 *   /random-vn?tinh=hanoi&n=5
 */

const data = require('../../data/vn-names');

const DAU_SO = ['032', '033', '034', '035', '036', '037', '038', '039',
                '070', '076', '077', '078', '079',
                '081', '082', '083', '084', '085', '086', '088', '089',
                '090', '091', '092', '093', '094', '096', '097', '098', '099'];

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function randInt(a, b) { return a + Math.floor(Math.random() * (b - a + 1)); }
function pad(n, w) { return String(n).padStart(w, '0'); }

function ascii(s) {
    return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D');
}

function genCCCD(provinceCode, gender, year) {
    // Format: PPP G YY NNNNNN
    // G: 0=nam thế kỷ XX, 1=nữ thế kỷ XX, 2=nam XXI, 3=nữ XXI, 4=nam XXII, 5=nữ XXII
    let g;
    if (year < 2000) g = gender === 'nam' ? 0 : 1;
    else if (year < 2100) g = gender === 'nam' ? 2 : 3;
    else g = gender === 'nam' ? 4 : 5;
    const yy = pad(year % 100, 2);
    const rand = pad(randInt(0, 999999), 6);
    return `${provinceCode}${g}${yy}${rand}`;
}

function genPhone() {
    return pick(DAU_SO) + pad(randInt(0, 9999999), 7);
}

function genOne(opts) {
    const gender = opts.gender === 'nam' || opts.gender === 'nu' ? opts.gender : (Math.random() < 0.5 ? 'nam' : 'nu');
    const ho = pick(data.holst);
    const dem = gender === 'nam' ? pick(data.demNam) : pick(data.demNu);
    const ten = gender === 'nam' ? pick(data.tenNam) : pick(data.tenNu);
    const fullName = `${ho} ${dem} ${ten}`;

    const now = new Date();
    const minAge = opts.minAge || 18, maxAge = opts.maxAge || 45;
    const year = now.getFullYear() - randInt(minAge, maxAge);
    const month = randInt(1, 12);
    const lastDay = new Date(year, month, 0).getDate();
    const day = randInt(1, lastDay);
    const dob = `${pad(day, 2)}/${pad(month, 2)}/${year}`;

    const tinh = opts.tinh ? (data.tinh.find(t => ascii(t.name).toLowerCase().includes(ascii(opts.tinh).toLowerCase())) || pick(data.tinh)) : pick(data.tinh);
    const cccd = genCCCD(tinh.code, gender, year);
    const phone = genPhone();
    const username = (ascii(ten).toLowerCase() + ascii(dem).toLowerCase().slice(0, 1) + ascii(ho).toLowerCase().slice(0, 2) + randInt(10, 9999));
    const email = `${username}@gmail.com`;

    return {
        gender, fullName,
        ho, ten: `${dem} ${ten}`,
        dob, age: now.getFullYear() - year,
        cccd, phone, email, username,
        tinh: tinh.name, tinhCode: tinh.code, region: tinh.region
    };
}

function parseAge(s) {
    if (!s) return [18, 45];
    const m = String(s).match(/^(\d+)\s*-\s*(\d+)$/);
    if (m) return [Math.max(0, +m[1]), Math.min(100, +m[2])];
    const single = parseInt(s, 10);
    if (!Number.isNaN(single)) return [single, single];
    return [18, 45];
}

module.exports = {
    name: '/random-vn',
    index: async (req, res) => {
        const n = Math.min(50, Math.max(1, parseInt(req.query.n || req.query.count || '1', 10) || 1));
        const [minAge, maxAge] = parseAge(req.query.age);
        const opts = {
            gender: (req.query.gender || '').toString().toLowerCase(),
            tinh: (req.query.tinh || req.query.province || '').toString().trim(),
            minAge, maxAge
        };

        const list = [];
        for (let i = 0; i < n; i++) list.push(genOne(opts));

        return res.json({
            status: true,
            count: list.length,
            data: n === 1 ? list[0] : list,
            note: 'Dữ liệu RANDOM dùng cho test/dev. Không phải thông tin người thật.'
        });
    }
};
