# SP Performance Hub｜標準化病人演出歷程管理平台

奇美醫院臨床技能中心使用的 SP（標準化病人）演出管理平台，把原本紙本記錄的演出資訊數位化：

- **Google Sheets**：主資料庫（長期保存、可追溯、可修正）
- **Google Calendar**：排程同步結果（管理員指定的行事曆，不邀請 SP）
- **LINE 手動提醒輔助**：產生文案、一鍵複製、人工標記通知狀態（**不會**自動發送）
- **年度成果儀表板**：只採計已完成且已核定的紀錄，並嚴格區分場次／人次／人時／SP 人數

> **正式系統網址**：<https://script.google.com/macros/s/AKfycbwqQfItOrF_RrMd4jcw3aEDnl7C0rNk_4gPvgW0SJ1_uSbei12P48IZRWdv3BveTsch/exec>（限授權管理員以 Google 帳號登入）
>
> **GitHub Pages 入口**：<https://luyun1224.github.io/Chimei-SP/>（「進入系統」連到上方正式網址；另有 [示範版](https://luyun1224.github.io/Chimei-SP/demo/)，使用虛構資料、不連線 Google）
>
> 手機也要用 GitHub 網址登入：請依 **[docs/MOBILE-DIRECT.md](docs/MOBILE-DIRECT.md)** 完成一次性設定。
>
> 部署步驟請見 **[docs/DEPLOY.md](docs/DEPLOY.md)**。

## 功能模組

| # | 頁面 | 重點 |
|---|---|---|
| 01 | 總覽 Overview | 今日／本週場次、本月 SP 人次、年度核定人時、明日待提醒 SP、待核定紀錄、近期排程、快捷操作 |
| 02 | 演出排程 Schedule | 月／週／清單三種檢視；點日期新增；卡片懸停預覽、點擊開啟側邊 Drawer；SP 衝突與重複登錄偵測；Calendar 同步狀態與重試；軟刪除與異動歷程 |
| 03 | LINE 提醒 Reminder | 依日期列出 SP、個別／總整理文字、一鍵複製、人工標記已通知（記錄人員與時間）、排程異動後提示重新通知、範本編輯與預覽 |
| 04 | SP 人員 Directory | SP 主檔 CRUD（SP_ID 不因改名改變）、狀態篩選、搜尋 |
| — | SP 個人履歷 | 年度／歷年時數、月度與歷年趨勢、教案與單位分布、完整明細（可展開）、匯出 CSV |
| 05 | 演出核定 Verification | 確認完成 → 逐一核定出席與實際時間（以分鐘儲存）、批次依預定時間核定、更正需原因並留稽核、取消核定 |
| 06 | 成果分析 Analytics | 年／月／SP／單位／教案／狀態篩選；KPI；圖表 A–H；點擊圖表鑽取；排序搜尋；CSV 匯出；可列印年度成果報告 |
| 07 | 系統設定 Settings | Calendar ID、管理員提醒、常用選項、連線檢查、備份、稽核紀錄 |

## 架構

```
┌──────────────────────── 瀏覽器（管理員） ────────────────────────┐
│ React + Vite + TypeScript + Tailwind + Motion + Recharts         │
│ （編譯為單一 index.html，由 Apps Script HtmlService 提供）       │
└───────────────┬──────────────────────────────────────────────────┘
                │ google.script.run → api(action, json)
┌───────────────▼──────────────── Apps Script（以使用者身分執行）─┐
│ server/gas/main.ts   doGet／api／setupSpreadsheet／白名單檢查     │
│ server/service.ts    業務邏輯：驗證、衝突、冪等、版本、稽核、同步 │
│ server/gas/sheetsRepo.ts      → Google Sheets（6 張工作表）       │
│ server/gas/calendarGateway.ts → Google Calendar（CalendarApp）    │
└──────────────────────────────────────────────────────────────────┘
```

- `shared/`：前後端共用的型別、時間工具（Asia/Taipei、字串運算避免 UTC 錯位）、驗證、統計、通知範本。
- `server/service.ts` 與執行環境無關；Apps Script 用 Sheets/Calendar 實作，測試與本機示範模式用記憶體實作，**兩邊跑的是同一份業務邏輯**。

### 資料表（Google Sheets）

| 工作表 | 主鍵 | 內容 |
|---|---|---|
| `SP人員主檔` | `spId` | SP 人員主檔 |
| `演出排程` | `sessionId` | 演出排程（狀態、Calendar Event ID、同步狀態、軟刪除、requestId、版本） |
| `演出明細` | `assignmentId` | 每場 × 每位 SP 一筆：出席、實際時間、核定分鐘、核定人與時間 |
| `LINE通知紀錄` | `notificationId` | 人工通知標記（只新增不覆寫；以最新一筆為準；含排程指紋） |
| `異動紀錄` | `auditId` | 所有異動前後內容、操作人、時間、原因 |
| `系統設定` | `key` | Calendar ID、範本、常用單位／教案／地點、門檻 |

### 統計口徑

- **場次**：至少一位 SP「已出席且已核定」的已完成演出
- **人次**：已出席且已核定的 SP 明細筆數
- **人時**：上述明細的核定分鐘數加總 ÷ 60
- **SP 人數**：有核定紀錄的不重複 SP

> 範例：1 場演出、3 位 SP 各演出 3 小時 → 1 場、3 人次、9 人時，每位 SP 個人 3 小時。
> 排程建立本身不計入；缺席、取消、軟刪除一律排除；報到準備時間不計入核定時數。

## 本機開發

```bash
npm install
```

```bash
npm run dev
```

開啟 <http://localhost:5173>。本機沒有 `google.script.run`，系統會自動進入**示範模式**：畫面頂端會明確標示，資料只存在瀏覽器 localStorage，日曆同步是模擬的。
可到「07 系統設定 → 示範模式工具」載入示範資料，或模擬日曆同步失敗來測試重試流程。

| 指令 | 說明 |
|---|---|
| `npm test` | 執行驗收測試（業務邏輯 + Sheets 存取層） |
| `npm run typecheck` | TypeScript 型別檢查 |
| `npm run build` | 產生 `gas/index.html` 與 `gas/Code.js` |
| `npm run push` | 建置並以 clasp 推送到 Apps Script |

## 驗收對照

| 驗收項目 | 驗證方式 |
|---|---|
| 1 場多名 SP → Sheets 產生 1 筆排程 + 每位 SP 1 筆明細 | `tests/service.test.ts`、`tests/gas-sheets.test.ts` |
| Calendar 只建立 1 個事件；編輯更新原事件不重複建立 | `tests/service.test.ts` |
| Google API 失敗不產生重複排程；重試不重複建立事件 | `tests/service.test.ts`（requestId 冪等、事件 tag 去重） |
| 複製 LINE 提醒不會自動寄送、不會自動標記 | 系統不含任何 LINE 串接；`notify.mark` 只能由按鈕觸發 |
| 人工標記已通知可保存，排程異動提示重新通知 | `tests/service.test.ts` |
| 核定後履歷與 Dashboard 同步更新；缺席與取消不計入 | `tests/service.test.ts` |
| 同一 SP 時間衝突提示 | `tests/service.test.ts`（後端）＋表單即時提示（前端） |
| 未登入／未授權無法存取 | `tests/service.test.ts`；Apps Script 端 `doGet`／`api` 白名單檢查 |
| 桌機、平板、手機可操作 | RWD 版面；手機收合導覽、週曆改逐日清單，不依賴 hover |

## 設計系統

色彩 Token（`src/styles.css`）：奶油白 `#F7F4ED`、深松綠 `#284A45`、鼠尾草綠 `#A8BCAF`、香檳金 `#C6A77A`、深墨灰 `#252B2D`、淡色區塊 `#ECEFE7`。
字體：Noto Sans TC／Noto Serif TC（標題）＋ Inter（數字）。支援 `prefers-reduced-motion`、鍵盤操作與清楚的焦點樣式。
圖表使用品牌的低彩度色，每張圖都另外提供數值標籤或表格，不只靠顏色辨識。
