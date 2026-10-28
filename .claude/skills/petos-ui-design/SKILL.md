---
name: petos-ui-design
description: PetOS 專案的 UI 設計規則與流程。新增頁面、大幅修改布局、重新設計 PetOS 任一畫面（今日工作、毛孩檔案、行事曆、預約詳情、飼主預約或新模組）時使用。普通錯字或單一樣式修正不需要。
---

# PetOS UI 設計

PetOS 是台灣寵物美容店的店務系統。設計目標：「店務有秩序，照顧更有溫度」。視覺品質是競爭優勢，但**功能資訊永遠優先於裝飾**。

## 0. 先讀
- `docs/DESIGN_DIRECTION.md`（A Studio Ledger／B Pet Dossier／C Quiet Concierge）
- `docs/DESIGN_TOKENS.md`、`docs/SCREEN_BLUEPRINTS.md`
- `docs/DESIGN_EXPLORATION.md`（已選定方向與捨棄理由，**沿用，不重新探索**，除非使用者要求重設計）
- 若 `.claude/skills/distinctive-ai-design/` 存在，可一併套用其「探索→定義→截圖評審→減法」方法（沒有時執行 `scripts/install-distinctive-skill.sh`）。

## 1. 每個畫面先回答
1. 使用者是誰（櫃檯／店長／美容師／飼主）、在什麼時刻用（手忙腳亂的服務中、早上開店、晚上在家預約）？
2. **當前最重要的一件事**是什麼？第一視線看到什麼？
3. 毛孩照片、名字、時間、狀態的主從順序？
4. 照護注意事項是否在需要照護的那一刻出現？
5. 390px 與 1440px 各自的構圖（不是等比縮放）？

## 2. 不可打破的資訊
- 毛孩識別：頭像（40 搜尋／52 列表／96 檔案）＋名字＋品種＋飼主。同名毛孩必須可區分。
- 注意事項：內容＋來源（飼主提供／美容師觀察）＋更新日期；未填寫顯示「尚未記錄」，不得當診斷。
- 體重：kg＋測量日期；未知顯示「未提供」，不得顯示 0 kg。
- 狀態：預約／付款／契約／通知四條各自獨立，以文字＋圖示呈現，不只靠顏色。
- 金額：NT$ 整數，千分位；估價用「起」。
- 待確認（pending）絕不說成「預約成功」。
- Demo 資料需有 DEMO 標示。

## 3. 視覺規則（摘要）
- Token 一律用 `src/styles/index.css` 的 CSS 變數（Tailwind `bg-canvas`、`text-ink`…），不要寫死色碼。
- 間距 4/8/12/16/24/32/48/64；圓角：卡 12、彈層 16、輸入/按鈕 8；巢狀容器不要再加圓角卡。
- 用分隔線、留白、字重做層級，**不要**疊卡片、三排 KPI、大漸層、陰影堆疊、腳印裝飾、彩色圓形 icon。
- 字級：12 只給註解；正文 16；手機主要列表名字 17–18 bold。
- 一畫面一個主要 CTA（primary 填色），其他用次要樣式。可點擊目標 ≥ 44×44。
- 動態 100–300ms、尊重 `prefers-reduced-motion`。

## 4. 元件
優先使用既有元件：`src/components/ui/*`（Button、Sheet、Tabs、Field…）、`src/components/pet/*`（PetAvatar、AttentionList、WeightLine）、`src/components/appointment/*`（StatusLabel、AppointmentRow、PaymentBadge）。新增元件前先確認沒有可用的。

## 5. 完成前
執行 `/petos-visual-qa`。沒有真實截圖不得宣稱完成。在 `docs/UI_REVIEW.md` 記錄評審與修正。
