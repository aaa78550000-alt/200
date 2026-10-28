# HANDOFF｜PetOS 開發交接

> 每個里程碑結束更新。最後更新：2026-10-28（Claude Code）。

## 目前狀態一句話
M0 完成：五個核心畫面在 demo adapter 上可完整操作（預約→報到→美容→完工→待接回→收款→交接），390/1440 截圖與 48 個 E2E、22 個單元測試通過。M1 起改接真實資料庫。

## 環境檢查（2026-10-28）
| 項目 | 結果 |
|---|---|
| Node / npm | v22.22.0 / 10.9.4 |
| Git | 2.43.0 |
| Playwright / Chromium | 1.63.0 預裝（`@playwright/test@1.63.0` 對齊） |
| Supabase CLI | 2.122.0（npm devDependency） |
| Docker | 可啟動 daemon；Docker Hub 可拉取；`public.ecr.aws` 回應 Data limit exceeded |
| PostgreSQL | 本機 16（`/usr/lib/postgresql/16`）＋ Docker `postgres:16-alpine`、`supabase/postgres:15.8.1.085` |
| 外部圖庫 | Unsplash／Wikimedia／Pexels 被網路政策擋（403）→ 改用使用者 Canva 生成虛構毛孩照（見 `public/demo/pets/CREDITS.md`） |
| distinctive-ai-design | 已審閱 commit `92c6836`；無 LICENSE → 不入 repo，以 `scripts/install-distinctive-skill.sh` 本機安裝 |

## 可操作路徑（`npm run dev`）
- `/app/today` 今日工作：店內／接下來／已結束／待確認申請；快速動作（完成美容、收款・交接、報到、開始美容）；≥1280px 右側常駐詳情，1024–1279px 抽屜，手機全螢幕。
- `/app/pets`、`/app/pets/:id`：搜尋（名字/品種/飼主/電話，同名標示）；檔案含注意事項（來源＋日期）、體重歷史、美容紀錄、相簿（分類）、記錄體重、新增注意事項、帶入毛孩新增預約。
- `/app/calendar`：桌面美容師欄×時間軸（緩衝、午休、休假、店休、現在線、待確認虛線）、日/週；點空白新增（帶入時間＋美容師）；手機週列＋列表/單人時間軸。
- `/app/appointments/:id`：確認申請（指派＋衝突提示）、報到、開始、加購（需飼主同意才計費）、完成美容（finish_review 草稿、異常必填）、待接回通知（LINE 模擬、失敗可重試）、收款（部分/退款、冪等鍵）、交接（未付款需店長授權留紀錄）、改期（保留 id 與歷程）、取消、未到店、歷程。
- `/book/calm-studio`：四步飼主申請（服務→時段→毛孩/身分（新客簡填或手機 OTP 驗證帶入）→確認）；結果頁「已收到申請，等待店家確認」；時段被搶回到第二步且保留草稿。

## 測試證據
| 指令 | 結果 |
|---|---|
| `npm run typecheck` | 通過 |
| `npm test` | 22 passed（狀態機、金額、Asia/Taipei 日期、可預約時段、冪等、版本衝突、OTP 不洩漏、改期保留 id） |
| `npm run test:e2e` | 48 passed、2 skipped（僅桌面執行的項目在手機專案跳過）；每頁 console error = 0、無水平溢出（390/375/768/1024/1440） |
| 截圖 | `artifacts/screenshots/*-mobile.png`、`*-desktop.png`、`state-*`、`flow-*`；設計迭代 `artifacts/visual/round0..2/` |

### E2E 對照（demo 層級；DB 層級見 M1+）
E03 ✔、E04 ✔、E05（UI 模擬＋單元）✔、E06 ✔、E07 ✔、E08 ✔、E09 ✔、E10 ✔、E11 ✔、E12（單元）✔、E14 ✔、E16 ✔、E17 ✔、E18 ✔。
E01（開店流程）、E02 照片上傳、E13 契約、E15 跨店：**NOT RUN**（M1/M4）。

## 已知限制／未完成
- Demo 資料存在瀏覽器 localStorage，是展示用；不是正式資料。
- 照片上傳、私有 Storage：M1-02。
- 服務/營業時間/員工的編輯 UI：M2-01（目前唯讀）。
- 電子契約：M4（畫面只顯示契約狀態）。LINE 為 mock。
- 視覺評審為自查，尚無獨立評審。

## 下一個可執行任務
M1-01：Supabase migrations（shops / memberships / staff / RLS）＋ 兩店 seed ＋ RLS 交叉權限測試。
