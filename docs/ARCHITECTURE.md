# 技術架構與部署策略

## 預設
- React + Vite + TypeScript，SPA/PWA；Tailwind + shadcn/ui，TanStack Query，React Hook Form/Zod。
- Supabase Auth、PostgreSQL、RLS、Private Storage、Edge Functions。
- Vitest + Testing Library + Playwright；Cloudflare Pages 或相容服務部署。
- 選擇穩定且相容的版本，不無理由添加第二套 DB／Auth／ORM。

## Repo（由 Claude Code 建立）
`src/app`, `src/features/{today,pets,customers,calendar,appointments,booking}`, `src/components/{ui,pet,appointment}`, `src/lib/{auth,db,validation}`, `supabase/migrations`, `supabase/functions`, `tests/{unit,e2e,visual,db}`, `docs/`, `.claude/skills/`。
功能模組之間透過相同 id 與 typed data contracts 連接，少用全域雜亂 state。

## 兩個開發模式
- **M0 視覺展示**：demo adapter + 固定虛構資料，必要時使用 mock 網路延遲／錯誤；明確顯示 DEMO，不接觸真實客戶。
- **M1 起**：supabase adapter（正式後端／本地 Supabase），逐步替換 demo adapter；測試需證明資料持久與 RLS。不得把 demo adapter 當正式生產資料。

切換方式：`VITE_DATA_MODE=demo|supabase`（見 `.env.example`）。兩個 adapter 實作同一個 `DataAdapter` 介面（`src/lib/db/adapter.ts`），業務規則（狀態轉移、金額計算）放在 `src/lib/domain/` 共用，並在 DB 端以 RPC 再驗證一次。

## 本地環境
Node 22、npm、Supabase CLI（本地 Supabase 需 Docker），生成 `.env.example`、本地安裝及啟動命令；不要把實際密鑰提交至 Git。
使用者尚未提供 Supabase Project URL 或 anon key 時，可先完成前端、migration 和 DB adapter，標記需憑證的整合為 blocked。Supabase service role key 不得進前端。

## 預約與容量
人員服務資格 + 營業時間 + 非工作時間 + 當日休假 + 緩衝 + 單店資源容量：前端可提示，但 DB/Edge Function 是最終裁決者；同時操作採交易與不可重疊約束或經過驗證的鎖，並發測試必須確保最多一筆確認成功。待確認申請不得無限制長期占位。

## 異步工作
通知使用 outbox + 背景 worker，退避與有限重試；金流、儲值、包套與處理外部 webhook 時使用 idempotency key 和不可變 ledger。每天做資料備份；正式商用之前必須演練可還原性。

## 訂閱
早期按 dev/trial 模式執行；店家方案／付款 provider 為後續里程碑，避免在尚未驗證店家需求時投入複雜 billing。

## 流程
設計→資料合同→業務服務層→可驗證 API→UI→E2E→RLS→Screenshot QA→文件→下一個切片。不要先生成 17 個空頁。

## 實作現況（2026-10-28）

```
src/
  app/            App（路由、QueryClient）、AppShell（側欄/底部導覽、登入導向）
  lib/domain/     types、status（狀態機與角色能力）、availability（排程規則）、money、time（Asia/Taipei）
  lib/db/         adapter.ts（DataAdapter 介面＋DomainError）、demo/（fixtures＋demoAdapter）、supabase/（supabaseAdapter）
  components/     ui/（Button、Sheet、Field、TimeSelect、Tabs、Toast、狀態元件）、pet/、appointment/
  features/       today、pets、calendar、appointments、booking、more（服務與設定）、auth（登入、註冊開店）、demo（DEMO 工具列）
supabase/
  migrations/     0100 schema → 0200 RLS → 0300 業務 RPC → 0400 公開預約 → 0500 函式權限 → 0600 Storage → 0700 開店/設定
  seed.sql        兩間虛構店（隔離測試），時間相對「今天」
tests/
  unit/           Vitest（domain、demo adapter）
  db/             Vitest＋pg，以 PostgREST 相同方式（role＋JWT claims）扮演使用者
  e2e/            Playwright × demo（390/1440、375/768/1024）
  e2e-supabase/   Playwright × 本機 Supabase（Auth＋PostgREST＋Storage）
```

錯誤合約：DB 以 `app.fail(code, message, detail)` 丟出，`hint` 為機器碼（CONFLICT、VERSION_MISMATCH、FORBIDDEN…），前端轉成 `DomainError` 並原樣顯示中文訊息，不自行假設成功。
