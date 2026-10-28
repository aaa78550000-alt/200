# PetOS

台灣寵物美容店多租戶 SaaS（暫用代號）。「店務有秩序，照顧更有溫度。」

> 目前狀態請看 [`docs/HANDOFF.md`](docs/HANDOFF.md) 與 [`docs/ROADMAP.md`](docs/ROADMAP.md)。產品與設計規格在 `docs/`，Claude Code 規則在 `CLAUDE.md`。

## 快速開始

```bash
npm install
cp .env.example .env.local   # 預設 VITE_DATA_MODE=demo
npm run dev                  # http://127.0.0.1:5173/app/today
```

Demo 模式使用固定虛構資料（2026-10-28 15:10 Asia/Taipei），畫面頂端標示 DEMO；「Demo 工具」可切換角色、模擬離線、LINE 失敗與時段被搶。

| 畫面 | 路徑 |
|---|---|
| 今日工作 | `/app/today` |
| 毛孩檔案 | `/app/pets/pet-coco` |
| 預約行事曆 | `/app/calendar` |
| 預約詳情與美容流程 | `/app/appointments/apt-coco-today` |
| 飼主線上預約 | `/book/calm-studio` |

## 測試

```bash
npm run typecheck
npm test            # Vitest：領域規則、demo adapter 的冪等／版本／衝突
npm run test:e2e    # Playwright：390 + 1440 截圖到 artifacts/screenshots/，互動流程 E03–E18
npm run test:db     # Postgres：RLS、並發確認、付款冪等（見下方）
```

Playwright 使用環境預裝的 Chromium（`@playwright/test` 固定 1.63.0）。

## 資料庫（M1 起）

Migrations 在 `supabase/migrations/`，與 Supabase 相容（使用 `auth.uid()`、`auth.jwt()`、RLS）。
DB 測試需要一個 Postgres 16+ 連線字串：

```bash
# 例：本機 Docker
docker run -d --name petos-pg -e POSTGRES_PASSWORD=postgres -p 54329:5432 postgres:16-alpine
DATABASE_URL=postgres://postgres:postgres@127.0.0.1:54329/postgres npm run test:db
```

測試會建立一個暫時資料庫、套用 `supabase/tests/auth_shim.sql`（只在非 Supabase 環境模擬 `auth` schema 與 `authenticated` 角色）＋全部 migrations＋seed，再以不同使用者身分驗證 RLS。

## 第三方設計 skill

```bash
./scripts/install-distinctive-skill.sh   # 安裝至 .claude/skills/distinctive-ai-design（不進 git，原 repo 無授權檔）
```
