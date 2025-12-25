# CLAUDE.md

本檔案為 Claude Code (claude.ai/code) 在此程式碼庫工作時的指引文件。

## 專案概述

FFXIV-Best-Craft 是最終幻想 14 的生產模擬器與求解器。這是一個混合應用程式，同時支援網頁版（WASM）和桌面版（Tauri），使用 TypeScript（Vue 3）和 Rust 編寫。

## 建置目標

專案有兩個不同的建置目標，由 `VITE_BESTCRAFT_TARGET` 控制：

### 網頁版建置（WASM）
```bash
# 安裝依賴（僅首次需要）
cargo install wasm-pack wasm-bindgen-cli

# 開發伺服器（熱重載）
pnpm run dev-web

# 正式建置
pnpm run build-web
```

### 桌面版建置（Tauri）
```bash
# 安裝 tauri-cli（僅首次需要）
cargo install tauri-cli

# 開發模式（⚠️ 求解器效能較慢）
cargo tauri dev

# 使用 release 最佳化的開發模式（建議）
cargo tauri dev --release

# 正式建置（需要簽章金鑰）
export TAURI_PRIVATE_KEY="金鑰路徑"
export TAURI_KEY_PASSWORD="可選的金鑰密碼"
cargo tauri build
```

## 測試與品質檢查

```bash
# 型別檢查
pnpm run build  # TypeScript 編譯檢查

# 程式碼檢查
npx oxlint src/  # 使用 oxlint 進行快速檢查

# 格式化程式碼
npx prettier --write .
```

## 架構

### Rust 工作區結構

專案使用 Cargo 工作區，包含多個特化的 crate：

- **src-libs**：核心生產邏輯與求解演算法
  - `solver/`：多種求解器實作（深度優先搜尋、反射式、Rika、Raphael）
  - `analyzer/`：生產狀態分析工具
  - 由 WASM 和 Tauri 建置共用

- **src-wasm**：WebAssembly 綁定
  - 透過 wasm-bindgen 將 `src-libs` 功能暴露給 JavaScript
  - 目標平台：`wasm32-unknown-unknown`

- **src-tauri**：桌面應用程式後端
  - 額外的原生執行最佳化求解器（記憶化、肌肉記憶、Rika-Tnze）
  - Tauri 指令：檔案系統、更新器、剪貼簿
  - 使用 `src-db` 進行本地資料儲存

- **src-db**：資料庫模型（SeaORM + SQLite）

- **src-server**：伺服器元件（目前未使用）

### 前端架構（Vue 3 + TypeScript）

- **路由器**：基於 Hash 的路由（`src/router.ts`）
  - `/welcome`、`/gearsets`、`/recipe`、`/designer`、`/bom`、`/settings`

- **狀態管理**：Pinia stores（`src/stores/`）
  - `designer.ts`：生產循環設計器狀態
  - `gearsets.ts`：玩家裝備與屬性
  - `bom.ts`：批次生產的材料清單
  - `settings.ts`：應用程式設定與偏好

- **資料來源**（`src/datasource/`）：遊戲資料的抽象層
  - `local-source.ts`：Tauri 桌面版（本地資料庫）
  - `web-source.ts`：網頁版（IndexedDB + 遠端 API）
  - `beta-xivapi-source.ts`：替代 API 來源
  - `remote-source.ts`：伺服器 API 整合

- **核心函式庫**（`src/libs/`）：
  - `Solver.ts`：Rust 求解器的 TypeScript 介面
  - `Craft.ts`：生產模擬包裝器
  - `Analyzer.ts`：動作序列分析
  - `Gearsets.ts`：屬性計算與驗證
  - `Enhancer.ts`：裝備魔晶石鑲嵌邏輯
  - `Utils.ts`：共用工具

### 建置系統（Vite）

- 自訂 `defineTarget()` 外掛在編譯時期替換 `VITE_BESTCRAFT_TARGET`
- 網頁版建置包含從 `pkg-wasm/` 產生的 WASM 模組（由 wasm-pack 生成）
- Tauri 建置透過 IPC 使用原生 Rust 後端
- 多頁面設定：`index.html`（主應用程式）、`fco.html`（特殊模式）

## 關鍵實作細節

### 求解器系統

專案實作了多種生產求解演算法，各有不同的取捨：

- **深度優先搜尋（Depth-First Search）**：窮舉搜尋最佳循環
- **反射求解器（Reflection Solver）**：利用生產機制的對稱性
- **Rika 求解器**：基於啟發式的方法
- **Raphael**：外部求解器整合（來自 raphael-rs）
- **記憶化（Memoization）**（僅 Tauri）：動態規劃方法
- **肌肉記憶（Muscle Memory）**（僅 Tauri）：基於模式的最佳化

所有求解器都實作 `Solver` trait，包含 `init()`、`read()` 和 `read_all()` 方法。

### WASM 整合

TypeScript 透過 wasm-bindgen 呼叫 Rust。`predev-web` 和 `prebuild-web` 腳本會在啟動開發伺服器或建置前自動重建 WASM 模組。

### 平台差異

程式碼透過檢查 `import.meta.env.VITE_BESTCRAFT_TARGET` 來區分平台：
- `"tauri"`：桌面應用程式（可使用 Tauri API、檔案系統、自動更新器）
- `"web"`：瀏覽器（使用 WASM 求解器，限於 Web API）

### 國際化

使用 Fluent 進行 i18n，搭配 `fluent-vue` 和 `unplugin-fluent-vue`。翻譯檔案位於 `src/assets/locales/`。

## 重要慣例

- Release 建置需要 LTO（工作區 Cargo.toml 中的 `lto = true`）以獲得最佳求解器效能
- Debug 模式的求解器速度明顯慢於 release 模式
- Rust 工具鏈版本在 `rust-toolchain` 檔案中指定
- 使用 pnpm 進行套件管理（版本固定於 package.json）
- TypeScript 路徑：`@/` 對應到 `src/`
