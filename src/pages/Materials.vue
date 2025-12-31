<!-- 
    This file is part of BestCraft.
    Copyright (C) 2025  Tnze

    BestCraft is free software: you can redistribute it and/or modify
    it under the terms of the GNU Affero General Public License as published
    by the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    BestCraft is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public License
    along with this program.  If not, see <https://www.gnu.org/licenses/>.
-->

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import {
    ElCard,
    ElTable,
    ElTableColumn,
    ElInputNumber,
    ElButton,
    ElSelect,
    ElOption,
    ElDivider,
    ElText,
    ElMessage,
    ElPopconfirm,
    ElIcon,
    ElAlert,
} from 'element-plus';
import { Delete, Plus, Refresh } from '@element-plus/icons-vue';
import { useMaterialsInventoryStore, CrystalInventory, MaterialInventory } from '@/stores/materials-inventory';
import useSettingsStore from '@/stores/settings';
import { RecipeInfo } from '@/libs/Craft';

const materialsStore = useMaterialsInventoryStore();
const settingsStore = useSettingsStore();

// 材料搜尋相關
const searchText = ref('');
const searchResults = ref<{ id: number; name: string }[]>([]);
const isSearching = ref(false);
const selectedMaterialId = ref<number | null>(null);

// 搜尋材料（使用配方表搜尋）
let searchTimeout: ReturnType<typeof setTimeout> | null = null;
async function searchMaterials(query: string) {
    if (!query || query.length < 1) {
        searchResults.value = [];
        return;
    }

    if (searchTimeout) {
        clearTimeout(searchTimeout);
    }

    searchTimeout = setTimeout(async () => {
        isSearching.value = true;
        try {
            const dataSource = await settingsStore.getDataSource();
            // 搜尋配方表
            const result = await dataSource.recipeTable(1, query);
            // 提取物品資訊（去重）
            const itemMap = new Map<number, string>();
            for (const recipe of result.results) {
                if (!itemMap.has(recipe.item_id)) {
                    itemMap.set(recipe.item_id, recipe.item_name);
                }
            }
            searchResults.value = Array.from(itemMap.entries()).map(([id, name]) => ({ id, name }));
        } catch (e) {
            console.error('Search failed:', e);
            searchResults.value = [];
        } finally {
            isSearching.value = false;
        }
    }, 300);
}

// 選擇材料並加入
function handleMaterialSelect(materialId: number) {
    const material = searchResults.value.find((m: { id: number; name: string }) => m.id === materialId);
    if (material) {
        materialsStore.upsertMaterial(material.id, material.name, 0, 0);
        ElMessage.success(`已新增材料：${material.name}`);
        selectedMaterialId.value = null;
        searchText.value = '';
        searchResults.value = [];
    }
}

// 移除材料
function removeMaterial(id: number) {
    materialsStore.removeMaterial(id);
}

// 更新水晶數量
function handleCrystalQuantityChange(id: number, value: number | null) {
    materialsStore.updateCrystalQuantity(id, value ?? 0);
}

// 更新水晶單價
function handleCrystalPriceChange(id: number, value: number | null) {
    materialsStore.updateCrystalPrice(id, value ?? 0);
}

// 更新材料數量
function handleMaterialQuantityChange(id: number, value: number | null) {
    materialsStore.updateMaterialQuantity(id, value ?? 0);
}

// 更新材料單價
function handleMaterialPriceChange(id: number, value: number | null) {
    materialsStore.updateMaterialPrice(id, value ?? 0);
}

// 重置所有資料
function handleReset() {
    materialsStore.reset();
    ElMessage.success('已重置所有材料資料');
}

// 計算水晶小計
function crystalSubtotal(crystal: CrystalInventory): number {
    return crystal.quantity * crystal.unitPrice;
}

// 計算材料小計
function materialSubtotal(material: MaterialInventory): number {
    return material.quantity * material.unitPrice;
}

// 格式化數字
function formatNumber(num: number): string {
    return num.toLocaleString('zh-TW');
}

// 更新水晶名稱（根據資料來源）
async function updateCrystalNames() {
    try {
        const dataSource = await settingsStore.getDataSource();
        for (const crystal of materialsStore.crystals) {
            try {
                const itemInfo = await dataSource.itemInfo(crystal.id);
                if (itemInfo && itemInfo.name) {
                    materialsStore.updateCrystalName(crystal.id, itemInfo.name);
                }
            } catch {
                // 保持預設名稱
            }
        }
    } catch (e) {
        console.error('Failed to update crystal names:', e);
    }
}

onMounted(() => {
    updateCrystalNames();
});

// 水晶分組
const crystalGroups = computed(() => {
    const shards = materialsStore.crystals.filter((c: CrystalInventory) => c.id >= 2 && c.id <= 7);
    const crystals = materialsStore.crystals.filter((c: CrystalInventory) => c.id >= 8 && c.id <= 13);
    const clusters = materialsStore.crystals.filter((c: CrystalInventory) => c.id >= 14 && c.id <= 19);
    return { shards, crystals, clusters };
});
</script>

<template>
    <div class="materials-page">
        <el-alert
            :title="$t('materials-page-hint')"
            type="info"
            :closable="false"
            show-icon
            class="page-hint"
        />

        <!-- 水晶設定區塊 -->
        <el-card class="section-card">
            <template #header>
                <div class="card-header">
                    <span>💎 {{ $t('crystal-inventory') }}</span>
                    <el-text type="info" size="small">
                        {{ $t('crystal-total-cost') }}: {{ formatNumber(materialsStore.totalCrystalCost) }} Gil
                    </el-text>
                </div>
            </template>

            <!-- 欄位標籤 -->
            <div class="crystal-header-labels">
                <span class="label-name">{{ $t('crystal-name-label') }}</span>
                <span class="label-quantity">{{ $t('quantity') }}</span>
                <span class="label-price">{{ $t('unit-price') }}</span>
                <span class="label-subtotal">{{ $t('subtotal') }}</span>
            </div>

            <!-- 碎晶 -->
            <div class="crystal-group">
                <div class="group-title">{{ $t('crystal-shards') }}</div>
                <div class="crystal-grid">
                    <div v-for="crystal in crystalGroups.shards" :key="crystal.id" class="crystal-item">
                        <span class="crystal-name">{{ crystal.name }}</span>
                        <div class="crystal-inputs">
                            <el-input-number
                                :model-value="crystal.quantity"
                                @change="handleCrystalQuantityChange(crystal.id, $event)"
                                :min="0"
                                size="small"
                                controls-position="right"
                                :placeholder="$t('quantity')"
                            />
                            <el-input-number
                                :model-value="crystal.unitPrice"
                                @change="handleCrystalPriceChange(crystal.id, $event)"
                                :min="0"
                                size="small"
                                controls-position="right"
                                :placeholder="$t('unit-price')"
                            />
                            <span class="crystal-subtotal">= {{ formatNumber(crystalSubtotal(crystal)) }}</span>
                        </div>
                    </div>
                </div>
            </div>

            <el-divider />

            <!-- 水晶 -->
            <div class="crystal-group">
                <div class="group-title">{{ $t('crystal-crystals') }}</div>
                <div class="crystal-grid">
                    <div v-for="crystal in crystalGroups.crystals" :key="crystal.id" class="crystal-item">
                        <span class="crystal-name">{{ crystal.name }}</span>
                        <div class="crystal-inputs">
                            <el-input-number
                                :model-value="crystal.quantity"
                                @change="handleCrystalQuantityChange(crystal.id, $event)"
                                :min="0"
                                size="small"
                                controls-position="right"
                                :placeholder="$t('quantity')"
                            />
                            <el-input-number
                                :model-value="crystal.unitPrice"
                                @change="handleCrystalPriceChange(crystal.id, $event)"
                                :min="0"
                                size="small"
                                controls-position="right"
                                :placeholder="$t('unit-price')"
                            />
                            <span class="crystal-subtotal">= {{ formatNumber(crystalSubtotal(crystal)) }}</span>
                        </div>
                    </div>
                </div>
            </div>

            <el-divider />

            <!-- 晶簇 -->
            <div class="crystal-group">
                <div class="group-title">{{ $t('crystal-clusters') }}</div>
                <div class="crystal-grid">
                    <div v-for="crystal in crystalGroups.clusters" :key="crystal.id" class="crystal-item">
                        <span class="crystal-name">{{ crystal.name }}</span>
                        <div class="crystal-inputs">
                            <el-input-number
                                :model-value="crystal.quantity"
                                @change="handleCrystalQuantityChange(crystal.id, $event)"
                                :min="0"
                                size="small"
                                controls-position="right"
                                :placeholder="$t('quantity')"
                            />
                            <el-input-number
                                :model-value="crystal.unitPrice"
                                @change="handleCrystalPriceChange(crystal.id, $event)"
                                :min="0"
                                size="small"
                                controls-position="right"
                                :placeholder="$t('unit-price')"
                            />
                            <span class="crystal-subtotal">= {{ formatNumber(crystalSubtotal(crystal)) }}</span>
                        </div>
                    </div>
                </div>
            </div>
        </el-card>

        <!-- 材料設定區塊 -->
        <el-card class="section-card">
            <template #header>
                <div class="card-header">
                    <span>📦 {{ $t('material-inventory') }}</span>
                    <el-text type="info" size="small">
                        {{ $t('material-total-cost') }}: {{ formatNumber(materialsStore.totalMaterialCost) }} Gil
                    </el-text>
                </div>
            </template>

            <!-- 新增材料 -->
            <div class="add-material-section">
                <el-select
                    v-model="selectedMaterialId"
                    filterable
                    remote
                    :remote-method="searchMaterials"
                    :loading="isSearching"
                    :placeholder="$t('search-material-placeholder')"
                    class="material-search"
                    @change="handleMaterialSelect"
                    clearable
                >
                    <el-option
                        v-for="item in searchResults"
                        :key="item.id"
                        :label="`${item.name} (ID: ${item.id})`"
                        :value="item.id"
                    />
                </el-select>
            </div>

            <!-- 材料列表 -->
            <el-table
                :data="materialsStore.materials"
                stripe
                class="materials-table"
                v-if="materialsStore.materials.length > 0"
            >
                <el-table-column prop="id" :label="$t('material-id')" width="100" />
                <el-table-column prop="name" :label="$t('material-name')" min-width="150" />
                <el-table-column :label="$t('quantity')" width="150">
                    <template #default="{ row }">
                        <el-input-number
                            :model-value="row.quantity"
                            @change="handleMaterialQuantityChange(row.id, $event)"
                            :min="0"
                            size="small"
                            controls-position="right"
                        />
                    </template>
                </el-table-column>
                <el-table-column :label="$t('unit-price')" width="150">
                    <template #default="{ row }">
                        <el-input-number
                            :model-value="row.unitPrice"
                            @change="handleMaterialPriceChange(row.id, $event)"
                            :min="0"
                            size="small"
                            controls-position="right"
                        />
                    </template>
                </el-table-column>
                <el-table-column :label="$t('subtotal')" width="120">
                    <template #default="{ row }">
                        {{ formatNumber(materialSubtotal(row)) }}
                    </template>
                </el-table-column>
                <el-table-column :label="$t('actions')" width="80">
                    <template #default="{ row }">
                        <el-popconfirm
                            :title="$t('confirm-delete-material')"
                            @confirm="removeMaterial(row.id)"
                        >
                            <template #reference>
                                <el-button type="danger" size="small" :icon="Delete" circle />
                            </template>
                        </el-popconfirm>
                    </template>
                </el-table-column>
            </el-table>

            <div v-else class="empty-materials">
                <el-text type="info">{{ $t('no-materials-hint') }}</el-text>
            </div>
        </el-card>

        <!-- 底部操作 -->
        <div class="bottom-actions">
            <el-popconfirm :title="$t('confirm-reset-all')" @confirm="handleReset">
                <template #reference>
                    <el-button type="warning" :icon="Refresh">{{ $t('reset-all') }}</el-button>
                </template>
            </el-popconfirm>
        </div>
    </div>
</template>

<style scoped>
.materials-page {
    padding: 20px;
    max-width: 1200px;
    margin: 0 auto;
}

.page-hint {
    margin-bottom: 20px;
}

.section-card {
    margin-bottom: 20px;
}

.card-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
}

.crystal-header-labels {
    display: flex;
    align-items: center;
    padding: 8px 12px;
    margin-bottom: 12px;
    background: var(--el-fill-color);
    border-radius: 6px;
    font-weight: bold;
    font-size: 13px;
    color: var(--el-text-color-secondary);
}

.crystal-header-labels .label-name {
    min-width: 80px;
    flex: 1;
}

.crystal-header-labels .label-quantity,
.crystal-header-labels .label-price {
    width: 100px;
    text-align: center;
    margin-right: 8px;
}

.crystal-header-labels .label-subtotal {
    min-width: 80px;
    text-align: right;
}

.crystal-group {
    margin-bottom: 16px;
}

.group-title {
    font-weight: bold;
    margin-bottom: 12px;
    color: var(--el-text-color-primary);
}

.crystal-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
    gap: 12px;
}

.crystal-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 12px;
    background: var(--el-fill-color-lighter);
    border-radius: 6px;
}

.crystal-name {
    min-width: 80px;
    font-size: 14px;
}

.crystal-inputs {
    display: flex;
    align-items: center;
    gap: 8px;
}

.crystal-inputs .el-input-number {
    width: 100px;
}

.crystal-subtotal {
    min-width: 80px;
    text-align: right;
    font-size: 13px;
    color: var(--el-text-color-secondary);
}

.add-material-section {
    margin-bottom: 16px;
}

.material-search {
    width: 100%;
    max-width: 400px;
}

.materials-table {
    width: 100%;
}

.empty-materials {
    text-align: center;
    padding: 40px;
}

.bottom-actions {
    display: flex;
    justify-content: flex-end;
    gap: 12px;
    padding-top: 20px;
}

@media screen and (max-width: 768px) {
    .crystal-grid {
        grid-template-columns: 1fr;
    }
    
    .crystal-item {
        flex-direction: column;
        align-items: flex-start;
        gap: 8px;
    }
    
    .crystal-inputs {
        width: 100%;
        flex-wrap: wrap;
    }
}
</style>

<fluent locale="zh-CN">
materials-page-hint = 在此设置您的水晶和材料库存。这些数据将与成本计算器连动，自动填入已有的数量和价格。
crystal-inventory = 水晶库存
crystal-total-cost = 水晶总成本
crystal-shards = 碎晶
crystal-crystals = 水晶
crystal-clusters = 晶簇
crystal-name-label = 名称
quantity = 数量
unit-price = 单价
material-inventory = 材料库存
material-total-cost = 材料总成本
search-material-placeholder = 搜索材料名称...
material-id = ID
material-name = 材料名称
subtotal = 小计
actions = 操作
confirm-delete-material = 确定要删除这个材料吗？
no-materials-hint = 尚未添加任何材料，请使用上方搜索框添加
reset-all = 重置全部
confirm-reset-all = 确定要重置所有材料数据吗？
</fluent>

<fluent locale="zh-TW">
materials-page-hint = 在此設定您的水晶和材料庫存。這些資料將與成本計算器連動，自動填入已有的數量和價格。
crystal-inventory = 水晶庫存
crystal-total-cost = 水晶總成本
crystal-shards = 碎晶
crystal-crystals = 水晶
crystal-clusters = 晶簇
crystal-name-label = 名稱
quantity = 數量
unit-price = 單價
material-inventory = 材料庫存
material-total-cost = 材料總成本
search-material-placeholder = 搜尋材料名稱...
material-id = ID
material-name = 材料名稱
subtotal = 小計
actions = 操作
confirm-delete-material = 確定要刪除這個材料嗎？
no-materials-hint = 尚未新增任何材料，請使用上方搜尋框新增
reset-all = 重置全部
confirm-reset-all = 確定要重置所有材料資料嗎？
</fluent>

<fluent locale="en-US">
materials-page-hint = Set up your crystal and material inventory here. This data will sync with the cost calculator to auto-fill quantities and prices.
crystal-inventory = Crystal Inventory
crystal-total-cost = Crystal Total Cost
crystal-shards = Shards
crystal-crystals = Crystals
crystal-clusters = Clusters
crystal-name-label = Name
quantity = Quantity
unit-price = Unit Price
material-inventory = Material Inventory
material-total-cost = Material Total Cost
search-material-placeholder = Search material name...
material-id = ID
material-name = Material Name
subtotal = Subtotal
actions = Actions
confirm-delete-material = Are you sure you want to delete this material?
no-materials-hint = No materials added yet. Use the search box above to add materials.
reset-all = Reset All
confirm-reset-all = Are you sure you want to reset all material data?
</fluent>

<fluent locale="ja-JP">
materials-page-hint = クリスタルと素材の在庫を設定します。このデータはコスト計算機と連動し、数量と価格を自動入力します。
crystal-inventory = クリスタル在庫
crystal-total-cost = クリスタル総コスト
crystal-shards = シャード
crystal-crystals = クリスタル
crystal-clusters = クラスター
crystal-name-label = 名前
quantity = 数量
unit-price = 単価
material-inventory = 素材在庫
material-total-cost = 素材総コスト
search-material-placeholder = 素材名を検索...
material-id = ID
material-name = 素材名
subtotal = 小計
actions = 操作
confirm-delete-material = この素材を削除しますか？
no-materials-hint = 素材がまだ追加されていません。上の検索ボックスを使用して追加してください。
reset-all = すべてリセット
confirm-reset-all = すべての素材データをリセットしますか？
</fluent>
