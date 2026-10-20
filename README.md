# MoveLab 動作分析 PWA

以 React + Vite + MediaPipe Pose Landmarker 建立的手機優先動作分析網頁，可部署至 Netlify，並可在 iPhone Safari「加入主畫面」。

## 功能
- 多頁面：總覽、動作分析、分析紀錄、設定
- 相機即時骨架追蹤（MediaPipe Pose Landmarker）
- 深蹲次數估算、膝關節角度、肩關節 2D 角度、軀幹傾斜角度
- 校正桿：在相機畫面點選 A/B 兩點，輸入真實距離（cm），計算 px/cm
- 使用 IndexedDB 在目前裝置保存紀錄
- 匯出 CSV（繁體中文欄位與 UTF-8 BOM）
- PWA manifest、iOS 主畫面 icon、Service Worker（透過 vite-plugin-pwa）

## 本機開發
```bash
npm install
npm run dev
```

## 建置與 Netlify 部署
1. 將整個專案資料夾上傳到 GitHub。
2. 在 Netlify 選擇 Add new site → Import an existing project，連接該 GitHub repo。
3. Build command：`npm run build`
4. Publish directory：`dist`
5. Deploy 後用 iPhone Safari 開啟 HTTPS 網址，按「分享」→「加入主畫面」。

## 重要說明
- 相機需要 HTTPS 或 localhost；Netlify 網址預設使用 HTTPS。
- MediaPipe 模型與 WASM 從 CDN 載入，第一次啟動需網路。
- 資料目前儲存在「目前瀏覽器／裝置」的 IndexedDB，不是雲端資料庫。不同手機或瀏覽器不會自動同步。若要多人、跨裝置登入與雲端備份，請再接 Supabase/Firebase 等後端並設定資料表及權限。
- 肩關節活動角度以 2D 肩—髖—手腕幾何近似；軀幹傾斜角不是脊椎節段活動角度。單一相機無法準確量測真正脊椎活動度。要做研究或臨床用途，需標準化拍攝、驗證流程及專業設備。
- 目前是可用原型，建議在目標 iPhone/iOS 版本測試相機方向、效能及背景切換。
