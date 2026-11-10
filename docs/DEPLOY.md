# 部署指南｜SP Performance Hub（Google Apps Script 同源部署）

本文件說明如何把系統部署到 **Google Apps Script Web App**，資料存放在您的 **Google 試算表**，排程同步到您指定的 **Google 日曆**。
整個過程不需要建立 OAuth Client、不需要 Client Secret、Refresh Token 或服務帳戶金鑰，也不需要另外架設伺服器。

> 需要準備的東西：一個 Google 帳號（建議使用醫院 Google Workspace 帳號）、一台安裝 Node.js 20 以上版本的電腦。

---

## 0. 為什麼選擇方案 A（Apps Script 同源部署）

| 項目 | 方案 A：Apps Script HTML Service（採用） | 方案 B：GitHub Pages + 雲端後端 |
|---|---|---|
| 登入／身分 | Google 帳號強制登入，由 Google 處理 | 需自建 OAuth 流程與 Session |
| 機密憑證 | **沒有任何密鑰**，以使用者本人授權存取 | 後端需保管 Client Secret / 服務帳戶金鑰 |
| Calendar | 直接寫入管理員有權限的行事曆 | 服務帳戶需另外被分享行事曆 |
| 主機與費用 | 免費、免維運 | 需雲端主機、網域、憑證與維運 |
| 適合情境 | 單一單位、少數管理員、長期維護 | 大量外部使用者、需整合多系統 |

臨床技能中心只有少數行政管理員使用，方案 A 最穩定、維護成本最低，也最符合「不在前端放密鑰」的要求。

### 安全模型

- Web App 設定為 **以「存取網頁應用程式的使用者」身分執行**（`executeAs: USER_ACCESSING`）：每位管理員用自己的 Google 帳號授權，系統不保管任何人的權杖。
- 存取範圍設為 **網域內使用者**（`access: DOMAIN`）或 **任何已登入 Google 帳號的使用者**（`ANYONE`），**絕不使用匿名（ANYONE_ANONYMOUS）**。
- 每次 API 呼叫都會在伺服器端比對 `ADMIN_EMAILS` 白名單，不在名單內就拒絕（`FORBIDDEN`）。
- 試算表與行事曆**只分享給管理員**。即使有人拿到網址，沒有試算表權限也讀不到任何資料（雙重保護）。
- 所有寫入都在 `LockService` 鎖內完成；每筆資料都有 `version` 欄位，防止同時編輯互相覆蓋；建立排程時帶 `requestId`，網路重送不會重複建立。
- 每次新增、修改、取消、刪除、核定、更正、通知標記都會寫入 `異動紀錄`。

---

## 1. 建立 Apps Script 專案

1. 到 <https://script.google.com> → **新專案**，命名為 `SP Performance Hub`。
2. 左側 **專案設定（⚙）**：
   - 勾選「在編輯器中顯示 appsscript.json 資訊清單檔案」。
   - 時區選 **(GMT+08:00) 台北**。
   - 複製 **指令碼 ID（Script ID）**，下一步會用到。

## 2. 在電腦上建置並推送程式

```bash
git clone <本 repository>
```

```bash
cd Chimei-SP && npm install
```

登入 clasp（Google 官方的 Apps Script 命令列工具；會開啟瀏覽器要求授權）：

```bash
npx clasp login
```

建立 `.clasp.json`（此檔已被 .gitignore 排除，不會提交）：

```bash
cp .clasp.json.example .clasp.json
```

用文字編輯器把 `.clasp.json` 裡的 `scriptId` 換成第 1 步複製的 Script ID，然後建置並推送：

```bash
npm run push
```

此指令會把伺服器程式打包成 `gas/Code.js`，連同 `gas/appsscript.json` 推送到 Apps Script 專案。
前端畫面（app.js / app.css）由 GitHub Pages 的 `/app/` 提供，Apps Script 專案中**不需要 index.html**；`doGet` 只回傳一段載入前端的 HTML。

> 不想安裝工具：直接把 `apps-script/Code.gs` 與 `apps-script/appsscript.json` 貼到 Apps Script 編輯器即可。

> 若出現 “User has not enabled the Apps Script API”，請到 <https://script.google.com/home/usersettings> 開啟「Google Apps Script API」後重試。

## 3. 初始化 Google 試算表

1. 回到 Apps Script 編輯器，重新整理後選擇函式 **`setupSpreadsheet`** → **執行**。
2. 第一次執行會要求授權（試算表、日曆、取得您的電子郵件），請以**系統管理員帳號**同意。
3. 執行完成後，「執行記錄」會顯示新試算表的網址。系統會自動：
   - 建立試算表 `SP Performance Hub 資料庫`，並把 ID 寫入 Script Properties 的 `SPREADSHEET_ID`；
   - 建立 6 張工作表與表頭：`SP人員主檔`、`演出排程`、`演出明細`、`LINE通知紀錄`、`異動紀錄`、`系統設定`；
   - 工作表、欄位名稱與狀態值（預定／已完成、已出席／缺席…）皆為中文；
   - 把所有欄位設為「純文字」格式，避免 Google 自動把日期、時間轉成其他格式；
   - 寫入預設設定（通知範本等）；
   - 若 `ADMIN_EMAILS` 為空，把您設為第一位管理員。

> 已有試算表時：先在 Script Properties 新增 `SPREADSHEET_ID = <試算表 ID>` 再執行 `setupSpreadsheet`。這個函式可以重複執行，只會補上缺少的工作表或欄位，**不會刪除既有資料**；舊版英文工作表（SP_Master 等）會自動改名為中文，英文表頭與狀態值也會轉為中文。

## 4. 設定管理員白名單

Apps Script → **專案設定** → **指令碼屬性（Script Properties）**：

| 屬性 | 值 | 說明 |
|---|---|---|
| `SPREADSHEET_ID` | 自動寫入 | 主資料試算表 |
| `ADMIN_EMAILS` | `a@chimei.org.tw,b@chimei.org.tw` | 允許登入的管理員，以逗號分隔 |

每位管理員也要被加為**試算表的編輯者**（試算表右上「共用」→ 只加入特定人員，**不要**設成「知道連結的任何人」）。

## 5. 建立專用 Google 行事曆並設定 Calendar ID

1. Google 日曆 → 左側「其他日曆」＋ → **建立新日曆**，例如「SP 演出排程」。
2. 該日曆的「設定和共用」：
   - **與特定使用者共用**：加入每位管理員，權限選「**變更活動**」；
   - 不要勾選「公開這個日曆」。
3. 在「整合日曆」區塊複製 **日曆 ID**（格式通常為 `xxxx@group.calendar.google.com`）。
4. 部署完成後，進入系統 **07｜系統設定** 貼上 Calendar ID → 儲存 → 按 **連線檢查** 確認顯示日曆名稱。

> 系統建立的事件**不會加入任何來賓**，所以不會寄送邀請或通知信給 SP。
> 如果開啟「管理員提醒」，日曆事件會加上提前提醒（預設 1440 分鐘 = 前一天），只會提醒有權限看到此日曆的管理員，**不能代替** LINE 人工通知。

## 6. 部署為網頁應用程式

1. Apps Script 右上 **部署** → **新增部署作業** → 類型選 **網頁應用程式**。
2. 設定：
   - 說明：`v1`
   - **執行身分：存取網頁應用程式的使用者**
   - **誰可以存取：** 若使用醫院 Google Workspace 帳號，選「**<您的網域> 中的所有人**」；若使用一般 Gmail 帳號，選「**任何擁有 Google 帳戶的使用者**」，並把 `gas/appsscript.json` 的 `"access": "DOMAIN"` 改為 `"ANYONE"` 後重新 `npm run push`。（兩種都需要登入；真正的授權由 `ADMIN_EMAILS` 白名單與試算表共用權限控制。）
3. 按 **部署**，複製「網頁應用程式網址」（`https://script.google.com/macros/s/.../exec`），提供給管理員使用。
4. 每位管理員第一次開啟時都要按「授權」，同意系統以**本人身分**讀寫試算表與日曆。

### 之後更新版本

```bash
npm run push
```

推送後到 **部署 → 管理部署作業** → 編輯 → 版本選「新版本」→ 部署，網址不會改變。

---

## 7. 上線前檢查清單

- [ ] `setupSpreadsheet` 執行成功，6 張工作表都已建立
- [ ] `ADMIN_EMAILS` 只包含授權管理員
- [ ] 試算表只共用給管理員（不是「知道連結的任何人」）
- [ ] 行事曆只共用給管理員（「變更活動」權限），沒有公開
- [ ] 系統設定 → 連線檢查：試算表與行事曆都顯示正常
- [ ] 用**非白名單帳號**開啟網址 → 應顯示「無存取權限」
- [ ] 新增 1 場、多位 SP 的測試排程 → `演出排程` 1 列、`演出明細` 每位 SP 各 1 列、日曆只有 1 個事件
- [ ] 修改測試排程的時間 → 日曆原事件時間更新，沒有多出新事件
- [ ] 取消測試排程 → 日曆事件被移除，系統保留「已取消」紀錄

## 8. 備份與資料維護

- **系統設定 → 建立 Google 試算表備份副本**：把 6 張工作表複製到新試算表（存在操作者的雲端硬碟）。
- **系統設定 → 下載完整 JSON**：離線保存完整資料。
- 也可以在試算表使用「檔案 → 版本記錄」還原。
- 請勿直接在試算表手動刪除列或修改 ID 欄位；需要修正時請在系統中操作，才會留下稽核紀錄。

## 9. 常見問題

| 狀況 | 處理方式 |
|---|---|
| 開啟顯示「無存取權限」 | 確認帳號在 `ADMIN_EMAILS` 中，且已登入正確的 Google 帳號（多帳號登入時，可用無痕視窗只登入一個帳號） |
| 顯示「尚未設定 SPREADSHEET_ID」 | 在編輯器執行 `setupSpreadsheet` |
| 日曆同步失敗：找不到行事曆或沒有權限 | 確認 Calendar ID 正確，且行事曆已以「變更活動」權限共用給目前的操作帳號 |
| 同步失敗後如何處理 | 排程資料已保存；在排程詳情按「重試同步」。系統會用事件標記找回已建立的事件，不會重複建立 |
| 「這筆資料剛剛已被其他人修改」 | 其他管理員同時修改了同一筆資料，系統已重新載入，請確認後再操作 |
| 複製按鈕沒反應 | 部分瀏覽器限制 iframe 的剪貼簿權限；系統會改用備援方式，若仍失敗請手動選取文字複製 |

## 10. 需要的 Google 授權範圍（OAuth scopes）

定義在 `gas/appsscript.json`，只申請必要的最小範圍：

| Scope | 用途 |
|---|---|
| `https://www.googleapis.com/auth/spreadsheets` | 讀寫資料試算表、建立備份副本 |
| `https://www.googleapis.com/auth/calendar` | 在指定行事曆建立、更新、刪除演出事件 |
| `https://www.googleapis.com/auth/userinfo.email` | 取得操作者 Email，用於白名單檢查與稽核紀錄 |
