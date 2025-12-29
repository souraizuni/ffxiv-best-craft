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
import { computed, ref, watch } from 'vue';
import {
    ElTable,
    ElTableColumn,
    ElInputNumber,
    ElCheckbox,
    ElButton,
    ElCard,
    ElForm,
    ElFormItem,
    ElDivider,
    ElText,
    ElIcon,
    ElInput,
    ElAlert,
} from 'element-plus';
import { Plus, Delete, Refresh } from '@element-plus/icons-vue';
import useSimulatorCostsStore, { MaterialCost } from '@/stores/simulator-costs';
import useSettingsStore from '@/stores/settings';
import { ItemWithAmount } from '@/libs/Craft';

const props = defineProps<{
    equipmentId: string;
    equipmentName: string;
    recipeId?: number;
}>();

const store = useSimulatorCostsStore();
const settingsStore = useSettingsStore();

// 取得當前裝備的成本資料
const costData = computed(() => store.getOrCreateEquipmentCost(props.equipmentId));

// 載入材料狀態
const loadingIngredients = ref(false);
const ingredientsLoaded = ref(false);
const loadError = ref<string | null>(null);

// 自動載入配方材料
async function loadRecipeIngredients() {
    if (!props.recipeId) {
        loadError.value = 'no-recipe-id';
        return;
    }
    
    loadingIngredients.value = true;
    loadError.value = null;
    
    try {
        const dataSource = await settingsStore.getDataSource();
        const ingredients: ItemWithAmount[] = await dataSource.recipesIngredients(props.recipeId);
        
        // 過濾水晶類材料（ID < 20）並載入材料資訊
        const filteredIngredients = ingredients.filter(ing => ing.ingredient_id >= 20);
        
        for (const ing of filteredIngredients) {
            // 檢查是否已存在相同材料
            const existingMaterial = costData.value.materials.find(
                (m: MaterialCost) => m.materialId === ing.ingredient_id
            );
            
            if (!existingMaterial) {
                // 取得材料名稱
                const itemInfo = await dataSource.itemInfo(ing.ingredient_id);
                
                store.updateMaterialCost(
                    props.equipmentId,
                    ing.ingredient_id,
                    itemInfo.name,
                    0, // 預設價格為 0，需要使用者輸入
                    ing.amount,
                    false, // 預設不含稅
                );
            } else {
                // 更新數量（保留使用者輸入的價格）
                store.updateMaterialCost(
                    props.equipmentId,
                    existingMaterial.materialId,
                    existingMaterial.materialName,
                    existingMaterial.price,
                    ing.amount, // 使用配方的數量
                    existingMaterial.includeTax,
                );
            }
        }
        
        ingredientsLoaded.value = true;
    } catch (e: any) {
        console.error('Failed to load recipe ingredients:', e);
        loadError.value = String(e);
    } finally {
        loadingIngredients.value = false;
    }
}

// 當 recipeId 變更時自動載入材料
watch(() => props.recipeId, (newRecipeId: number | undefined) => {
    if (newRecipeId && costData.value.materials.length === 0) {
        loadRecipeIngredients();
    }
}, { immediate: true });

// 本地稅率編輯
const localTaxRate = ref(costData.value.taxRate);
watch(() => costData.value.taxRate, (newVal: number) => {
    localTaxRate.value = newVal;
}, { immediate: true });
watch(localTaxRate, (newVal: number) => {
    store.updateTaxRate(props.equipmentId, newVal);
});

// 新增材料表單
const newMaterialName = ref('');
const newMaterialPrice = ref(0);
const newMaterialQuantity = ref(1);
const newMaterialIncludeTax = ref(false);
const materialIdCounter = ref(Date.now());

function addMaterial() {
    if (!newMaterialName.value.trim()) return;
    
    store.updateMaterialCost(
        props.equipmentId,
        materialIdCounter.value++,
        newMaterialName.value.trim(),
        newMaterialPrice.value,
        newMaterialQuantity.value,
        newMaterialIncludeTax.value,
    );
    
    // 重置表單
    newMaterialName.value = '';
    newMaterialPrice.value = 0;
    newMaterialQuantity.value = 1;
    newMaterialIncludeTax.value = false;
}

function removeMaterial(materialId: number) {
    store.removeMaterialCost(props.equipmentId, materialId);
}

function updateMaterial(material: MaterialCost) {
    store.updateMaterialCost(
        props.equipmentId,
        material.materialId,
        material.materialName,
        material.price,
        material.quantity,
        material.includeTax,
    );
}

// 計算單個材料成本
function calculateMaterialCost(material: MaterialCost): number {
    return store.calculateMaterialTotalCost(material, costData.value.taxRate);
}

// 計算總成本
const totalCost = computed(() => store.calculateEquipmentTotalCost(props.equipmentId));
const totalTax = computed(() => store.calculateTotalTax(props.equipmentId));
const subtotal = computed(() => {
    return costData.value.materials.reduce((sum: number, m: MaterialCost) => sum + m.price * m.quantity, 0);
});

function clearAll() {
    store.clearEquipmentCost(props.equipmentId);
}

// 格式化數字
function formatNumber(num: number): string {
    return num.toLocaleString('zh-TW', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}
</script>

<template>
    <div class="cost-calculator">
        <el-card class="settings-card">
            <template #header>
                <span>{{ $t('cost-settings') }}</span>
            </template>
            <el-form label-position="left" label-width="auto">
                <el-form-item :label="$t('tax-rate')">
                    <el-input-number
                        v-model="localTaxRate"
                        :min="0"
                        :max="100"
                        :step="0.5"
                        :precision="1"
                        size="small"
                    >
                        <template #suffix>%</template>
                    </el-input-number>
                </el-form-item>
            </el-form>
        </el-card>

        <el-card class="materials-card">
            <template #header>
                <div class="card-header">
                    <span>{{ $t('material-costs') }}</span>
                    <div class="header-buttons">
                        <el-button
                            v-if="props.recipeId"
                            type="primary"
                            size="small"
                            @click="loadRecipeIngredients"
                            :loading="loadingIngredients"
                            :icon="Refresh"
                        >
                            {{ $t('load-from-recipe') }}
                        </el-button>
                        <el-button type="danger" size="small" @click="clearAll" :icon="Delete">
                            {{ $t('clear-all') }}
                        </el-button>
                    </div>
                </div>
            </template>

            <!-- 載入錯誤提示 -->
            <el-alert
                v-if="loadError"
                :title="$t('load-error')"
                :description="loadError === 'no-recipe-id' ? $t('no-recipe-id-error') : loadError"
                type="warning"
                show-icon
                :closable="true"
                @close="loadError = null"
                style="margin-bottom: 15px;"
            />

            <!-- 材料已自動載入提示 -->
            <el-alert
                v-if="ingredientsLoaded && costData.materials.length > 0"
                :title="$t('ingredients-loaded')"
                type="success"
                show-icon
                :closable="true"
                @close="ingredientsLoaded = false"
                style="margin-bottom: 15px;"
            />

            <!-- 新增材料表單 -->
            <div class="add-material-form">
                <el-input
                    v-model="newMaterialName"
                    :placeholder="$t('material-name')"
                    size="small"
                    class="material-name-input"
                />
                <el-input-number
                    v-model="newMaterialPrice"
                    :placeholder="$t('unit-price')"
                    :min="0"
                    size="small"
                    class="price-input"
                    controls-position="right"
                />
                <el-input-number
                    v-model="newMaterialQuantity"
                    :min="1"
                    size="small"
                    class="quantity-input"
                    controls-position="right"
                />
                <el-checkbox v-model="newMaterialIncludeTax" size="small">
                    {{ $t('include-tax') }}
                </el-checkbox>
                <el-button type="primary" size="small" @click="addMaterial" :icon="Plus">
                    {{ $t('add') }}
                </el-button>
            </div>

            <el-divider />

            <!-- 材料列表 -->
            <el-table :data="costData.materials" style="width: 100%" size="small">
                <el-table-column prop="materialName" :label="$t('material-name')" min-width="120">
                    <template #default="{ row }">
                        <el-input
                            v-model="row.materialName"
                            size="small"
                            @change="updateMaterial(row)"
                        />
                    </template>
                </el-table-column>
                <el-table-column :label="$t('unit-price')" width="120">
                    <template #default="{ row }">
                        <el-input-number
                            v-model="row.price"
                            :min="0"
                            size="small"
                            controls-position="right"
                            @change="updateMaterial(row)"
                        />
                    </template>
                </el-table-column>
                <el-table-column :label="$t('quantity')" width="100">
                    <template #default="{ row }">
                        <el-input-number
                            v-model="row.quantity"
                            :min="1"
                            size="small"
                            controls-position="right"
                            @change="updateMaterial(row)"
                        />
                    </template>
                </el-table-column>
                <el-table-column :label="$t('include-tax')" width="80" align="center">
                    <template #default="{ row }">
                        <el-checkbox
                            v-model="row.includeTax"
                            @change="updateMaterial(row)"
                        />
                    </template>
                </el-table-column>
                <el-table-column :label="$t('subtotal')" width="120" align="right">
                    <template #default="{ row }">
                        {{ formatNumber(calculateMaterialCost(row)) }}
                    </template>
                </el-table-column>
                <el-table-column width="60" align="center">
                    <template #default="{ row }">
                        <el-button
                            type="danger"
                            size="small"
                            :icon="Delete"
                            circle
                            @click="removeMaterial(row.materialId)"
                        />
                    </template>
                </el-table-column>
            </el-table>
        </el-card>

        <!-- 總計區域 -->
        <el-card class="summary-card">
            <template #header>
                <span>{{ $t('cost-summary') }}</span>
            </template>
            <div class="summary-content">
                <div class="summary-row">
                    <el-text>{{ $t('subtotal-before-tax') }}:</el-text>
                    <el-text class="amount">{{ formatNumber(subtotal) }}</el-text>
                </div>
                <div class="summary-row">
                    <el-text>{{ $t('tax-amount') }} ({{ localTaxRate }}%):</el-text>
                    <el-text class="amount">{{ formatNumber(totalTax) }}</el-text>
                </div>
                <el-divider />
                <div class="summary-row total">
                    <el-text size="large" tag="b">{{ $t('total-cost') }}:</el-text>
                    <el-text size="large" tag="b" type="primary" class="amount">
                        {{ formatNumber(totalCost) }}
                    </el-text>
                </div>
            </div>
        </el-card>
    </div>
</template>

<style scoped>
.cost-calculator {
    padding: 10px;
    display: flex;
    flex-direction: column;
    gap: 15px;
}

.settings-card,
.materials-card,
.summary-card {
    --el-card-padding: 15px;
}

.card-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
}

.header-buttons {
    display: flex;
    gap: 8px;
}

.add-material-form {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    align-items: center;
}

.material-name-input {
    width: 150px;
}

.price-input,
.quantity-input {
    width: 100px;
}

.summary-content {
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.summary-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
}

.summary-row.total {
    margin-top: 5px;
}

.amount {
    font-family: 'Consolas', 'Monaco', monospace;
}

.el-table {
    --el-table-header-bg-color: transparent;
    --el-table-tr-bg-color: transparent;
}
</style>

<fluent locale="zh-CN">
cost-settings = 成本设置
tax-rate = 税率
material-costs = 材料成本
clear-all = 清空
material-name = 材料名称
unit-price = 单价
quantity = 数量
include-tax = 含税
subtotal = 小计
add = 添加
cost-summary = 成本汇总
subtotal-before-tax = 税前小计
tax-amount = 税额
total-cost = 总成本
load-from-recipe = 从配方载入
load-error = 载入失败
no-recipe-id-error = 无法获取配方信息
ingredients-loaded = 材料已从配方自动载入，请输入单价
</fluent>

<fluent locale="zh-TW">
cost-settings = 成本設定
tax-rate = 稅率
material-costs = 材料成本
clear-all = 清空
material-name = 材料名稱
unit-price = 單價
quantity = 數量
include-tax = 含稅
subtotal = 小計
add = 新增
cost-summary = 成本匯總
subtotal-before-tax = 稅前小計
tax-amount = 稅額
total-cost = 總成本
load-from-recipe = 從配方載入
load-error = 載入失敗
no-recipe-id-error = 無法取得配方資訊
ingredients-loaded = 材料已從配方自動載入，請輸入單價
</fluent>

<fluent locale="en-US">
cost-settings = Cost Settings
tax-rate = Tax Rate
material-costs = Material Costs
clear-all = Clear All
material-name = Material Name
unit-price = Unit Price
quantity = Quantity
include-tax = Tax Included
subtotal = Subtotal
add = Add
cost-summary = Cost Summary
subtotal-before-tax = Subtotal Before Tax
tax-amount = Tax Amount
total-cost = Total Cost
load-from-recipe = Load from Recipe
load-error = Load Failed
no-recipe-id-error = Unable to get recipe information
ingredients-loaded = Materials loaded from recipe. Please enter unit prices.
</fluent>

<fluent locale="ja-JP">
cost-settings = コスト設定
tax-rate = 税率
material-costs = 材料コスト
clear-all = クリア
material-name = 材料名
unit-price = 単価
quantity = 数量
include-tax = 税込み
subtotal = 小計
add = 追加
cost-summary = コスト集計
subtotal-before-tax = 税前小計
tax-amount = 税額
total-cost = 総コスト
load-from-recipe = レシピから読み込む
load-error = 読み込み失敗
no-recipe-id-error = レシピ情報を取得できません
ingredients-loaded = 材料がレシピから自動的に読み込まれました。単価を入力してください。
</fluent>
