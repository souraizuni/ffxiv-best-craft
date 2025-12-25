#!/usr/bin/env python3
"""
將 SQLite 資料庫中的簡體中文轉換為繁體中文

需要安裝: pip install opencc-python-reimplemented
"""

import sqlite3
import shutil
from pathlib import Path

try:
    from opencc import OpenCC
except ImportError:
    print("錯誤：請先安裝 opencc-python-reimplemented")
    print("執行：pip install opencc-python-reimplemented")
    exit(1)

# 初始化簡繁轉換器
cc = OpenCC('s2t')  # 簡體到繁體

def convert_database(input_db: str, output_db: str):
    """轉換資料庫中的所有文字欄位"""

    # 備份原始資料庫
    print(f"複製資料庫: {input_db} -> {output_db}")
    shutil.copy2(input_db, output_db)

    # 連接到新資料庫
    conn = sqlite3.connect(output_db)
    cursor = conn.cursor()

    # 需要轉換的表格和欄位
    tables_to_convert = {
        'Items': ['Name'],
        'CraftTypes': ['Name'],
        'ItemSearchCategories': ['Name'],
        'ItemUICategories': ['Name'],
    }

    total_updated = 0

    for table, columns in tables_to_convert.items():
        print(f"\n處理表格: {table}")

        # 檢查表格是否存在
        cursor.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name=?",
            (table,)
        )
        if not cursor.fetchone():
            print(f"  警告: 表格 {table} 不存在，跳過")
            continue

        # 獲取總記錄數
        cursor.execute(f"SELECT COUNT(*) FROM {table}")
        total_rows = cursor.fetchone()[0]
        print(f"  總記錄數: {total_rows}")

        for column in columns:
            # 檢查欄位是否存在
            cursor.execute(f"PRAGMA table_info({table})")
            cols = [row[1] for row in cursor.fetchall()]
            if column not in cols:
                print(f"  警告: 欄位 {column} 不存在於 {table}，跳過")
                continue

            print(f"  轉換欄位: {column}")

            # 批次處理以提高效能
            batch_size = 1000
            offset = 0
            updated = 0

            while True:
                # 獲取一批資料
                cursor.execute(
                    f"SELECT Id, {column} FROM {table} LIMIT ? OFFSET ?",
                    (batch_size, offset)
                )
                rows = cursor.fetchall()

                if not rows:
                    break

                # 轉換並更新
                for row_id, text in rows:
                    if text:  # 只處理非空值
                        converted = cc.convert(text)
                        if converted != text:  # 只有真正變化時才更新
                            cursor.execute(
                                f"UPDATE {table} SET {column} = ? WHERE Id = ?",
                                (converted, row_id)
                            )
                            updated += 1

                offset += batch_size

                # 顯示進度
                progress = min(offset, total_rows)
                print(f"    進度: {progress}/{total_rows} ({progress*100//total_rows}%)", end='\r')

            print(f"\n    已更新 {updated} 筆記錄")
            total_updated += updated

    # 提交變更
    conn.commit()
    conn.close()

    print(f"\n✓ 完成！總共更新了 {total_updated} 筆記錄")
    print(f"✓ 繁體中文資料庫已儲存至: {output_db}")

if __name__ == "__main__":
    # 設定路徑
    script_dir = Path(__file__).parent
    project_root = script_dir.parent

    input_db = project_root / "src-tauri" / "assets" / "xiv.db"
    output_db = project_root / "src-tauri" / "assets" / "xiv-zh-tw.db"

    if not input_db.exists():
        print(f"錯誤：找不到輸入資料庫: {input_db}")
        exit(1)

    print("=== FFXIV 資料庫簡繁轉換工具 ===")
    print(f"輸入: {input_db}")
    print(f"輸出: {output_db}")
    print()

    convert_database(str(input_db), str(output_db))
