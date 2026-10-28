# 開發 Backlog / Milestones

進度來源；執行後更新，不可假裝已完成。狀態：TODO / DOING / DONE / BLOCKED / PARTIAL。

| ID | 里程碑 | 完成定義 | 狀態 |
|---|---|---|---|
| M0-01 | 啟動專案、安裝/檢查 design skill、建立工具鏈 | dev server 啟動、CLAUDE.md 與 skills 可讀、測試可執行 | DOING |
| M0-02 | 視覺探索與 Design System | 有 3 個不同構圖概念、選定 brief、tokens、可重用元件 | TODO |
| M0-03 | 五個高擬真 UI / demo adapter | 5 頁可點擊、資料一致、Mobile/Desktop 適配 | TODO |
| M0-04 | Playwright 截圖與互動 QA | 390/1440 截圖、主要流程、溢出與 console 測試有報告 | TODO |
| M1-01 | Auth / shops / memberships / RLS | 兩店 + 多角色交叉權限測試 | TODO |
| M1-02 | 顧客＋毛孩＋照護＋照片 | 真實 DB + 私有圖 + 搜尋 + 體重時間紀錄 | TODO |
| M2-01 | 服務與員工營業時間 / 休假 | 服務時間/價格與資源配置一致 | TODO |
| M2-02 | 店員預約＋飼主線上申請 | 建立/確認/改期/取消，並發衝突測試過 | TODO |
| M3-01 | 報到→美容→待接回→交接 | 一筆預約完整服務流程，事件不可重複 | TODO |
| M3-02 | 基本付款與歷史 | 真實 DB、部分付款／退款、更正留痕 | TODO |
| M4-01 | 電子契約 | 模板版本、PDF、簽署保存與法規風險清單 | TODO |
| M4-02 | LINE OA 通知 | Mock E2E, 實際 credentials 待授權、失敗重試 | TODO |
| M5-01 | 包套、儲值、回訪、報表 | ledger、測試、報表口徑 | TODO |
| M6-01 | 住宿、庫存、採購、多門市、訂閱 | 等核心流程穩定再逐步建立 | TODO |

## 迭代模式
同一任務：需求→資料合同→實作→單元/整合→瀏覽器實測→截圖→修正→文檔→下一項。

## BLOCKED 和批准
正式雲端、第三方帳號、金流、法律確認、個資處理若被卡住，標為 BLOCKED，使用本機 / mock 完成其餘工作。不讓未授權的阻礙阻止全部開發。

## 視覺的設計 Gate
M0-02 探索不是只改配色：需提供 UI 密度和 layout 比較。M0-04 必須在實際 browser 擷取 390/1440；有空資料、失敗、載入狀態；最多 2 輪集中修正。未通過 Gate 不進行大規模 UI 量產。
