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
npm test                  # Vitest：領域規則、demo adapter 的冪等／版本／衝突
npm run test:e2e          # Playwright × demo：390/1440 截圖到 artifacts/screenshots/，互動流程
npm run test:db           # Postgres：RLS、並發確認、付款冪等、OTP、函式權限（見下方）
npm run test:e2e:supabase # Playwright × 本機 Supabase：登入、持久化、跨店隔離、照片上傳、離線
```

Playwright 使用環境預裝的 Chromium（`@playwright/test` 固定 1.63.0）。

## 真實後端：本機 Supabase（M1 起）

```bash
npx supabase start            # Auth + Postgres + PostgREST + Storage；自動套用 migrations 與 seed
npx supabase status -o env    # 取得 API_URL / ANON_KEY
```

`.env.local`：

```
VITE_DATA_MODE=supabase
VITE_SUPABASE_URL=http://127.0.0.1:54321
VITE_SUPABASE_ANON_KEY=<supabase status 顯示的本機 anon key>
```

本機帳號（僅 seed，密碼 `petos-dev-only`）：`owner@calm.petos.test`（店主）、`iris@calm.petos.test`（櫃檯）、`amy@calm.petos.test`（美容師）、`owner@north.petos.test`（第二間店，用來驗證隔離）。也可在 `/signup` 註冊新店。

> 若 Docker Hub 回 429：先 `docker pull mirror.gcr.io/<image>` 再 `docker tag` 成 `docker.io/<image>`，並以 `SUPABASE_INTERNAL_IMAGE_REGISTRY=docker.io npx supabase start` 啟動（見 `docs/HANDOFF.md`）。

## 資料庫測試

使用 Supabase 官方 Postgres 映像（內含 `auth` schema 與 anon/authenticated 角色），每個測試檔開始前以 `scripts/db-reset-local.sh` 重建 schema＋seed（只允許 localhost）：

```bash
docker run -d --name petos-db -e POSTGRES_PASSWORD=postgres -p 54329:5432 supabase/postgres:17.11.0.006
DATABASE_URL=postgres://postgres:postgres@127.0.0.1:54329/postgres npm run test:db
```

測試以 PostgREST 相同方式（`set role authenticated`＋JWT claims）扮演不同使用者。

## 第三方設計 skill

```bash
./scripts/install-distinctive-skill.sh   # 安裝至 .claude/skills/distinctive-ai-design（不進 git，原 repo 無授權檔）
```
