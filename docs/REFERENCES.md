# 外部參考、來源與確定程度

以下是前述討論提及的參考，作為新任務啟動時的查核入口；競品定價/功能可能變更，開發者在需要時重新核對，不得把未實測功能當成已驗證。

## 台灣寵物 SaaS
- 日日寵物：https://daydaypetline.web.app/promo.html
- 日日公開試用：https://daydaypet.web.app/trial.html
- Petto：https://petto.cc/
- PonPonPet：https://www.ponponpet.com/
- HOTCAKE：https://hotcake.app/

先前公開資料整理：日日報價曾為 NT$650/月（半年繳），Petto、HOTCAKE、其他競品有較低價或免費方案。價格不是即時保證。我們的 $590/$990/$1990 是需要驗證的測試定價。

## Claude Code 官方文檔
- Skills：https://code.claude.com/docs/en/skills
- Project memory/CLAUDE.md：https://code.claude.com/docs/en/memory
- Hooks：https://code.claude.com/docs/en/hooks
- Quickstart：https://code.claude.com/docs/en/quickstart

Claude 專案常駐指令是 CLAUDE.md；專案級 Skills 是 `.claude/skills/<name>/SKILL.md`。不要把 Codex 的 `.agents/skills` 直接當 Claude 的正確路徑。

## 設計方法
- **houxin0010/distinctive-ai-design**：https://github.com/houxin0010/distinctive-ai-design
  - **審閱紀錄（2026-10-28，Claude Code）**：commit `92c68366767b98924fe2719c16659e7f1e93c7af`（2026-10-10）。檔案：`SKILL.md`、`references/review-and-media.md`、`agents/openai.yaml`（Codex 介面設定）、`tests/`（Python 靜態檢查與 Playwright fixture）、`docs/`。內容為方法論 markdown，無安裝腳本、無網路呼叫、無需密鑰。
  - **授權**：repo 未附 LICENSE 檔 → 預設保留所有權利，不得重新散布。因此本 repo **不收錄其內容**，僅提供 `scripts/install-distinctive-skill.sh` 由每位開發者自行從原 repo 安裝固定 commit（`.gitignore` 已排除）。
  - 方法採用：探索 3 個真正不同的概念 → brief → 真實截圖評審（獨立上下文、不給代碼與分數）→ 每輪 1–3 項修正、最多 2 輪 → 減法交付。PetOS 的實作紀錄見 `docs/DESIGN_EXPLORATION.md`、`docs/UI_REVIEW.md`。
- elayadesign/ai-design-skills：https://github.com/elayadesign/ai-design-skills（行銷官網／展示影片用，後台不採用長動畫規則）
- elayadesign/redesign-skill：https://github.com/elayadesign/redesign-skill（可供再設計參考，不強制安裝）

## Demo 素材
- 毛孩照片：以使用者已連接的 Canva AI 生成之**虛構**毛孩圖片（200×200），僅作 Demo，UI 內標示 DEMO，不聲稱為真實店家或真實寵物。檔案與來源見 `public/demo/pets/CREDITS.md`。原因：Unsplash／Wikimedia／Pexels 在本開發環境網路政策下無法存取（403）。

## 法規正式查核
- 農業部動物保護資訊網：https://animal.moa.gov.tw/
- 中華民國電子簽章法與個資法：依正式主管機關當期版本與專業意見核對。
- LINE Messaging API：https://developers.line.biz/en/docs/messaging-api/overview/

## 舊專案經驗（只作設計借鏡）
億客蔥抓餅 PWA：https://ikpancake.floot.app，曾實作排班、請假、打卡、薪資，手機優先；不要直接搬資料、密鑰或單店角色設計進 PetOS。
