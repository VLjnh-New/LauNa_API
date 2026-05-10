'use strict';

/**
 * Shared fetcher + cache cho Liên Quân (Arena of Valor) data từ arenaofvalor.fandom.com
 * MediaWiki API — public, không cần key, có gzip.
 */

const axios = require('axios');

const WIKI = 'https://arenaofvalor.fandom.com/api.php';
const HEADERS = {
    'User-Agent': 'LauNa-API/1.0 (lienquan-tool)',
    'Accept-Encoding': 'gzip, deflate'
};
const TIMEOUT = 15000;

const TTL = {
    heroes: 24 * 60 * 60 * 1000,
    hero: 12 * 60 * 60 * 1000,
    image: 7 * 24 * 60 * 60 * 1000
};

const cache = {
    heroes: { at: 0, data: null },
    hero: new Map(),
    image: new Map()
};

const EXCLUDE_NAMES = new Set([
    'Heroes', 'Hero', 'Hero List', 'Old Heroes', 'Upcoming Heroes',
    'List of Heroes', 'Beginner Heroes'
]);
const EXCLUDE_PREFIX = ['Category:', 'Template:', 'File:', 'User:'];

function isExcluded(t) {
    if (!t) return true;
    if (EXCLUDE_NAMES.has(t)) return true;
    if (/\(Old\)/i.test(t)) return true;
    if (EXCLUDE_PREFIX.some(p => t.startsWith(p))) return true;
    return false;
}

async function wiki(params) {
    const res = await axios.get(WIKI, {
        params: { format: 'json', ...params },
        headers: HEADERS,
        timeout: TIMEOUT,
        decompress: true
    });
    return res.data;
}

async function fetchHeroList() {
    const titles = [];
    let cont = null;
    do {
        const data = await wiki({
            action: 'query',
            list: 'categorymembers',
            cmtitle: 'Category:Heroes',
            cmlimit: 500,
            ...(cont ? { cmcontinue: cont } : {})
        });
        const members = data?.query?.categorymembers || [];
        for (const m of members) {
            if (m.ns === 0 && !isExcluded(m.title)) titles.push(m.title);
        }
        cont = data?.continue?.cmcontinue || null;
    } while (cont);
    return [...new Set(titles)].sort((a, b) => a.localeCompare(b));
}

async function getHeroList(force = false) {
    const now = Date.now();
    if (!force && cache.heroes.data && now - cache.heroes.at < TTL.heroes) {
        return cache.heroes.data;
    }
    const list = await fetchHeroList();
    cache.heroes = { at: now, data: list };
    return list;
}

// ─── Image URL resolver via MediaWiki imageinfo (CDN URL thật, không bị Cloudflare chặn) ──

async function resolveImages(files) {
    const out = {};
    const need = [];
    const now = Date.now();
    for (const f of files) {
        if (!f) continue;
        const key = f.replace(/_/g, ' ').trim();
        const c = cache.image.get(key);
        if (c && now - c.at < TTL.image) out[key] = c.url;
        else need.push(key);
    }
    if (!need.length) return out;
    // Batch tối đa 50 file/lần
    for (let i = 0; i < need.length; i += 50) {
        const chunk = need.slice(i, i + 50);
        const titles = chunk.map(f => 'File:' + f).join('|');
        try {
            const data = await wiki({
                action: 'query',
                titles,
                prop: 'imageinfo',
                iiprop: 'url|size'
            });
            const pages = data?.query?.pages || {};
            for (const p of Object.values(pages)) {
                if (!p.title) continue;
                const k = p.title.replace(/^File:/, '');
                const url = p.imageinfo?.[0]?.url || null;
                if (url) {
                    cache.image.set(k, { at: now, url });
                    out[k] = url;
                }
            }
        } catch (_) { /* bỏ qua */ }
    }
    return out;
}

// ─── Wikitext parsers ────────────────────────────────────────────────────────

const INFOBOX_RE = /\{\{\s*(?:HeroInformationBox\d*|Hero\s+infobox)/i;

function parseInfobox(wikitext) {
    const candidates = [];
    const re = new RegExp(INFOBOX_RE.source, 'gi');
    let m;
    while ((m = re.exec(wikitext)) !== null) {
        const tail = wikitext.slice(m.index);
        let endRel = tail.search(/\n\}\}/);
        if (endRel < 0) endRel = tail.search(/\}\}/); // hỗ trợ infobox 1 dòng
        const sliceEnd = endRel > 0 ? endRel + 3 : Math.min(tail.length, 4000);
        candidates.push(tail.slice(0, sliceEnd));
    }
    if (!candidates.length) return null;
    candidates.sort((a, b) =>
        (b.match(/\n\s*\|\s*\w+\s*=/g) || []).length -
        (a.match(/\n\s*\|\s*\w+\s*=/g) || []).length
    );
    const block = candidates[0];

    const fields = {};
    const inner = block
        .replace(INFOBOX_RE, '')
        .replace(/^[^\n|]*/, '')
        .replace(/\n\}\}[\s\S]*$/, '')
        .replace(/\}\}\s*$/, '');
    // Hỗ trợ cả dạng nhiều dòng `\n|key=val` lẫn dạng một dòng `|k=v|k=v`
    const parts = inner.includes('\n|') || /\n\s*\|/.test(inner)
        ? inner.split(/\n\s*\|/)
        : inner.split(/\s*\|\s*/);
    for (const p of parts) {
        const eq = p.indexOf('=');
        if (eq < 0) continue;
        const k = p.slice(0, eq).trim();
        let v = p.slice(eq + 1).trim();
        if (!k) continue;
        v = v.replace(/<!--[\s\S]*?-->/g, '').trim();
        fields[k] = v;
        fields[k.toLowerCase()] = v;
    }
    return fields;
}

function pickField(ib, ...keys) {
    if (!ib) return '';
    for (const k of keys) {
        if (ib[k] != null && ib[k] !== '') return ib[k];
        const lk = k.toLowerCase();
        if (ib[lk] != null && ib[lk] !== '') return ib[lk];
    }
    return '';
}

function cleanWikiText(s) {
    if (!s) return '';
    return s
        .replace(/<ref[\s\S]*?<\/ref>/gi, '')
        .replace(/<ref[^/]*\/>/gi, '')
        .replace(/\{\{[^{}]*\}\}/g, '')
        .replace(/\[\[(?:[^|\]]+\|)?([^\]]+)\]\]/g, '$1')
        .replace(/'''([^']+)'''/g, '$1')
        .replace(/''([^']+)''/g, '$1')
        .replace(/<br\s*\/?>/gi, ' ')
        .replace(/<[^>]+>/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

function num(s) {
    if (!s) return null;
    const m = String(s).match(/-?\d+(\.\d+)?/);
    return m ? Number(m[0]) : null;
}

// Skill parser linh hoạt — quét cả section ==Skills== / ==Abilities==
function parseSkills(wikitext) {
    const m = wikitext.match(/==\s*(?:Skills?|Abilities)\s*==([\s\S]*?)(?:\n==[^=]|\n\{\{|\Z)/i);
    if (!m) return [];
    const block = m[1];

    const skills = [];
    const seen = new Set();

    // Format A: `[[File:X.png|...]]||Name||description...` (Capheny, kiểu inline `||`)
    const reA = /\[\[File:([^\|\]]+\.(?:png|jpg|jpeg|gif|webp))[^\]]*\]\]\s*\|\|\s*'?'?'?([A-Za-z][^|\n]{0,40}?)'?'?'?\s*\|\|\s*([\s\S]+?)(?=\n\|\s*[A-Z][^\n]*\|\||\n\|\}|\n\|-|\n!\s*[A-Z])/g;
    let r;
    while ((r = reA.exec(block)) !== null) {
        const icon = r[1].trim();
        const name = cleanWikiText(r[2]);
        const desc = cleanWikiText(r[3]).slice(0, 600);
        if (!name || seen.has(name.toLowerCase()) || desc.length < 15) continue;
        seen.add(name.toLowerCase());
        skills.push({ name, icon, description: desc });
        if (skills.length >= 6) break;
    }

    // Format B: bảng có rowspan/colspan (Tulen, Wukong)
    //   | rowspan="4" |[[File:X.png|...]]
    //   | rowspan="4" align="center" |[[Name|'''Name''']]
    //   | colspan="7" | description
    if (skills.length < 4) {
        const reB = /\[\[File:([^\|\]]+\.(?:png|jpg|jpeg|gif|webp))[^\]]*\]\][\s\S]{0,250}?\[\[([^\]\|]+)(?:\|[^\]]+)?\]\][\s\S]{0,120}?\|\s*(?:colspan="?\d+"?\s*\|\s*)?([^\n|][^\n]{15,})/gi;
        let q;
        while ((q = reB.exec(block)) !== null) {
            const icon = q[1].trim();
            const name = cleanWikiText(q[2]);
            const desc = cleanWikiText(q[3]).slice(0, 600);
            if (!name || seen.has(name.toLowerCase()) || desc.length < 15) continue;
            seen.add(name.toLowerCase());
            skills.push({ name, icon, description: desc });
            if (skills.length >= 6) break;
        }
    }

    return skills;
}

// Lấy đoạn intro (dòng đầu trước section đầu tiên)
function parseIntro(wikitext) {
    // Heuristic: lấy đoạn nằm SAU lần `\n}}\n` đầu tiên (kết thúc infobox)
    let s = wikitext;
    const closeIdx = s.indexOf('\n}}\n');
    if (closeIdx > 0) s = s.slice(closeIdx + 4);
    s = stripTemplates(s);
    const beforeSection = s.split(/\n==/)[0] || '';
    // Lấy câu chứa "is one of the Heroes" hoặc câu đầu tiên có nội dung
    const sentences = beforeSection.split(/(?<=[\.!?])\s+/);
    const meaningful = sentences.find(t => /[A-Z][a-z]/.test(t) && t.length > 30) || beforeSection;
    const txt = cleanWikiText(meaningful);
    if (!txt) return '';
    return txt.length > 280 ? txt.slice(0, 277) + '…' : txt;
}

// Bóc tất cả {{...}} cấp ngoài cùng (xử lý lồng + thiếu đóng)
function stripTemplates(s) {
    let out = '';
    let depth = 0;
    for (let i = 0; i < s.length; i++) {
        if (s[i] === '{' && s[i + 1] === '{') { depth++; i++; continue; }
        if (s[i] === '}' && s[i + 1] === '}' && depth > 0) { depth--; i++; continue; }
        if (depth === 0) out += s[i];
    }
    return out;
}

// Lấy section ==Lore== / ==Background== / ==Story==
function parseLore(wikitext) {
    const m = wikitext.match(/==\s*(?:Lore|Background|Story|Biography)\s*==([\s\S]*?)(?:\n==[^=]|\Z)/i);
    if (!m) return '';
    const txt = cleanWikiText(m[1]);
    if (!txt) return '';
    return txt.length > 600 ? txt.slice(0, 597) + '…' : txt;
}

// Profile (DOB, nơi sinh, chiều cao, tuổi…) — section ==Profile==
function parseProfile(wikitext) {
    const m = wikitext.match(/==\s*Profile\s*==([\s\S]*?)(?:\n==[^=]|\Z)/i);
    if (!m) return null;
    const out = {};
    const lines = m[1].split('\n');
    for (const ln of lines) {
        const mm = ln.match(/^[\*\s]*'?'?'?([A-Za-z][A-Za-z\s]+?)'?'?'?\s*[:\-–]\s*(.+?)\s*$/);
        if (!mm) continue;
        const key = mm[1].trim().toLowerCase();
        const val = cleanWikiText(mm[2]);
        if (!val || val.length > 200) continue;
        if (/birth.*date|date.*birth|dob/.test(key)) out.dateOfBirth = val;
        else if (/birth.*place|place.*birth|hometown|origin/.test(key)) out.placeOfBirth = val;
        else if (/height/.test(key)) out.height = val;
        else if (/weight/.test(key)) out.weight = val;
        else if (/age/.test(key)) out.age = val;
        else if (/gender|sex/.test(key)) out.gender = val;
        else if (/race|species/.test(key)) out.race = val;
        else if (/occupation|job/.test(key)) out.occupation = val;
        else if (/affiliation|faction|group/.test(key)) out.affiliation = val;
    }
    return Object.keys(out).length ? out : null;
}

async function buildHero(name, wikitext) {
    const ib = parseInfobox(wikitext) || {};

    const captionRaw = cleanWikiText(pickField(ib, 'caption'));
    const KNOWN_CLASSES = ['Warrior', 'Tank', 'Assassin', 'Mage', 'Marksman', 'Support'];
    let cls = cleanWikiText(pickField(ib, 'Class', 'class', 'type'));
    if (!cls && KNOWN_CLASSES.some(c => new RegExp('\\b' + c + '\\b', 'i').test(captionRaw))) {
        cls = captionRaw;
    }
    // Fallback cuối: tìm trong intro "classified in the category of warrior"
    if (!cls) {
        const introM = wikitext.match(/category of\s+([a-z\/, ]+?)[\.\n]/i)
            || wikitext.match(/\bis a[n]?\s+([A-Z][a-z]+(?:\s*\/\s*[A-Z][a-z]+)?)\s+(?:hero|champion)/);
        if (introM) cls = introM[1].trim();
    }

    const role = cleanWikiText(pickField(ib, 'Role', 'role'));
    const tagline = captionRaw && captionRaw !== cls ? captionRaw : '';

    const stats = {
        hp: num(pickField(ib, 'Maxhp', 'maxhp')),
        armor: num(pickField(ib, 'Armor', 'armor')),
        magicDefense: num(pickField(ib, 'Magicdefense', 'magicdefense')),
        attackDamage: num(pickField(ib, 'Attackdamage', 'attackdamage')),
        abilityPower: num(pickField(ib, 'Abilitypower', 'abilitypower')),
        moveSpeed: num(pickField(ib, 'Movementspeed', 'movementspeed')),
        attackSpeed: cleanWikiText(pickField(ib, 'Attackspeed', 'attackspeed')) || null,
        attackRange: cleanWikiText(pickField(ib, 'Attackrange', 'attackrange')) || null,
        hpRegen: num(pickField(ib, 'HP5sec', 'hp5sec', 'hpper5seconds')),
        manaRegen: num(pickField(ib, 'MP5sec', 'mp5sec', 'manaper5seconds')),
        maxMana: num(pickField(ib, 'Maxmana', 'maxmana')),
        maxEnergy: num(pickField(ib, 'Maxenergy', 'maxenergy'))
    };
    const cost = {
        gold: num(pickField(ib, 'Goldcost', 'goldcost')),
        voucher: num(pickField(ib, 'Vouchercost', 'vouchercost'))
    };
    let videoId = cleanWikiText(pickField(ib, 'video', 'Video', 'spotlight', 'Spotlight')) || null;
    if (videoId) {
        // Một số trang ghi cả URL YouTube đầy đủ — chỉ giữ ID
        const ym = videoId.match(/(?:v=|youtu\.be\/|embed\/)([A-Za-z0-9_-]{11})/);
        if (ym) videoId = ym[1];
        else if (!/^[A-Za-z0-9_-]{11}$/.test(videoId)) videoId = null;
    }

    const skills = parseSkills(wikitext);
    const description = parseIntro(wikitext);
    const lore = parseLore(wikitext);
    const profile = parseProfile(wikitext);

    // Resolve ảnh: splash art + icon từng skill
    const splashFile = pickField(ib, 'Image', 'image');
    const filesToResolve = [];
    if (splashFile) filesToResolve.push(splashFile);
    for (const sk of skills) if (sk.icon) filesToResolve.push(sk.icon);
    const imgMap = await resolveImages(filesToResolve);

    const splashKey = splashFile ? splashFile.replace(/_/g, ' ').trim() : '';
    const splashArt = splashKey ? (imgMap[splashKey] || null) : null;
    for (const sk of skills) {
        if (sk.icon) {
            const k = sk.icon.replace(/_/g, ' ').trim();
            sk.iconUrl = imgMap[k] || null;
        }
    }

    return {
        name,
        slug: name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
        class: cls.split(/\s*[\/,]\s*/).map(s => s.trim()).filter(Boolean),
        role,
        tagline,
        description,
        cost,
        stats,
        splashArt,
        videoId,
        videoUrl: videoId ? `https://www.youtube.com/watch?v=${videoId}` : null,
        skills,
        profile,
        lore,
        wikiUrl: `https://arenaofvalor.fandom.com/wiki/${encodeURIComponent(name.replace(/\s/g, '_'))}`
    };
}

async function getHero(name, force = false) {
    const key = name.toLowerCase().trim();
    const now = Date.now();
    const c = cache.hero.get(key);
    if (!force && c && now - c.at < TTL.hero) return c.data;

    const list = await getHeroList();
    const normalized = list.find(h => h.toLowerCase() === key)
        || list.find(h => h.toLowerCase().replace(/\s/g, '') === key.replace(/\s/g, ''))
        || list.find(h => h.toLowerCase().includes(key));
    if (!normalized) return null;

    const data = await wiki({ action: 'parse', page: normalized, prop: 'wikitext' });
    const wikitext = data?.parse?.wikitext?.['*'];
    if (!wikitext) return null;

    const hero = await buildHero(normalized, wikitext);
    cache.hero.set(key, { at: now, data: hero });
    cache.hero.set(normalized.toLowerCase(), { at: now, data: hero });
    return hero;
}

module.exports = { getHeroList, getHero };
