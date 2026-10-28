# 首次貼給 Claude Code 的完整執行指令

你正在一個全新的 PetOS 專案根目錄中。請先讀取 CLAUDE.md、START_HERE.md、docs/ 和 .claude/skills/。這些已經整理了完整聊天需求，不要要求我重述過去的對話。

你有權自主做產品與技術細節決策，只要不碰正式付費、真實個資、商用金流、破壞性資料庫、未授權部署。遇到這些限制，改用本機/測試 stub 並記錄 BLOCKED，不要讓整個開發停止。

現在依序做以下實際工作（不是只回覆計畫）：
1. 檢查 Node/npm、Git、Claude Code skills、瀏覽器/Playwright、Supabase CLI 和本機可用環境；不要假裝安裝已成功。
2. 從 https://github.com/houxin0010/distinctive-ai-design 讀取根目錄 SKILL.md / README 和授權安全資訊；若適合、來源可信且沒有未知風險，安裝到本專案 .claude/skills/distinctive-ai-design/，連同 references 一起保留並記錄來源 commit；若不宜安裝，用內建的 /petos-ui-design 進行同等流程並說明原因。
3. 讀取 docs/DESIGN_DIRECTION.md 等設計規格。使用 /petos-ui-design；首次探索至少三種不同構圖和資訊組織的品牌概念，記錄簡短比較，然後自主選擇最適合的路線。不要只是把既有 AI 示意圖原樣畫出來。
4. 用 React + Vite + TypeScript + Tailwind + shadcn/ui 建立實際可跑的前端，開發共用 Design Tokens/元件，完成 5 個高擬真可操作頁面：今日工作、毛孩個人檔案、預約行事曆、預約詳情與服務狀態、飼主四步線上預約。資料先用固定虛構 demo fixtures，但需標示 Demo，功能間資料與狀態必須相互連動。
5. 設定 Playwright，實際運行頁面，在 390px 和 1440px 截圖；測試互動、異常、溢出、可讀性、瀏覽器錯誤。每輪優先改善最明顯 1～3 個問題，最多先兩輪。儲存截圖和測試結果。
6. 對照 docs/ROADMAP.md 完成 M0，記錄 docs/HANDOFF.md，通過 Gate 後依相依順序自主進行 M1 (Auth/RLS/毛孩資料)、M2 (預約/排程)、M3 (美容流程/基本收款)。若外部 credentials 阻擋，維持代碼可測，報告 blocker。
7. 不建立大量未連 DB 的空殼頁面，不把 Mock 裝成正式 API，不以「程式已編譯」當作功能完成。

每完成一個里程碑請報告：可操作的路徑、實際測試結果、截圖位置、未完成/未測項目、下一個可執行任務。請直接從環境檢查與 M0 開始動手。
