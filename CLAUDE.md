# PetOS｜Claude Code 專案常駐指令

你正在打造台灣寵物店多租戶 SaaS「PetOS」。以 **繁體中文（台灣用語）** 向使用者回報；程式碼識別子用英文。本專案已由 Claude 建立（見 `docs/HANDOFF.md`），**沿用而不是重寫**。

## 每次先讀
- 進度：`docs/HANDOFF.md`、`docs/ROADMAP.md`
- 產品：`docs/PRD.md`、`docs/DECISIONS.md`、`docs/USER_FLOWS.md`
- UI 工作時：`docs/DESIGN_DIRECTION.md`、`docs/DESIGN_TOKENS.md`、`docs/SCREEN_BLUEPRINTS.md`、`docs/DESIGN_EXPLORATION.md`
- 後端／資料工作時：`docs/ARCHITECTURE.md`、`docs/DATA_MODEL.md`、`docs/SECURITY_AND_COMPLIANCE.md`
- 排程與驗收：`docs/ROADMAP.md`、`docs/QA_ACCEPTANCE.md`

## 核心不可妥協
1. 設計品質是競爭優勢：每個螢幕按真實業務任務設計，不使用一般 AI SaaS 模板。手機 390px / 桌面 1440px 必須分別設計。
2. 先做可運作的完整垂直流程：顧客／毛孩→預約→接待→服務中→完工→待接回→結帳／交接→完成；跨模組以同一資料庫資料連結。
3. 正式系統必須多租戶、安全隔離。預約時間衝突、支付交易、包套／錢包餘額、契約版本都由後端驗證。
4. 不得因使用者只說「做漂亮」就重新發明功能或更改品牌核心。寵物照片、名字、品種、最近體重、注意事項、歷史是核心視覺資訊。
5. 每次新增頁面／大幅修改布局前：使用 `/petos-ui-design`，若已安裝可同時使用 `/distinctive-ai-design`。普通錯字修正不用全面概念探索。
6. 每次完成 UI 工作前：使用 `/petos-visual-qa`，真實開啟瀏覽器、以固定資料截圖和測試；沒有實測不能宣稱通過。最多先做兩輪集中精修，記錄問題。
7. 使用者最不喜歡：字太小、大片空白、卡片過多、亂七八糟的圓角、假按鈕、滿版統計、無意義裝飾、前後端不同步。
8. 擅自安裝未知程式、付費、正式部署、操作真實顧客資料、破壞性 DB 操作，需先取得授權；使用 secrets 管理金鑰。不可假冒成功。
9. 保持單一權威資料與清楚狀態：預約、服務完工、付款、簽約、實際接回彼此獨立；資料紀錄需要歷程與審計。
10. 每個里程碑更新 `docs/ROADMAP.md` 和 `docs/HANDOFF.md`，保留明確測試證據與未完成事項，按相依順序繼續，不要求使用者反覆確認已定義的細節。

## 工程預設
React + Vite + TypeScript + Tailwind + shadcn/ui 風格元件（Radix + cva）+ TanStack Query + React Hook Form + Zod；Supabase Auth / Postgres / RLS / Storage / Edge Functions；Playwright + Vitest。實作前核對版本與免費方案限制。

## 常用指令
- `npm run dev`：前端（預設 demo adapter）
- `npm test`：Vitest 單元測試
- `npm run test:e2e`：Playwright E2E（含 390/1440 截圖到 `artifacts/screenshots/`）
- `npm run test:db`：資料庫 RLS／並發／交易測試（需本機 Postgres，見 `README.md`）

## UI 工作流程
需求與真實任務 → 3 種構圖／資訊組織不同的概念（只有首次設計方向探索需要）→ 自主選擇並記錄 → 高擬真可互動原型 → 真實截圖 → 獨立或自我批判審查 → 修正 1~3 個高優先問題 → 回歸測試。色彩是起點不是結果。

## 交付格式
每次簡短報告：完成的實際功能、可操作路徑、執行的測試及結果、手機／桌面截圖路徑、未驗證及下一步。完成程式碼 ≠ 完成功能；有截圖 ≠ 通過操作與資料安全驗收。
