# AI Content — Web Console

Giao diện web quan sát và điều khiển **multi workflow**. Extension Chrome thực thi workflow trên tab Facebook / ChatGPT.

## Yêu cầu

- Backend (`BE/`) đang chạy, đã có module `multi-workflows`
- Tài khoản **VIP** hoặc **Admin** (API multi workflow yêu cầu quyền này)
- Extension mở trên Chrome để nhận job qua SSE (bước tích hợp tiếp theo)

## Cài đặt

```bash
cd WEB
cp .env.example .env
npm install
npm run dev
```

Mở http://localhost:3000

## Trang chính

| Trang | Chức năng |
|-------|-----------|
| Tổng quan | Stats + runs/jobs gần đây (auto refresh 5s) |
| Multi workflow runs | Lịch sử + chi tiết từng bước |
| Multi workflow | Cấu hình bộ + nút Run / Hủy |

## Build production

```bash
npm run build
npm run preview
```

## API

Backend: `/api/v1/multi-workflows/*`
