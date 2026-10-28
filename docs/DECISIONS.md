# 已定產品決策（若要改動，先記錄決策原因）

| 主題 | 決策 |
|---|---|
| 產品 | PetOS，暫用代號；核心為中小型台灣寵物美容店，預約與毛孩服務流程優先 |
| 定位 | 專業店務管理 × 有溫度的毛孩數位檔案，UI 操作效率為差異化 |
| 市場 | 不假設競爭者缺乏功能；以日日、Petto、PonPonPet、HOTCAKE 作功能參考，不複製品牌／碼 |
| 商業 | B2B SaaS，$590/$990/$1990/月僅為待測試的方案假設，第一版不必接真實訂閱金流 |
| 形式 | 手機優先 PWA，桌面有專門的美容師行事曆；飼主不需下載 App |
| 語言 | 繁體中文／台灣用語；Asia/Taipei；NTD；預設 24 小時制 |
| v1 | 單門市店家完整美容流程；資料架構支援未來多門市；住宿、採購、庫存後做 |
| 預約 | 飼主線上申請預設待確認，不長期占用時段；正式確認要原子檢查容量。店員可直接建立確認預約 |
| 費用 | 第一版只記錄店家實際收到的現金、轉帳及外部刷卡結果，不自行處理商用刷卡 |
| LINE | 每間店綁自己的官方帳號；初版無 LINE 憑證時使用清楚標示的 mock adapter |
| 契約 | 模板版本不可覆寫已簽文件，正式商用前法規與證據力需審查 |
| 視覺 | Calm Studio 只是起點；需做有個性的構圖探索與真實截圖 QA，不一律大圓角卡片 |
| 技術 | React/Vite/TypeScript + Supabase 為預設；不隨意混用第二套資料庫或 ORM |
| 測試 | 390px + 1440px 實際瀏覽器驗收；固定測試資料；不自動更新基準圖掩蓋失敗 |
| 第三方 Skill | 優先 Claude Code .claude/skills，Claude 用 CLAUDE.md，不是直接搬 Codex 安裝路徑 |
| 預算 | 盡量低成本，若正式商用可靠度需要付費，明確說明並先取得同意 |
| 舊經驗 | 借鏡億客蔥抓餅排班、權限、PWA 和一體化資料設計；不用 GPS 打卡、完整 HR 模組 |

不得自行決定的事項：真實付款/金流、實際寄送飼主訊息、正式部署到公開網域、不可逆資料刪除、購買雲端服務。其他低風險產品細節以一致、低成本、易維護與 UX 優先，自主選擇並登記在此。

## Claude 實作期間自主決定（2026-10-28 起登記）

| # | 日期 | 決策 | 理由 |
|---|---|---|---|
| D-01 | 2026-10-28 | distinctive-ai-design 不提交進 repo，以 `scripts/install-distinctive-skill.sh` 安裝固定 commit `92c6836` 至 gitignored 路徑 | 原 repo 無 LICENSE 檔，預設保留權利；內容僅 markdown，已審閱無執行風險 |
| D-02 | 2026-10-28 | UI 元件以 shadcn/ui 的作法（Radix primitives + cva + Tailwind）手寫於 `src/components/ui`，不執行 shadcn CLI | shadcn 本質是複製程式碼；手寫可精準套用 PetOS token，避免預設大圓角、陰影 |
| D-03 | 2026-10-28 | 構圖方向：桌面採 A「Studio Ledger」、毛孩檔案與預約詳情照護區採 B「Pet Dossier」、飼主預約採 C「Quiet Concierge」，共用一套 token | 詳見 `docs/DESIGN_EXPLORATION.md` |
| D-04 | 2026-10-28 | Demo 固定日期 2026-10-28（週三），時區 Asia/Taipei；店家 slug `calm-studio`（虛構「靜室寵物美容」） | 固定 fixture 才能截圖比對 |
| D-05 | 2026-10-28 | 毛孩照片使用 Unsplash License 授權照片，下載後放 `public/demo/pets/`，以本地檔載入；不連外熱連結 | 截圖可重現；授權允許商業／非商業使用，來源記於 `public/demo/pets/CREDITS.md` |
| D-06 | 2026-10-28 | 本地後端以 Supabase CLI（Docker）為目標；DB 測試直接連 Postgres 以 `request.jwt.claims` 模擬 Supabase 角色 | 不需雲端憑證即可證明 RLS 與並發 |
| D-07 | 2026-10-28 | 預約不可重疊以 Postgres `EXCLUDE USING gist (staff_id, tstzrange)` 約束實作，只套用於占用狀態（confirmed/checked_in/in_service/ready_pickup） | 由 DB 最終裁決，並發下最多一筆成功 |
| D-08 | 2026-10-28 | 狀態轉移、完工、收款透過 SECURITY DEFINER RPC（`app.*` 函式）執行，前端不可直接 UPDATE status | 後端驗證合法轉移、角色、租戶、版本 |
| D-09 | 2026-10-28 | 未付款交接（賒帳）需 owner/manager 角色並必填原因，寫入 appointment_events | 依 F04「付款未完成的交接需店長授權」 |
