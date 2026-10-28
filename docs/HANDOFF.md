# HANDOFF｜PetOS 開發交接

> 每個里程碑結束更新。最後更新：2026-10-28（Claude Code）。

## 目前狀態一句話
M0～M3 完成：五個核心畫面＋毛孩/設定/登入/開店，皆可在 **demo 模式**與**真實 Supabase（本機）**兩種後端操作；預約→報到→美容→完工→待接回→收款→交接完整垂直流程由資料庫函式驗證並持久化。

## 測試證據（2026-10-28 最後一次全跑）
| 指令 | 結果 | 涵蓋 |
|---|---|---|
| `npm run typecheck` / `vite build` | 通過 | — |
| `npm test` | **22 passed** | 狀態機、金額由 ledger 推導、Asia/Taipei 日期、可預約時段、demo adapter 冪等/版本/OTP |
| `npm run test:db` | **54 passed** | RLS 兩店×多角色、跨店寫入拒絕、函式權限（anon 只能呼叫 5 個公開函式）、**8 路並發同時段只成功 1 筆**、休假警示、改期保留 id、完工不重複、部分付款/退款/冪等、ledger 不可修改、未付款交接授權＋audit、OTP 與防暴力、開店 |
| `npm run test:e2e` | **62 passed**（2 skipped＝僅桌面項目） | demo × 390/1440；375/768/1024 無橫向溢出；每頁 console error = 0；E03–E18 UI 流程；設定/新增毛孩 |
| `npm run test:e2e:supabase` | **20 passed** | UI × 真實 Auth/PostgREST/Storage：重新整理後狀態仍在、mock LINE 送出、跨店不可見、櫃檯不能授權賒帳、美容師看不到金額、匿名申請→店員確認、OTP、私有照片上傳＋簽章 URL、離線不假成功、註冊開店 |

### QA E-list 對照
| E | 狀態 | 證據 |
|---|---|---|
| E01 新店註冊→服務→毛孩 | ✔ | e2e-supabase「E01」、db settings |
| E02 照片/注意事項/體重 | ✔ | e2e-supabase 照片上傳、體重/備註 provenance |
| E03 同名毛孩 | ✔ | e2e flows |
| E04 熟客預約 | ✔ | e2e flows、db workflow |
| E05 並發最多一筆 | ✔ | db workflow（真並發）＋ e2e UI 模擬 |
| E06 請假影響 | ✔ | db settings/workflow、e2e settings、e2e-supabase |
| E07 改期保留 id | ✔ | db、e2e |
| E08 報到→完工→待接回 | ✔ | db、e2e、e2e-supabase |
| E09 已付款仍待接回 | ✔ | db、e2e、e2e-supabase |
| E10 交接後才完成 | ✔ | 同上 |
| E11 部分付款/退款 | ✔ | db、e2e |
| E12 付款重試不重複 | ✔ | db（5 路並發同鍵＝1 筆）、unit |
| E13 契約版本 | **NOT RUN**（M4 未開始） | — |
| E14 LINE 失敗不影響預約 | ✔（mock） | db、e2e |
| E15 跨店拒絕 | ✔ | db rls、e2e-supabase |
| E16 手機四步預約 | ✔ | e2e（mobile project）、e2e-supabase |
| E17 斷網不假成功 | ✔ | e2e、e2e-supabase（含 TanStack 暫停重送修正） |
| E18 不能靠電話讀他人資料 | ✔ | db booking、e2e |

## 線上可直接打開的版本
- **https://claude.ai/artifact/NFaEvbkohxa9pftK5PYXfa**（私人連結，需在頁面 Share 選單分享給店員才看得到）
- 內容：完整 demo 版（虛構資料，存在使用者自己的瀏覽器）；更新方式：`npm run build:embedded` 後重新發佈 `dist-embedded/PetOS.html`
- PR：https://github.com/aaa78550000-alt/200/pull/1（`main` 建在第一個 M0 commit 上，PR 顯示其後所有工作）

## 真實功能（不再有模擬）— 2026-10-28 更新
- **LINE 通知**：`supabase/functions/notify-worker`（推播，X-Line-Retry-Key 防重送）、`line-webhook`（簽章驗證、綁定碼）。店主在「服務與設定 → LINE 官方帳號通知」填 Channel secret／access token／LINE ID，並把顯示的 Webhook URL 貼到 LINE Developers。
- **熟客驗證**：驗證碼經 LINE 傳送；店家未連 LINE 時，飼主端不顯示「我來過」，不給假驗證碼。
- **員工帳號**：`supabase/functions/staff-admin`；店主／店長在設定頁建立、停用、重設密碼。
- **通知狀態誠實**：未連 LINE 或飼主未綁定時顯示「未發送」＋原因。
- 唯一保留的模擬：本機 seed 店家（`dev_mode=true`）與 Demo 版，正式店家一律 `dev_mode=false`。
- 測試：`tests/db/line.test.ts`（7）、`tests/e2e-supabase/zz-line-and-staff.spec.ts`（8，LINE API 以本機記錄伺服器替代，其餘全部真實：Edge Functions、pg_net、Vault、Auth admin）。

## 上線（GitHub Pages ＋ Supabase）
`.github/workflows/deploy.yml`，**只在手動按 Run workflow 時執行**：
- `mode=demo`：虛構資料版，公開網址 `https://aaa78550000-alt.github.io/200/`
- `mode=supabase`（預設）：自動建立/更新 Supabase 專案 `petos` → `scripts/deploy-migrations.mjs` 經 Management API 套用 migrations（**不套 seed**，不需資料庫密碼，每檔一個 transaction 並記錄在 `supabase_migrations.schema_migrations`）→ 部署 3 個 Edge Functions → 產生專用 `PETOS_WORKER_SECRET`（Function secret ＋ Vault `petos_worker_key`，**不是** service key）與 `petos_worker_url` → 開放 `app` schema、設定登入轉址 → 以真實後端建置前端
- 需要：repo Secret `SUPABASE_ACCESS_TOKEN`（`SUPABASE_DB_PASSWORD` 選填）；Settings → Pages → Source = GitHub Actions
- 正式環境 `dev_mode=false`：熟客驗證碼經 LINE 送出（店家需先在設定頁連接 LINE）；未連接 LINE 時通知顯示「未發送」與原因
- 註冊需收 Supabase 確認信（`mailer_autoconfirm` 未開：關閉 email 驗證屬降低安全性，未經明確授權不改）。注意 Supabase 免費內建寄信只寄給組織成員且每小時數封，對外開放註冊前需設定自訂 SMTP
- 本環境網路政策擋 `supabase.com`／`api.supabase.com`，所以由 GitHub Actions 代為執行；migration 腳本已在本機 Supabase 從零套用 8 檔並重跑 e2e 驗證
- 預約詳情在通知「排隊中」時每 3 秒重新讀取，背景送出後畫面自動變「已送出」

## 可操作路徑
- Demo：`npm run dev` → `/app/today`（DEMO 工具：角色、離線、LINE 失敗、時段被搶、重設）
- 真實後端：`npx supabase start` ＋ `.env.local`（README）→ `/login`（本機帳號見 README）或 `/signup` 開新店
- 飼主：`/book/calm-studio`

## 環境紀錄
| 項目 | 結果 |
|---|---|
| Node / npm / Git | v22.22.0 / 10.9.4 / 2.43.0 |
| Playwright | 1.63.0（預裝 Chromium） |
| Supabase CLI | 2.122.0；本機 stack 以 `SUPABASE_INTERNAL_IMAGE_REGISTRY=docker.io` 啟動，缺的映像（postgrest v16.5、storage-api v1.84.19、kong 2.8.1、realtime v2.147.1）從 `mirror.gcr.io` 拉取後 retag |
| DB 測試容器 | `supabase/postgres:17.11.0.006` 於 54329 |
| 外部圖庫 | 被網路政策擋 → Canva 生成虛構毛孩圖（`src/assets/pets/CREDITS.md`） |
| GitHub | 已建立 `main`（指向第一個 commit）並開 draft PR #1 |

## BLOCKED（需要你的授權或外部資源）
1. ~~開 Pull Request~~：已處理（PR #1）。repo 預設分支仍是 `claude/petos-bootstrap-yh4f6v`，可在 GitHub Settings 改成 `main`。
2. **雲端 Supabase 專案**：需要 Project URL / anon key（及在 Dashboard 設定 `app` schema 曝露給 API）。目前全部在本機驗證。
3. **SMS 驗證碼**：正式 OTP 需要簡訊供應商與憑證；目前 `dev_mode` 店家回傳固定碼 123456，正式店家不回傳（`app.request_otp`）。
4. **LINE OA**：各店 channel token/secret；目前 outbox＋mock worker。正式 worker 需 Edge Function 部署與 service role 金鑰。
5. **正式部署**（Cloudflare Pages 等）與網域：未授權，未進行。
6. **電子契約法律審查**：M4 開始前需要。

## 已知限制／技術債
- 員工邀請（寄信加入店家）與角色管理 UI 尚未做；目前 seed 或開店者本人。
- 行事曆無拖拉改期（以表單＋後端驗證）。
- 新客用既有手機申請時掛在原飼主名下並標註需核對（D-12），之後可做「合併/拆分」工具。
- `appointment_overview` 對美容師顯示的已收金額為 0（因 RLS 看不到付款）；UI 已隱藏金額，但若之後給美容師看應收需另做檢視。
- Demo 照片只有 200×200。
- 未做獨立子代理的盲評（UI_REVIEW 為自查）。

## 下一個可執行任務（依相依順序）
1. 員工邀請與角色管理（owner）：`shop_memberships` 邀請流程＋UI。
2. M4-02 正式化：Supabase Edge Function `notify-worker`（claim → LINE provider → complete），provider 介面＋mock 已有 SQL 端。
3. M4-01 電子契約：`contract_templates / contract_versions / signed_contracts`，簽署 hash 與 PDF，版本不可覆寫（E13）。
4. M5-01 包套／儲值 ledger 與基本報表。
