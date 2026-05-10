'use strict';

/**
 * Lịch âm Việt Nam — thuật toán Hồ Ngọc Đức
 * (https://www.informatik.uni-leipzig.de/~duc/amlich/calrules.html)
 *
 * Múi giờ chuẩn UTC+7 cho Việt Nam.
 */

const TIMEZONE = 7.0;
const PI = Math.PI;

// Julian Day Number cho ngày dương dd/mm/yyyy
function jdFromDate(dd, mm, yy) {
    const a = Math.floor((14 - mm) / 12);
    const y = yy + 4800 - a;
    const m = mm + 12 * a - 3;
    let jd = dd + Math.floor((153 * m + 2) / 5) + 365 * y + Math.floor(y / 4) - Math.floor(y / 100) + Math.floor(y / 400) - 32045;
    if (jd < 2299161) {
        jd = dd + Math.floor((153 * m + 2) / 5) + 365 * y + Math.floor(y / 4) - 32083;
    }
    return jd;
}

function jdToDate(jd) {
    let a, b, c;
    if (jd > 2299160) {
        a = jd + 32044;
        b = Math.floor((4 * a + 3) / 146097);
        c = a - Math.floor((b * 146097) / 4);
    } else {
        b = 0;
        c = jd + 32082;
    }
    const d = Math.floor((4 * c + 3) / 1461);
    const e = c - Math.floor((1461 * d) / 4);
    const m = Math.floor((5 * e + 2) / 153);
    const day = e - Math.floor((153 * m + 2) / 5) + 1;
    const month = m + 3 - 12 * Math.floor(m / 10);
    const year = b * 100 + d - 4800 + Math.floor(m / 10);
    return [day, month, year];
}

function NewMoon(k) {
    const T = k / 1236.85;
    const T2 = T * T;
    const T3 = T2 * T;
    const dr = PI / 180;
    let Jd1 = 2415020.75933 + 29.53058868 * k + 0.0001178 * T2 - 0.000000155 * T3;
    Jd1 = Jd1 + 0.00033 * Math.sin((166.56 + 132.87 * T - 0.009173 * T2) * dr);
    const M = 359.2242 + 29.10535608 * k - 0.0000333 * T2 - 0.00000347 * T3;
    const Mpr = 306.0253 + 385.81691806 * k + 0.0107306 * T2 + 0.00001236 * T3;
    const F = 21.2964 + 390.67050646 * k - 0.0016528 * T2 - 0.00000239 * T3;
    let C1 = (0.1734 - 0.000393 * T) * Math.sin(M * dr) + 0.0021 * Math.sin(2 * dr * M);
    C1 = C1 - 0.4068 * Math.sin(Mpr * dr) + 0.0161 * Math.sin(dr * 2 * Mpr);
    C1 = C1 - 0.0004 * Math.sin(dr * 3 * Mpr);
    C1 = C1 + 0.0104 * Math.sin(dr * 2 * F) - 0.0051 * Math.sin(dr * (M + Mpr));
    C1 = C1 - 0.0074 * Math.sin(dr * (M - Mpr)) + 0.0004 * Math.sin(dr * (2 * F + M));
    C1 = C1 - 0.0004 * Math.sin(dr * (2 * F - M)) - 0.0006 * Math.sin(dr * (2 * F + Mpr));
    C1 = C1 + 0.0010 * Math.sin(dr * (2 * F - Mpr)) + 0.0005 * Math.sin(dr * (2 * Mpr + M));
    let deltat;
    if (T < -11) deltat = 0.001 + 0.000839 * T + 0.0002261 * T2 - 0.00000845 * T3 - 0.000000081 * T * T3;
    else deltat = -0.000278 + 0.000265 * T + 0.000262 * T2;
    const JdNew = Jd1 + C1 - deltat;
    return JdNew;
}

function SunLongitude(jdn) {
    const T = (jdn - 2451545.0) / 36525;
    const T2 = T * T;
    const dr = PI / 180;
    const M = 357.52910 + 35999.05030 * T - 0.0001559 * T2 - 0.00000048 * T * T2;
    const L0 = 280.46645 + 36000.76983 * T + 0.0003032 * T2;
    let DL = (1.914600 - 0.004817 * T - 0.000014 * T2) * Math.sin(dr * M);
    DL = DL + (0.019993 - 0.000101 * T) * Math.sin(dr * 2 * M) + 0.000290 * Math.sin(dr * 3 * M);
    let L = L0 + DL;
    L = L * dr;
    L = L - PI * 2 * Math.floor(L / (PI * 2));
    return L;
}

function getSunLongitude(dayNumber, timeZone) {
    return Math.floor(SunLongitude(dayNumber - 0.5 - timeZone / 24) / PI * 6);
}

function getNewMoonDay(k, timeZone) {
    return Math.floor(NewMoon(k) + 0.5 + timeZone / 24);
}

function getLunarMonth11(yy, timeZone) {
    const off = jdFromDate(31, 12, yy) - 2415021;
    const k = Math.floor(off / 29.530588853);
    let nm = getNewMoonDay(k, timeZone);
    const sunLong = getSunLongitude(nm, timeZone);
    if (sunLong >= 9) nm = getNewMoonDay(k - 1, timeZone);
    return nm;
}

function getLeapMonthOffset(a11, timeZone) {
    const k = Math.floor((a11 - 2415021.076998695) / 29.530588853 + 0.5);
    let last = 0;
    let i = 1;
    let arc = getSunLongitude(getNewMoonDay(k + i, timeZone), timeZone);
    do {
        last = arc;
        i++;
        arc = getSunLongitude(getNewMoonDay(k + i, timeZone), timeZone);
    } while (arc !== last && i < 14);
    return i - 1;
}

function convertSolar2Lunar(dd, mm, yy, timeZone = TIMEZONE) {
    const dayNumber = jdFromDate(dd, mm, yy);
    const k = Math.floor((dayNumber - 2415021.076998695) / 29.530588853);
    let monthStart = getNewMoonDay(k + 1, timeZone);
    if (monthStart > dayNumber) monthStart = getNewMoonDay(k, timeZone);
    let a11 = getLunarMonth11(yy, timeZone);
    let b11 = a11;
    let lunarYear;
    if (a11 >= monthStart) {
        lunarYear = yy;
        a11 = getLunarMonth11(yy - 1, timeZone);
    } else {
        lunarYear = yy + 1;
        b11 = getLunarMonth11(yy + 1, timeZone);
    }
    const lunarDay = dayNumber - monthStart + 1;
    const diff = Math.floor((monthStart - a11) / 29);
    let lunarLeap = 0;
    let lunarMonth = diff + 11;
    if (b11 - a11 > 365) {
        const leapMonthDiff = getLeapMonthOffset(a11, timeZone);
        if (diff >= leapMonthDiff) {
            lunarMonth = diff + 10;
            if (diff === leapMonthDiff) lunarLeap = 1;
        }
    }
    if (lunarMonth > 12) lunarMonth -= 12;
    if (lunarMonth >= 11 && diff < 4) lunarYear -= 1;
    return { day: lunarDay, month: lunarMonth, year: lunarYear, leap: lunarLeap };
}

const CAN = ['Giáp', 'Ất', 'Bính', 'Đinh', 'Mậu', 'Kỷ', 'Canh', 'Tân', 'Nhâm', 'Quý'];
const CHI = ['Tý', 'Sửu', 'Dần', 'Mão', 'Thìn', 'Tỵ', 'Ngọ', 'Mùi', 'Thân', 'Dậu', 'Tuất', 'Hợi'];
const THANG_AM = ['Một (Giêng)', 'Hai', 'Ba', 'Tư', 'Năm', 'Sáu', 'Bảy', 'Tám', 'Chín', 'Mười', 'Mười một (Một)', 'Mười hai (Chạp)'];
const THU = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];

function canChiNgay(jd) {
    return CAN[(jd + 9) % 10] + ' ' + CHI[(jd + 1) % 12];
}
function canChiThang(month, year) {
    return CAN[(year * 12 + month + 3) % 10] + ' ' + CHI[(month + 1) % 12];
}
function canChiNam(year) {
    return CAN[(year + 6) % 10] + ' ' + CHI[(year + 8) % 12];
}
function canChiGio(jd) {
    // Trả 12 giờ (mỗi 2 tiếng dương = 1 giờ âm)
    const chiHour = ['Tý (23h-1h)', 'Sửu (1h-3h)', 'Dần (3h-5h)', 'Mão (5h-7h)', 'Thìn (7h-9h)', 'Tỵ (9h-11h)', 'Ngọ (11h-13h)', 'Mùi (13h-15h)', 'Thân (15h-17h)', 'Dậu (17h-19h)', 'Tuất (19h-21h)', 'Hợi (21h-23h)'];
    const canStart = (jd - 1) * 2 % 10;
    return chiHour.map((h, i) => CAN[(canStart + i) % 10] + ' ' + h);
}

// Giờ hoàng đạo theo chi của ngày
const GIO_HOANG_DAO_MAP = {
    'Tý':  ['Tý', 'Sửu', 'Mão', 'Ngọ', 'Thân', 'Dậu'],
    'Sửu': ['Dần', 'Mão', 'Tỵ', 'Thân', 'Tuất', 'Hợi'],
    'Dần': ['Tý', 'Sửu', 'Thìn', 'Tỵ', 'Mùi', 'Tuất'],
    'Mão': ['Tý', 'Dần', 'Mão', 'Ngọ', 'Mùi', 'Dậu'],
    'Thìn': ['Dần', 'Thìn', 'Tỵ', 'Thân', 'Dậu', 'Hợi'],
    'Tỵ':  ['Sửu', 'Thìn', 'Ngọ', 'Mùi', 'Tuất', 'Hợi'],
    'Ngọ': ['Tý', 'Sửu', 'Mão', 'Ngọ', 'Thân', 'Dậu'],
    'Mùi': ['Dần', 'Mão', 'Tỵ', 'Thân', 'Tuất', 'Hợi'],
    'Thân': ['Tý', 'Sửu', 'Thìn', 'Tỵ', 'Mùi', 'Tuất'],
    'Dậu': ['Tý', 'Dần', 'Mão', 'Ngọ', 'Mùi', 'Dậu'],
    'Tuất': ['Dần', 'Thìn', 'Tỵ', 'Thân', 'Dậu', 'Hợi'],
    'Hợi': ['Sửu', 'Thìn', 'Ngọ', 'Mùi', 'Tuất', 'Hợi']
};

function gioHoangDao(chiNgay) {
    const chiList = GIO_HOANG_DAO_MAP[chiNgay] || [];
    const map = { 'Tý': '23h-1h', 'Sửu': '1h-3h', 'Dần': '3h-5h', 'Mão': '5h-7h', 'Thìn': '7h-9h', 'Tỵ': '9h-11h', 'Ngọ': '11h-13h', 'Mùi': '13h-15h', 'Thân': '15h-17h', 'Dậu': '17h-19h', 'Tuất': '19h-21h', 'Hợi': '21h-23h' };
    return chiList.map(c => `${c} (${map[c]})`);
}

// Trực và sao trong ngày — đơn giản hoá: ngày tốt/xấu theo can chi
const NGAY_TOT_XAU = {
    'Giáp': 'Tốt', 'Ất': 'Bình', 'Bính': 'Tốt', 'Đinh': 'Bình', 'Mậu': 'Trung bình',
    'Kỷ': 'Xấu', 'Canh': 'Bình', 'Tân': 'Tốt', 'Nhâm': 'Tốt', 'Quý': 'Xấu'
};

function fullInfo(dd, mm, yy) {
    const jd = jdFromDate(dd, mm, yy);
    const lunar = convertSolar2Lunar(dd, mm, yy);
    const dow = (jd + 1) % 7;
    const ccNgay = canChiNgay(jd);
    const chiNgay = ccNgay.split(' ')[1];
    const ccThang = canChiThang(lunar.month, lunar.year);
    const ccNam = canChiNam(lunar.year);
    const danhGia = NGAY_TOT_XAU[ccNgay.split(' ')[0]] || 'Trung bình';

    return {
        duong: { ngay: dd, thang: mm, nam: yy, thu: THU[dow] },
        am: {
            ngay: lunar.day, thang: lunar.month, nam: lunar.year,
            thangNhuan: !!lunar.leap,
            tenThang: THANG_AM[lunar.month - 1] + (lunar.leap ? ' (nhuận)' : '')
        },
        canChi: {
            ngay: ccNgay,
            thang: ccThang,
            nam: ccNam
        },
        gioHoangDao: gioHoangDao(chiNgay),
        danhGia,
        gioCanChi: canChiGio(jd)
    };
}

module.exports = { convertSolar2Lunar, jdFromDate, jdToDate, fullInfo };
