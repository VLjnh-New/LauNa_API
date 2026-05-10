<div align="center">

<img src="public/avatar.png" alt="LauNa API" width="180" />

# LauNa API

**REST API Hub đa năng cho dev & chatbot Việt — kèm Mini Shield L7 + WAF + dashboard realtime**

[![Version](https://img.shields.io/badge/version-4.1.1-34d399?style=flat-square)](./package.json)
[![Node](https://img.shields.io/badge/node-%E2%89%A520-339933?style=flat-square&logo=node.js&logoColor=white)](https://nodejs.org)
[![Express](https://img.shields.io/badge/express-4.x-000000?style=flat-square&logo=express)](https://expressjs.com)
[![PostgreSQL](https://img.shields.io/badge/postgres-16-4169E1?style=flat-square&logo=postgresql&logoColor=white)](https://www.postgresql.org)
[![Mini Shield](https://img.shields.io/badge/Mini%20Shield-L7%20WAF-ef4444?style=flat-square)](#-mini-shield--anti-ddos--waf--dashboard)
[![License](https://img.shields.io/badge/license-ISC-blue?style=flat-square)](#-license)

</div>

---

## ✨ Giới thiệu

**LauNa API** là một REST API Hub viết bằng **Node.js + Express**, chứa nhiều endpoint phục vụ chatbot, web tool và dev cá nhân. Dự án tích hợp:

- AI image / chat / voice
- Downloader TikTok, YouTube, Douyin, Threads, SoundCloud
- Tra cứu LiênQuân / FreeFire / ngân hàng / ship hàng
- TempMail / TempSMS
- VPS workflow
- Mini Shield L7 + WAF + dashboard realtime

Ứng dụng chạy dưới 1 process, mở cổng public bằng Mini Shield và proxy về LauNa Express nội bộ.

## 🚀 Tính năng chính

- `lib/` tự động load route theo folder.
- WAF log-only và reverse proxy L7 tại `shield/`.
- API key chính + free key theo IP.
- DDoS guard + challenge Turnstile gỡ ban.
- SSRF guard với các endpoint nhận `?url=`.
- Proxy pool cho các dịch vụ AI / crawling.
- OpenAPI 3 + Swagger UI tại `/docs`.
- Frontend trang chủ, downloader, voice, tempmail, tempsms, vps, proxy, stats.
- Health check `/healthz`, readiness `/readyz`, graceful shutdown.

## 🏗️ Kiến trúc vận hành

`index.js` khởi tạo:

- LauNa Express nội bộ trên `127.0.0.1:LAUNA_PORT` (mặc định `5050`)
- Mini Shield public trên `PORT` (mặc định `5000`)

Nếu `PORT === LAUNA_PORT`, ứng dụng sẽ lỗi và yêu cầu đổi một trong hai giá trị.

## 🔧 Cài đặt nhanh

```bash
npm install
npm start
```

Chạy development:

```bash
npm run dev
```

## 🧰 Scripts

- `npm run init-db` — khởi tạo DB.
- `npm run test` — chạy test trong `tests/`.
- `npm run routes` — liệt kê route đã load.
- `npm run health` — kiểm tra `/healthz`.
- `npm run cache:clear` — xóa cache qua admin API.
- `npm run keys:list` — liệt kê apikey.

## ⚙️ Biến môi trường

Ưu tiên đọc biến env, fallback về `config.json`.

- `PORT` — cổng public cho Mini Shield.
- `LAUNA_PORT` — cổng nội bộ cho LauNa.
- `HOST` — host binding cho LauNa.
- `LAUNA_DATABASE_URL` / `DATABASE_URL` — PostgreSQL connection string.
- `REDIS_URL` — Redis URL.
- `TURNSTILE_SITE_KEY` / `TURNSTILE_SECRET_KEY`
- `TELEGRAM_BOT_TOKEN` — token Telegram admin bot.
- `TELEGRAM_ADMIN_ID` — admin ID Telegram.
- `FREE_KEY_HOURLY_LIMIT` — giới hạn free key mỗi IP.
- `ADMIN_KEY` — thêm admin key nếu chưa có.
- `NODE_ENV` — `production` hoặc `development`.
- `DASHBOARD_PASSWORD` — Basic Auth cho `/__shield/`.

> Nếu `config.json` chứa secret, hệ thống sẽ log cảnh báo bảo mật.

## 📚 Tài liệu API

- `/docs` — Swagger UI tương tác.
- `/openapi.json` — OpenAPI spec.
- `/api` — catalog endpoint.

Phần lớn endpoint cần `?apikey=...` hoặc header `x-api-key` / `apikey`.

Prefix bypass API key:
`/download/all`, `/music/scl-search`, `/music/soundcloud`, `/vps`, `/note`, `/vietqr`, `/bank-lookup`, `/fb-uid`, `/ship-track`, `/mst`, `/lich-am`, `/gia`, `/random-vn`, `/stats`, `/shortener`, `/s/`, `/img-tool`, `/ip-info`, `/ai/media`.

## 🌐 Giao diện public

- `/` — trang chủ.
- `/api` — danh sách endpoint.
- `/docs` — Swagger UI.
- `/download` — downloader.
- `/voice` — voice studio.
- `/tempmail` — temp mail.
- `/tempsms` — temp SMS.
- `/vps` — VPS workflow.
- `/bothosting` — bot-hosting claimer.
- `/health` — dashboard health.
- `/proxy` — proxy admin.
- `/challenge` — DDoS challenge.
- `/stats` — thống kê hệ thống.

## 🛡️ Mini Shield & WAF

Mini Shield chạy trước LauNa và cung cấp:

- reverse proxy public → internal
- WAF log-only
- dashboard Basic Auth tại `/__shield/`
- realtime stats và top IP

## 🧩 Thêm route mới

Thêm file `.js` vào thư mục `lib/<Nhóm>/` với cấu trúc cơ bản:

```js
module.exports = {
  name: '/<group>/<route>',
  index: (req, res) => {
    res.json({ status: true, message: 'OK' });
  }
};
```

Hoặc định nghĩa `methods` khi cần `POST` / `PUT`.

## 📦 Docker Compose

`docker-compose.yml` chứa cấu hình PostgreSQL và service `api`.

- `postgres:16-alpine`
- `api` mount `./config.json:/app/config.json:ro`
- public port `5000`.

## 📝 License

- ISC
##start command
```
node utils/data/init-db.js || true && node index.js
```
