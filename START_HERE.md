# PetOS · Claude Code 從零開發啟動包

這是 Claude Code 專用的專案規格與自動設計流程。自 2026-10-28 起，本 repo 已由 Claude Code 依規格開始實作（見 `docs/HANDOFF.md`、`docs/ROADMAP.md`），但仍不是可以直接部署商用的產品。

## 最快使用（Mac / Linux）
1. 取得此 repo（保留隱藏的 `.claude` 資料夾）。
2. 在專案根目錄啟動 `claude`，Claude Code 會讀取 `CLAUDE.md`。
3. 首次從零開始：貼入 `prompts/01_BOOTSTRAP.md`。
4. 下次新對話接續：貼入 `prompts/02_CONTINUE.md`。
5. 對視覺不滿意：使用 `/petos-ui-design` 或 `prompts/03_UI_REVIEW.md`；每次修改 UI 後執行 `/petos-visual-qa`。
6. 第三方設計 skill：執行 `scripts/install-distinctive-skill.sh`（見下方說明）。

## 開發指令
請見 `README.md`。

## 重要檔案
- `CLAUDE.md`：Claude Code 每次要遵循的專案規則。
- `docs/PRD.md`、`docs/USER_FLOWS.md`、`docs/EDGE_CASES.md`：要做什麼、店家每天怎麼使用及異常情境。
- `docs/DESIGN_DIRECTION.md`、`docs/SCREEN_BLUEPRINTS.md`：避免「AI 罐頭 UI」的設計方向、五個畫面的精確規格。
- `docs/DESIGN_EXPLORATION.md`：M0-02 三種構圖探索與選擇紀錄。
- `docs/DATA_MODEL.md`、`docs/ARCHITECTURE.md`、`docs/SECURITY_AND_COMPLIANCE.md`：資料、工程、法規風險。
- `docs/ROADMAP.md`、`docs/QA_ACCEPTANCE.md`、`docs/HANDOFF.md`、`docs/UI_REVIEW.md`：里程碑、測試標準、交接、視覺評審紀錄。
- `.claude/skills/`：專案級 PetOS Skills。
- `docs/MARKET_AND_PRICING.md`、`docs/REFERENCES.md`：競品與商業背景、外部參考。

## 關於第三方 distinctive-ai-design
原作者 repo（https://github.com/houxin0010/distinctive-ai-design）未附 LICENSE 檔，因此**不把其內容提交進本 repo**。
`scripts/install-distinctive-skill.sh` 會將固定 commit 安裝到 `.claude/skills/distinctive-ai-design/`（已列入 `.gitignore`）。
審閱紀錄見 `docs/REFERENCES.md`。專案自訂的 `petos-ui-design` 仍是優先的產品規格。

## 權限與預算
開發應先能在本機或測試環境運行；需要雲端帳密、真實 LINE OA、商用金流、正式上線或付費資源時，停在可驗收的替代實作並列明阻礙，不自動開通付費服務或操作真實顧客資料。

## 注意視覺圖
原始概念圖（`assets/petos-reference-concept.png`，本 repo 未收錄）是初期 AI 產生的圖，可能有錯字、假資料和不合理比例，不能當成逐像素複製的需求；以 `docs/SCREEN_BLUEPRINTS.md` 與實際瀏覽器測試為準。
