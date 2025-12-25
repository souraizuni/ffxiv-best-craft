# FFXIV-Best-Craft 資料庫工具

## 簡繁資料庫轉換

### 使用說明

本專案包含一個 Python 腳本，可將遊戲資料庫從簡體中文轉換為繁體中文。

#### 前置需求

```bash
# 安裝 Python 3.x
# 然後安裝依賴套件
pip install opencc-python-reimplemented
```

#### 執行轉換

```bash
# 在專案根目錄執行
python scripts/convert_db_to_zh_tw.py
```

#### 轉換內容

腳本會自動：
1. 複製原始資料庫 `src-tauri/assets/xiv.db`
2. 建立繁體中文版本 `src-tauri/assets/xiv-zh-tw.db`
3. 轉換以下表格中的文字：
   - `Items.Name` - 物品名稱（約 50,899 筆）
   - `CraftTypes.Name` - 職業名稱（8 筆）
   - `ItemSearchCategories.Name` - 搜尋分類（101 筆）
   - `ItemUICategories.Name` - UI 分類（113 筆）

#### 轉換結果

- 原始資料庫保持不變
- 繁體資料庫會被建立在同一目錄
- 約轉換 44,741 筆記錄

### 注意事項

- 轉換過程可能需要幾分鐘
- 確保有足夠的磁碟空間（約 8MB）
- 不會修改原始資料庫

### 資料庫切換

目前桌面版（Tauri）會根據系統語言自動載入對應的資料庫：
- 繁體中文系統：使用 `xiv-zh-tw.db`
- 其他語言：使用 `xiv.db`（簡體中文）

網頁版使用遠端 API，已支援繁體中文（`yyyy.games` 資料源的 `zh-TW` 選項）。
