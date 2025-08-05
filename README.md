# ⚡ 閃電字卡 (Lightning Flashcard)

一個部署在 Cloudflare Worker 上的快翻字卡應用，使用 D1 數據庫作為後端存儲。

## 🌟 功能特色

- 🚀 **快速翻卡**: 點擊字卡即可翻轉查看答案
- 📊 **學習統計**: 實時追蹤學習進度和正確率
- 🏷️ **分類管理**: 支持按分類和難度篩選字卡
- ➕ **自定義內容**: 可以添加自己的字卡內容
- 📱 **響應式設計**: 支持手機和桌面設備
- ⌨️ **鍵盤快捷鍵**: 支持空格翻卡、方向鍵切換等
- ☁️ **雲端部署**: 基於 Cloudflare Worker，全球快速訪問

## 🛠️ 技術棧

- **前端**: HTML5, CSS3, JavaScript (Vanilla)
- **後端**: Cloudflare Worker
- **數據庫**: Cloudflare D1 (SQLite)
- **部署**: Cloudflare Workers

## 📦 安裝和部署

### 1. 安裝依賴

```bash
npm install
```

### 2. 創建 D1 數據庫

```bash
# 創建數據庫
npm run db:create

# 初始化數據庫結構和示例數據
npm run db:init
```

### 3. 配置 wrangler.toml

編輯 `wrangler.toml` 文件，更新以下配置：

```toml
[[d1_databases]]
binding = "DB"
database_name = "flashcard-db"
database_id = "your-actual-database-id"  # 替換為實際的數據庫 ID
```

### 4. 本地開發

```bash
# 啟動本地開發服務器
npm run dev
```

### 5. 部署到 Cloudflare

```bash
# 部署到生產環境
npm run deploy
```

## 🎮 使用方法

### 基本操作

1. **載入字卡**: 選擇分類和難度後點擊「載入字卡」
2. **翻轉字卡**: 點擊字卡或按空格鍵查看答案
3. **標記答案**: 點擊「答對了」或「答錯了」記錄學習進度
4. **切換字卡**: 點擊「下一張」或按右箭頭鍵

### 鍵盤快捷鍵

- `空格鍵` 或 `Enter`: 翻轉字卡
- `右箭頭` 或 `N`: 下一張字卡
- `1`: 標記為正確
- `2`: 標記為錯誤

### 添加新字卡

1. 在頁面底部的「新增字卡」表單中填寫內容
2. 設置分類和難度
3. 點擊「新增字卡」按鈕

## 📊 數據庫結構

### flashcards 表

| 欄位 | 類型 | 說明 |
|------|------|------|
| id | INTEGER | 主鍵 |
| front | TEXT | 字卡正面內容 |
| back | TEXT | 字卡背面內容 |
| category | TEXT | 分類 |
| difficulty | INTEGER | 難度 (1-3) |
| created_at | DATETIME | 創建時間 |
| updated_at | DATETIME | 更新時間 |
| review_count | INTEGER | 複習次數 |
| last_reviewed | DATETIME | 最後複習時間 |

### user_progress 表

| 欄位 | 類型 | 說明 |
|------|------|------|
| id | INTEGER | 主鍵 |
| flashcard_id | INTEGER | 字卡 ID |
| user_id | TEXT | 用戶 ID |
| correct_count | INTEGER | 正確次數 |
| incorrect_count | INTEGER | 錯誤次數 |
| last_result | INTEGER | 最後結果 |
| created_at | DATETIME | 創建時間 |
| updated_at | DATETIME | 更新時間 |

## 🔧 API 端點

### GET /api/flashcards
獲取字卡列表

**參數**:
- `category`: 分類篩選
- `difficulty`: 難度篩選
- `limit`: 返回數量限制
- `random`: 是否隨機排序

### POST /api/flashcards
創建新字卡

**請求體**:
```json
{
  "front": "問題",
  "back": "答案",
  "category": "分類",
  "difficulty": 1
}
```

### PUT /api/flashcards/:id
更新學習進度

**請求體**:
```json
{
  "correct": true,
  "userId": "anonymous"
}
```

### GET /api/categories
獲取所有分類

## 🎨 自定義樣式

應用使用了現代的漸變背景和毛玻璃效果，你可以通過修改 CSS 變量來自定義外觀：

- 主色調: `#667eea` 到 `#764ba2`
- 字卡正面: `#ff9a9e` 到 `#fecfef`
- 字卡背面: `#a8edea` 到 `#fed6e3`

## 📱 響應式設計

應用完全支持移動設備，在小屏幕上會自動調整佈局：
- 字卡尺寸自適應
- 控制面板垂直排列
- 按鈕全寬顯示

## 🚀 性能優化

- 使用 Cloudflare Worker 的全球邊緣網絡
- D1 數據庫提供低延遲查詢
- 前端使用原生 JavaScript，無額外框架負擔
- 響應式圖片和 CSS 優化

## 🤝 貢獻

歡迎提交 Issue 和 Pull Request 來改進這個項目！

## 📄 許可證

MIT License

## 🙏 致謝

感謝 Cloudflare 提供的優秀開發平台和服務。