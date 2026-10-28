---
name: petos-visual-qa
description: PetOS 的瀏覽器視覺與互動驗收。每次完成 UI 修改後使用：以固定 demo 資料在 Chromium 390/1440（加測 375/768/1024）真實截圖，檢查 console error、水平溢出、觸控目標、空/錯誤/載入狀態，並做最多兩輪 1–3 項修正。
---

# PetOS 視覺 QA

截圖不是驗收的全部，但**沒有截圖就沒有通過**。

## 步驟
1. 確認固定資料：demo fixture 日期 2026-10-28（Asia/Taipei），`VITE_DATA_MODE=demo`。
2. 執行：
   ```bash
   npm run test:e2e
   ```
   - `tests/e2e/visual.spec.ts`：五頁＋關鍵展開狀態，輸出 `artifacts/screenshots/<page>-<viewport>.png`
   - 同時檢查：console error = 0、`document.scrollingElement.scrollWidth <= innerWidth`、主要按鈕 ≥ 44px
   - `tests/e2e/flows.spec.ts`：互動流程（完工→待接回→收款→接回、飼主四步預約、錯誤狀態）
3. 用 Read 工具**實際看**截圖（至少 390 與 1440 各五頁）。回答 `docs/DESIGN_DIRECTION.md` 的 7 個評審問題。
4. 若可用子代理：給新上下文的評審者只看截圖＋使用者任務＋brief（不要給程式碼、歷史、分數目標），使用 distinctive-ai-design 的評審提示。否則明確標註「自查」。
5. 每輪只修 1–3 個影響最大的問題，重拍截圖比較；最多兩輪。
6. 更新 `docs/UI_REVIEW.md`：輪次、問題、修正、前後截圖路徑、未解決項目。
7. 不要把截圖設成 approved baseline；不要為了讓測試通過而改測試門檻。

## 不能由截圖證明（另標 NOT RUN 或另有測試）
RLS／權限、並發、付款冪等、效能、法規。
