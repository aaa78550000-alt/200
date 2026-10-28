# 資料模型規格（語意及限制，正式 SQL 見 `supabase/migrations/`）

## Entity 清單
- shops(id, slug, name, timezone, ... )；未來 locations(id, shop_id,...)。
- user_profiles(user_id, ...) + shop_memberships(shop_id,user_id,role,status,...) + staff_profiles(shop_id,user_id,...)。一人可同時有 management role 及美容排程身份。
- customers(id,shop_id,name,phone,consent_flags,...)；pets(id,shop_id,primary_customer_id,name,species,breed,sex,birthdate,photo_key,...)。
- pet_weight_records(id,pet_id,shop_id,weight_kg,measured_at,recorded_by,...)；pet_notes(id,pet_id,shop_id,category,source,body,updated_by,updated_at,...)；pet_media(id,pet_id,shop_id,appointment_id,category,storage_key,...)；pet_preferences。
- services(id,shop_id,name,base_price,duration_minutes,buffer_minutes,...)；staff_services；operating_hours；staff_availability；time_off。
- appointments(id,shop_id,pet_id,customer_id,staff_id,starts_at,ends_at,status,version,source,...)；appointment_items(appointment_id,service_id,price_snapshot,duration_snapshot,approval_status,...)；appointment_events。
- care_records, care_events, incident_reports（若要正式異常流程）；contract_templates, contract_versions, signed_contracts。
- payment_transactions(id,shop_id,appointment_id,amount_ntd,type,method,idempotency_key,created_at,...)；package_ledger, wallet_ledger。
- notification_jobs(id,shop_id,appointment_id,kind,status,retry_count,...)；audit_logs。
- P2 products, suppliers, inventory_movements, purchase_orders, boarding_resources, boarding_reservations；P3 subscriptions。

## 強制資料規則
- 多租戶所有表具可靠 shop scope；foreign key 必須證明同店關聯，不能僅靠外表 key 存在；RLS 每角色獨立測試。
- appointment 的時間必須服務實際 duration + buffer；確認時在交易內檢查同店同員工或同資源不能重疊。注意取消和 no-show 不應占用已取消時段。
- 服務價格和工時存 snapshot，以免後續價格變更影響歷史；顧客預約頁顯示當下有效價格。
- 避免重複提交（client request id + unique constraint）；事件歷史 append-only 或有嚴格審核的修正途徑。
- 付款、儲值與包套次數以交易紀錄推導或在交易內正確維護快取，禁止無稽核直接覆寫金額。
- 已簽署契約版本及 PDF 雜湊不可被後續模板更新覆寫。
- 圖片存私有 bucket，只能短時授權讀取；檔案路徑與 DB 都需驗證租戶。
- 重要注意事項來源與更新時間不可缺失；不要自行推論醫療診斷。
- 時間用 UTC / timestamptz 存，台灣 Asia/Taipei 呈現；價格 NTD 整數。索引包含 (shop_id, starts_at), customer/owner 搜尋鍵，事件外鍵等。

## 初期 Migration 實作任務
1. 定義 enum 或 check constraint（含保留的業務狀態）。
2. 資料表及外鍵（含 composite shop_id 關聯）。
3. RLS/Policy 及測試角色資料。
4. DB function / Edge Function 進行預約原子確認。
5. Seed 兩店，各有員工和虛構飼主毛孩；測試跨店不可讀。
6. 通知與交易事件冪等 index。
