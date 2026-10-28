# 核心作業流程與狀態機

## F01 店家開通
註冊→建立店名/時區/聯絡方式→設定營業日與休假→建立服務（價格、時長、緩衝）→邀請員工→設定員工可服務項目→建立第一筆毛孩/飼主→首次預約→取得店家專屬預約網址。保留未完成進度。

## F02 店員預約
搜尋 owner/pet（姓名、電話、品種）→新建或選擇→選服務、加購、預估時長及價格→美容師、時間→原子檢查容量→確認→新預約及事件歷程落庫。改期保留 appointment id 及更改歷史，不得刪掉重建。

## F03 飼主線上申請
店家公開網址→服務→可供申請時段→身分驗證／毛孩→看規則與價格→送出 pending。pending 不保證已保留，店員或規則確認時再進行容量鎖定；衝突則提示另選。不允許透過姓名/電話直接讀其他飼主資料。

## F04 接待→美容→交接
confirmed → checked_in（核對毛孩、注意事項、必要簽約）→ in_service（服務起始記錄）→ 點「完成美容」開 finish_review 前端草稿（正式狀態不變）→確認紀錄（正常可快速完成，異常必填並按規則升級）→ ready_pickup（記錄完工時間、建立通知工作，並保持通知狀態獨立）→結帳（另記 payment status）→實際接回→ completed。付款未完成的交接需店長授權並留事件紀錄。

## 預約狀態
pending, confirmed, checked_in, in_service, ready_pickup, completed, cancelled, no_show。
- 已取消、未到店、已完成不可任意回到服務中。
- 服務中若遇到受傷、異常中止，走專用 interrupted／incident 處理，不應只當取消；事故細節待店家流程確認。
- finish_review 只是 UI 階段，不是 DB 狀態。
- 每次狀態變動由後端確認合法轉移、角色、租戶與版本號，記錄事件及 actor。

## 三條獨立狀態
- 預約：上列 appointment status。
- 付款：unpaid, partially_paid, paid, partially_refunded, refunded。
- 契約：not_required, pending, signed, superseded。
- 通知：queued, sent, failed, not_applicable。送出成功不表示已閱讀。

## F05 契約
載入適用模板及版本→審閱→必要資訊驗證→簽署→產 PDF、文件完整性資訊、身分和時間證據→私有保存、雙方授權取得。變更模板不覆寫既有已簽約版本。正式商用前法律審查。

## F06 結帳/包套/儲值
原服務＋已確認加購→優惠/包套/儲值試算→實際收款→付款交易（支援部分付款/退款）→ ledger 與餘額交易式更新→後台回顯。相同 idempotency key 只能成功生效一次。

## F07 LINE
正式資料提交→同一資料交易寫 transactional outbox 通知→獨立 worker 寄 LINE→處理節流／錯誤重試→保存實際 API 結果及時間。各店自己的 OA secrets；開發模式只使用 mock provider。行銷通知需另看飼主同意。

## F08 物料及庫存（P2）
採購/進貨→庫存異動 ledger→美容耗材消耗（後續可用服務配方）/商品銷售→退貨/報廢/盤點→庫存與低庫存警示。禁止直接覆寫無異動紀錄的餘額。

## 主要錯誤情境
同一美容師同時確認兩筆衝突、請假影響已確認預約、重複點完工、網路斷線、兩位員工同改、LINE 故障、付款重試、照片跨租戶讀取、已簽契約變更、退款後報表口徑。詳見 QA。
