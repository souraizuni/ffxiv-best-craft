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
import { ref, computed, watch, reactive } from 'vue';
import {
    ElTree,
    ElInputNumber,
    ElButton,
    ElCard,
    ElText,
    ElIcon,
    ElAlert,
    ElDivider,
    ElTag,
    ElTooltip,
    ElCheckbox,
} from 'element-plus';
import { Refresh, Warning, Loading } from '@element-plus/icons-vue';
import useSettingsStore from '@/stores/settings';
import { useMaterialsInventoryStore } from '@/stores/materials-inventory';
import { DataSource } from '@/datasource/source';
import { ItemWithAmount, RecipeInfo } from '@/libs/Craft';

// 樹狀節點資料結構
export interface MaterialTreeNode {
    id: number;                         // 材料 ID
    name: string;                       // 材料名稱
    requiredPerCraft: number;           // 每次製作所需數量（製作父材料）
    baseRequiredPerFinalProduct: number; // 每製作一個最終產品所需的材料數量（用於計算可製作數量）
    totalRequired: number;              // 總共需要數量（根據目標製作數量計算）
    purchasedQuantity: number;          // 購買數量（使用者輸入的實際購買量）
    unitPrice: number;                  // 單價
    subtotal: number;                   // 小計（購買數量 × 單價）
    recipeId?: number;                  // 若此材料可製作，則有配方 ID
    canCraft: boolean;                  // 是否可以製作
    expanded: boolean;                  // 是否展開子材料
    loading: boolean;                   // 是否正在載入子材料
    children: MaterialTreeNode[];       // 子材料
    depth: number;                      // 樹的深度
}

// 水晶貢獻資料結構（追蹤每個配方的貢獻量）
export interface CrystalContribution {
    recipeId: number;                   // 來源配方 ID
    materialName: string;               // 來源材料名稱
    baseRequiredPerFinalProduct: number; // 此配方貢獻的每個最終產品需求量
}

// 水晶資料結構
export interface CrystalData {
    id: number;                         // 水晶 ID
    name: string;                       // 水晶名稱
    contributions: CrystalContribution[]; // 各配方的貢獻量（用於收合時正確扣減）
    baseRequiredPerFinalProduct: number; // 每製作一個最終產品所需的水晶數量（所有貢獻加總）
    totalRequired: number;              // 總共需要數量
    purchasedQuantity: number;          // 購買數量
    unitPrice: number;                  // 單價
    subtotal: number;                   // 小計
}

const props = defineProps<{
    recipeId?: number;
    targetAmount: number;
}>();

const emit = defineEmits<{
    (e: 'update:baseMaterials', materials: MaterialTreeNode[]): void;
    (e: 'costCalculated', totalCost: number): void;
}>();

const settingsStore = useSettingsStore();
const materialsInventory = useMaterialsInventoryStore();

// 樹狀資料
const treeData = ref<MaterialTreeNode[]>([]);
const loading = ref(false);
const loadError = ref<string | null>(null);

// 水晶資料
const crystalData = ref<CrystalData[]>([]);
const includeCrystalCost = ref(false); // 是否計入水晶成本

// 是否從材料庫存自動帶入數量和價格
const useInventoryData = ref(true);

// 瓶頸材料 ID（木桶理論中限制可製作數量的材料）
const bottleneckMaterialId = ref<number | null>(null);
// 瓶頸水晶 ID（木桶理論中限制可製作數量的水晶）
const bottleneckCrystalId = ref<number | null>(null);

// 本地製作數量（可在樹狀檢視中獨立設定）
const localCraftAmount = ref(props.targetAmount || 1);

// 監聽父元件傳入的 targetAmount 變化
watch(() => props.targetAmount, (newVal: number) => {
    if (newVal > 0) {
        localCraftAmount.value = newVal;
        recalculateAll();
    }
}, { immediate: true });

// 當本地製作數量變化時重新計算
watch(localCraftAmount, () => {
    recalculateAll();
});

// 計算可製作數量（根據購買數量和每個最終產品所需的材料數量）
const craftableAmount = computed(() => {
    if (treeData.value.length === 0) {
        bottleneckMaterialId.value = null;
        bottleneckCrystalId.value = null;
        return 0;
    }
    
    // 取得所有基礎材料（葉節點或未展開的節點）
    const baseMaterials = collectBaseMaterials(treeData.value);
    if (baseMaterials.length === 0) {
        bottleneckMaterialId.value = null;
        bottleneckCrystalId.value = null;
        return 0;
    }
    
    // 計算每種材料可以製作的數量，並找出瓶頸
    let minCraftable = Infinity;
    let materialBottleneckId: number | null = null;
    let crystalBottleneckId: number | null = null;
    
    for (const m of baseMaterials) {
        if (m.baseRequiredPerFinalProduct > 0) {
            const craftable = Math.floor(m.purchasedQuantity / m.baseRequiredPerFinalProduct);
            if (craftable < minCraftable) {
                minCraftable = craftable;
                materialBottleneckId = m.id;
                crystalBottleneckId = null; // 材料成為瓶頸時，清除水晶瓶頸
            }
        }
    }
    
    // 如果勾選了計入水晶成本，水晶也要參與木桶理論計算
    if (includeCrystalCost.value) {
        for (const c of crystalData.value) {
            if (c.baseRequiredPerFinalProduct > 0) {
                const craftable = Math.floor(c.purchasedQuantity / c.baseRequiredPerFinalProduct);
                if (craftable < minCraftable) {
                    minCraftable = craftable;
                    crystalBottleneckId = c.id;
                    materialBottleneckId = null; // 水晶成為瓶頸時，清除材料瓶頸
                }
            }
        }
    }
    
    bottleneckMaterialId.value = materialBottleneckId;
    bottleneckCrystalId.value = crystalBottleneckId;
    
    if (minCraftable === Infinity) return 0;
    return minCraftable;
});

// 計算水晶總成本
const totalCrystalCost = computed(() => {
    if (!includeCrystalCost.value) return 0;
    return crystalData.value.reduce((sum, c) => sum + c.subtotal, 0);
});

// 計算總購買成本（所有購買材料的成本 + 水晶成本）
const totalPurchaseCost = computed(() => {
    const materialCost = calculateTotalCost(treeData.value);
    return materialCost + totalCrystalCost.value;
});

// 計算單個成本（總成本 ÷ 可製作數量）
const costPerCraft = computed(() => {
    if (craftableAmount.value <= 0) return 0;
    return totalPurchaseCost.value / craftableAmount.value;
});

// 配方快取（透過 item_id 查找）
const recipeCache = new Map<number, RecipeInfo[]>();
const ingredientsCache = new Map<number, ItemWithAmount[]>();
const itemInfoCache = new Map<number, { id: number; name: string }>();

// 根據 item_id 查找配方
async function findRecipeByItemId(
    dataSource: DataSource,
    itemId: number,
    itemName: string,
): Promise<RecipeInfo | null> {
    let cached = recipeCache.get(itemId);
    if (cached !== undefined) {
        return cached.length > 0 ? cached[0] : null;
    }

    try {
        const table = await dataSource.recipeTable(1, itemName);
        const recipes = table.results.filter(v => v.item_id === itemId);
        recipeCache.set(itemId, recipes);
        return recipes.length > 0 ? recipes[0] : null;
    } catch {
        recipeCache.set(itemId, []);
        return null;
    }
}

// 取得配方材料（不含水晶）
async function fetchIngredients(
    dataSource: DataSource,
    recipeId: number,
): Promise<ItemWithAmount[]> {
    let cached = ingredientsCache.get(recipeId);
    if (cached !== undefined) {
        return cached;
    }

    const result = await dataSource.recipesIngredients(recipeId);
    // 過濾水晶（ID < 20）
    const filtered = result.filter(v => v.ingredient_id >= 20);
    ingredientsCache.set(recipeId, filtered);
    return filtered;
}

// 取得配方水晶需求
async function fetchCrystals(
    dataSource: DataSource,
    recipeId: number,
): Promise<ItemWithAmount[]> {
    const result = await dataSource.recipesIngredients(recipeId);
    // 只保留水晶（ID < 20）
    return result.filter(v => v.ingredient_id < 20);
}

// 取得物品資訊
async function fetchItemInfo(
    dataSource: DataSource,
    itemId: number,
): Promise<{ id: number; name: string }> {
    let cached = itemInfoCache.get(itemId);
    if (cached !== undefined) {
        return cached;
    }

    const result = await dataSource.itemInfo(itemId);
    const info = { id: result.id, name: result.name };
    itemInfoCache.set(itemId, info);
    return info;
}

// 載入初始材料樹
async function loadMaterialTree() {
    if (!props.recipeId) {
        loadError.value = 'no-recipe-id';
        return;
    }

    loading.value = true;
    loadError.value = null;
    treeData.value = [];
    crystalData.value = [];

    try {
        const dataSource = await settingsStore.getDataSource();
        const ingredients = await fetchIngredients(dataSource, props.recipeId);
        const crystals = await fetchCrystals(dataSource, props.recipeId);

        // 載入材料節點
        const nodes: MaterialTreeNode[] = [];
        for (const ing of ingredients) {
            const itemInfo = await fetchItemInfo(dataSource, ing.ingredient_id);
            const recipe = await findRecipeByItemId(dataSource, itemInfo.id, itemInfo.name);

            // 從材料庫存取得預設值
            const inventoryMaterial = useInventoryData.value ? materialsInventory.getMaterial(itemInfo.id) : null;

            const node: MaterialTreeNode = {
                id: itemInfo.id,
                name: itemInfo.name,
                requiredPerCraft: ing.amount,
                baseRequiredPerFinalProduct: ing.amount, // 根節點的基礎需求量就是每次製作的需求量
                totalRequired: ing.amount * localCraftAmount.value,
                purchasedQuantity: inventoryMaterial?.quantity ?? 0,
                unitPrice: inventoryMaterial?.unitPrice ?? 0,
                subtotal: 0,
                recipeId: recipe?.id,
                canCraft: recipe !== null,
                expanded: false,
                loading: false,
                children: [],
                depth: 0,
            };
            node.subtotal = node.purchasedQuantity * node.unitPrice;
            nodes.push(node);
        }

        // 載入水晶資料（主配方的水晶）
        const crystalNodes: CrystalData[] = [];
        for (const crystal of crystals) {
            const itemInfo = await fetchItemInfo(dataSource, crystal.ingredient_id);
            const contribution: CrystalContribution = {
                recipeId: props.recipeId!,
                materialName: '主配方',
                baseRequiredPerFinalProduct: crystal.amount,
            };
            
            // 從材料庫存取得水晶預設值
            const inventoryCrystal = useInventoryData.value ? materialsInventory.getCrystal(itemInfo.id) : null;
            
            // 檢查是否已有相同水晶，如有則合併數量
            const existingCrystal = crystalNodes.find(c => c.id === itemInfo.id);
            if (existingCrystal) {
                existingCrystal.contributions.push(contribution);
                existingCrystal.baseRequiredPerFinalProduct += crystal.amount;
                existingCrystal.totalRequired += crystal.amount * localCraftAmount.value;
            } else {
                crystalNodes.push({
                    id: itemInfo.id,
                    name: itemInfo.name,
                    contributions: [contribution],
                    baseRequiredPerFinalProduct: crystal.amount,
                    totalRequired: crystal.amount * localCraftAmount.value,
                    purchasedQuantity: inventoryCrystal?.quantity ?? 0,
                    unitPrice: inventoryCrystal?.unitPrice ?? 0,
                    subtotal: (inventoryCrystal?.quantity ?? 0) * (inventoryCrystal?.unitPrice ?? 0),
                });
            }
        }

        treeData.value = nodes;
        crystalData.value = crystalNodes;
        recalculateAll();
    } catch (e: any) {
        console.error('Failed to load material tree:', e);
        loadError.value = String(e);
    } finally {
        loading.value = false;
    }
}

// 展開/收合子材料
async function toggleExpand(node: MaterialTreeNode) {
    if (!node.canCraft || !node.recipeId) return;

    if (node.expanded) {
        // 收合 - 同時移除該節點相關的水晶
        node.expanded = false;
        node.children = [];
        // 移除來自此配方的水晶
        removeCrystalsFromRecipe(node.recipeId);
    } else {
        // 展開
        node.loading = true;
        try {
            const dataSource = await settingsStore.getDataSource();
            const ingredients = await fetchIngredients(dataSource, node.recipeId);
            const crystals = await fetchCrystals(dataSource, node.recipeId);

            const children: MaterialTreeNode[] = [];
            for (const ing of ingredients) {
                const itemInfo = await fetchItemInfo(dataSource, ing.ingredient_id);
                const recipe = await findRecipeByItemId(dataSource, itemInfo.id, itemInfo.name);

                // 計算子材料需要的數量
                const childRequired = ing.amount * node.baseRequiredPerFinalProduct * localCraftAmount.value;
                // 計算每製作一個最終產品所需的此材料數量（用於可製作數量計算）
                const childBaseRequired = ing.amount * node.baseRequiredPerFinalProduct;

                // 從材料庫存取得預設值
                const inventoryMaterial = useInventoryData.value ? materialsInventory.getMaterial(itemInfo.id) : null;

                const childNode: MaterialTreeNode = {
                    id: itemInfo.id,
                    name: itemInfo.name,
                    requiredPerCraft: ing.amount,
                    baseRequiredPerFinalProduct: childBaseRequired, // 繼承父節點的比例計算
                    totalRequired: childRequired,
                    purchasedQuantity: inventoryMaterial?.quantity ?? 0,
                    unitPrice: inventoryMaterial?.unitPrice ?? 0,
                    subtotal: (inventoryMaterial?.quantity ?? 0) * (inventoryMaterial?.unitPrice ?? 0),
                    recipeId: recipe?.id,
                    canCraft: recipe !== null,
                    expanded: false,
                    loading: false,
                    children: [],
                    depth: node.depth + 1,
                };
                children.push(childNode);
            }

            // 載入此材料的水晶需求
            for (const crystal of crystals) {
                const itemInfo = await fetchItemInfo(dataSource, crystal.ingredient_id);
                // 計算水晶需求量：每製作一個父材料需要的水晶量 × 每個最終產品需要的父材料量
                const crystalBaseRequired = crystal.amount * node.baseRequiredPerFinalProduct;
                
                const contribution: CrystalContribution = {
                    recipeId: node.recipeId,
                    materialName: node.name,
                    baseRequiredPerFinalProduct: crystalBaseRequired,
                };
                
                // 從材料庫存取得水晶預設值
                const inventoryCrystal = useInventoryData.value ? materialsInventory.getCrystal(itemInfo.id) : null;
                
                // 檢查是否已有相同水晶，如有則合併數量
                const existingCrystal = crystalData.value.find(c => c.id === itemInfo.id);
                if (existingCrystal) {
                    existingCrystal.contributions.push(contribution);
                    existingCrystal.baseRequiredPerFinalProduct += crystalBaseRequired;
                    existingCrystal.totalRequired += crystalBaseRequired * localCraftAmount.value;
                } else {
                    crystalData.value.push({
                        id: itemInfo.id,
                        name: itemInfo.name,
                        contributions: [contribution],
                        baseRequiredPerFinalProduct: crystalBaseRequired,
                        totalRequired: crystalBaseRequired * localCraftAmount.value,
                        purchasedQuantity: inventoryCrystal?.quantity ?? 0,
                        unitPrice: inventoryCrystal?.unitPrice ?? 0,
                        subtotal: (inventoryCrystal?.quantity ?? 0) * (inventoryCrystal?.unitPrice ?? 0),
                    });
                }
            }

            node.children = children;
            node.expanded = true;
        } catch (e) {
            console.error('Failed to expand node:', e);
        } finally {
            node.loading = false;
        }
    }
    recalculateAll();
}

// 移除來自特定配方的水晶（收合時使用）
function removeCrystalsFromRecipe(recipeId: number) {
    // 遍歷所有水晶，移除此配方的貢獻
    for (const crystal of crystalData.value) {
        const contributionIndex = crystal.contributions.findIndex(c => c.recipeId === recipeId);
        if (contributionIndex !== -1) {
            const contribution = crystal.contributions[contributionIndex];
            crystal.baseRequiredPerFinalProduct -= contribution.baseRequiredPerFinalProduct;
            crystal.totalRequired = crystal.baseRequiredPerFinalProduct * localCraftAmount.value;
            crystal.contributions.splice(contributionIndex, 1);
        }
    }
    // 移除沒有任何貢獻的水晶
    crystalData.value = crystalData.value.filter(c => c.contributions.length > 0);
}

// 更新節點數量
function updateNodeQuantity(node: MaterialTreeNode, field: 'purchasedQuantity' | 'unitPrice', value: number) {
    node[field] = value;
    recalculateNode(node, localCraftAmount.value);
    recalculateAll();
}

// 更新水晶數量
function updateCrystalQuantity(crystal: CrystalData, field: 'purchasedQuantity' | 'unitPrice', value: number) {
    crystal[field] = value;
    crystal.subtotal = crystal.purchasedQuantity * crystal.unitPrice;
    // 水晶也參與木桶理論計算，需要觸發重新計算
    // 注意：craftableAmount 是 computed，會自動回應 crystalData 的變化
}

// 監聽「計入水晶成本」的變化
watch(includeCrystalCost, () => {
    // 觸發重新計算，讓 craftableAmount 重新計算瓶頸
    // computed 會自動回應，但需要觸發一次依賴
});

// 重新計算單一節點
function recalculateNode(node: MaterialTreeNode, craftAmount: number) {
    // 更新總需求量
    node.totalRequired = node.baseRequiredPerFinalProduct * craftAmount;
    // 計算小計 = 購買數量 × 單價
    node.subtotal = node.purchasedQuantity * node.unitPrice;

    // 如果有子節點，重新計算子節點
    if (node.expanded && node.children.length > 0) {
        for (const child of node.children) {
            recalculateNode(child, craftAmount);
        }
    }
}

// 重新計算所有節點並更新目標成本
function recalculateAll() {
    // 重新計算各節點的需求量和小計
    for (const node of treeData.value) {
        recalculateNode(node, localCraftAmount.value);
    }

    // 重新計算水晶需求量（使用 baseRequiredPerFinalProduct 正確計算總需求）
    for (const crystal of crystalData.value) {
        crystal.totalRequired = crystal.baseRequiredPerFinalProduct * localCraftAmount.value;
        crystal.subtotal = crystal.purchasedQuantity * crystal.unitPrice;
    }

    // 收集所有基礎材料（葉節點或未展開的節點）
    const baseMaterials = collectBaseMaterials(treeData.value);
    emit('update:baseMaterials', baseMaterials);

    // 計算總成本
    const totalCost = calculateTotalCost(treeData.value);
    emit('costCalculated', totalCost);
}

// 收集基礎材料
function collectBaseMaterials(nodes: MaterialTreeNode[]): MaterialTreeNode[] {
    const result: MaterialTreeNode[] = [];
    for (const node of nodes) {
        if (node.expanded && node.children.length > 0) {
            // 遞迴收集子材料
            result.push(...collectBaseMaterials(node.children));
        } else {
            // 葉節點或未展開的節點視為基礎材料
            result.push(node);
        }
    }
    return result;
}

// 計算總成本
function calculateTotalCost(nodes: MaterialTreeNode[]): number {
    let total = 0;
    for (const node of nodes) {
        if (node.expanded && node.children.length > 0) {
            // 遞迴計算子材料成本
            total += calculateTotalCost(node.children);
        } else {
            // 計算此節點的成本（購買數量 × 單價）
            total += node.subtotal;
        }
    }
    return total;
}

// 監聽目標數量變化
watch(() => props.targetAmount, () => {
    recalculateAll();
});

// 監聽 recipeId 變化
watch(() => props.recipeId, () => {
    if (props.recipeId) {
        loadMaterialTree();
    }
});

// 格式化數字
function formatNumber(num: number): string {
    return num.toLocaleString('zh-TW', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

// 暴露方法給父元件
defineExpose({
    loadMaterialTree,
    recalculateAll,
});
</script>

<template>
    <div class="material-tree">
        <!-- 設定區域 -->
        <div class="tree-settings">
            <div class="setting-item">
                <span class="setting-label">{{ $t('craft-amount') }}:</span>
                <el-input-number
                    v-model="localCraftAmount"
                    :min="1"
                    :step="1"
                    size="small"
                    controls-position="right"
                />
            </div>
            <el-checkbox v-model="useInventoryData" size="small">
                {{ $t('use-inventory-data') }}
            </el-checkbox>
            <el-button
                type="primary"
                size="small"
                @click="loadMaterialTree"
                :loading="loading"
                :icon="Refresh"
            >
                {{ $t('load-material-tree') }}
            </el-button>
        </div>

        <!-- 成本匯總卡片 -->
        <div v-if="treeData.length > 0" class="cost-summary-bar">
            <div class="summary-item">
                <span class="summary-label">{{ $t('craftable-amount') }}:</span>
                <span class="summary-value success">{{ craftableAmount }}</span>
                <span class="summary-unit">{{ $t('unit-pieces') }}</span>
            </div>
            <div class="summary-item">
                <span class="summary-label">{{ $t('total-purchase-cost') }}:</span>
                <span class="summary-value warning">{{ formatNumber(totalPurchaseCost) }}</span>
                <span v-if="includeCrystalCost && totalCrystalCost > 0" class="summary-detail">
                    ({{ $t('includes-crystal') }}: {{ formatNumber(totalCrystalCost) }})
                </span>
            </div>
            <div class="summary-item" v-if="craftableAmount > 0">
                <span class="summary-label">{{ $t('cost-per-craft') }}:</span>
                <span class="summary-value">{{ formatNumber(costPerCraft) }}</span>
            </div>
        </div>

        <!-- 錯誤提示 -->
        <el-alert
            v-if="loadError"
            :title="$t('load-error')"
            :description="loadError === 'no-recipe-id' ? $t('no-recipe-id-error') : loadError"
            type="warning"
            show-icon
            :closable="true"
            @close="loadError = null"
            style="margin: 10px 0;"
        />

        <!-- 樹狀表格 -->
        <div v-if="treeData.length > 0" class="tree-container">
            <!-- 表頭 -->
            <div class="tree-header-row">
                <span class="col-name">{{ $t('material-name') }}</span>
                <span class="col-required">{{ $t('total-required') }}</span>
                <span class="col-owned">{{ $t('purchased-quantity') }}</span>
                <span class="col-price">{{ $t('unit-price') }}</span>
                <span class="col-subtotal">{{ $t('subtotal') }}</span>
            </div>

            <!-- 遞迴渲染樹節點 -->
            <MaterialTreeNodeVue
                v-for="node in treeData"
                :key="node.id"
                :node="node"
                :bottleneck-id="bottleneckMaterialId"
                @toggle-expand="toggleExpand"
                @update-quantity="updateNodeQuantity"
            />
        </div>

        <!-- 水晶成本區塊 -->
        <div v-if="crystalData.length > 0" class="crystal-section">
            <div class="crystal-header">
                <el-checkbox v-model="includeCrystalCost" size="small">
                    {{ $t('include-crystal-cost') }}
                </el-checkbox>
                <span v-if="includeCrystalCost" class="crystal-total">
                    {{ $t('crystal-total') }}: {{ formatNumber(totalCrystalCost) }}
                </span>
            </div>
            
            <!-- 水晶表格 -->
            <div class="crystal-table" :class="{ disabled: !includeCrystalCost }">
                <!-- 表頭 -->
                <div class="crystal-header-row">
                    <span class="col-name">{{ $t('crystal-name') }}</span>
                    <span class="col-required">{{ $t('total-required') }}</span>
                    <span class="col-owned">{{ $t('purchased-quantity') }}</span>
                    <span class="col-price">{{ $t('unit-price') }}</span>
                    <span class="col-subtotal">{{ $t('subtotal') }}</span>
                </div>
                
                <!-- 水晶列表 -->
                <div v-for="crystal in crystalData" :key="crystal.id" 
                    class="crystal-row"
                    :class="{ 'bottleneck': includeCrystalCost && bottleneckCrystalId === crystal.id }">
                    <span class="col-name">
                        <span class="crystal-icon">💎</span>
                        {{ crystal.name }}
                        <el-tag v-if="includeCrystalCost && bottleneckCrystalId === crystal.id" size="small" type="danger">🪣 瓶頸</el-tag>
                    </span>
                    <span class="col-required">{{ formatNumber(crystal.totalRequired) }}</span>
                    <div class="col-owned">
                        <el-input-number
                            v-model="crystal.purchasedQuantity"
                            :min="0"
                            size="small"
                            controls-position="right"
                            :disabled="!includeCrystalCost"
                            @change="updateCrystalQuantity(crystal, 'purchasedQuantity', $event ?? 0)"
                        />
                    </div>
                    <div class="col-price">
                        <el-input-number
                            v-model="crystal.unitPrice"
                            :min="0"
                            size="small"
                            controls-position="right"
                            :disabled="!includeCrystalCost"
                            @change="updateCrystalQuantity(crystal, 'unitPrice', $event ?? 0)"
                        />
                    </div>
                    <span class="col-subtotal">{{ formatNumber(crystal.subtotal) }}</span>
                </div>
            </div>
        </div>

        <!-- 空狀態 -->
        <el-text v-else-if="!loading" type="info" class="empty-text">
            {{ $t('click-load-to-start') }}
        </el-text>
    </div>
</template>

<!-- 遞迴子元件 -->
<script lang="ts">
import { defineComponent, h, PropType } from 'vue';

const MaterialTreeNodeVue = defineComponent({
    name: 'MaterialTreeNodeVue',
    props: {
        node: {
            type: Object as PropType<MaterialTreeNode>,
            required: true,
        },
        bottleneckId: {
            type: Number as PropType<number | null>,
            default: null,
        },
    },
    emits: ['toggle-expand', 'update-quantity'],
    setup(props: { node: MaterialTreeNode; bottleneckId: number | null }, { emit }: { emit: (event: string, ...args: unknown[]) => void }) {
        const indentStyle = computed(() => `${props.node.depth * 24}px`);
        const isBottleneck = computed(() => props.bottleneckId !== null && props.node.id === props.bottleneckId);

        return () => h('div', { class: 'tree-node-wrapper' }, [
            // 節點行
            h('div', { class: ['tree-node-row', { 'has-children': props.node.canCraft, 'bottleneck': isBottleneck.value }] }, [
                // 材料名稱
                h('div', {
                    class: 'col-name',
                    style: { paddingLeft: indentStyle.value },
                }, [
                    // 展開/收合按鈕
                    props.node.canCraft
                        ? h('span', {
                            class: ['expand-btn', { expanded: props.node.expanded }],
                            onClick: () => emit('toggle-expand', props.node),
                        }, props.node.loading ? '⏳' : (props.node.expanded ? '▼' : '▶'))
                        : h('span', { class: 'expand-placeholder' }, '•'),
                    h('span', { class: 'node-name' }, props.node.name),
                    props.node.canCraft
                        ? h(ElTag, { size: 'small', type: 'success' }, () => '可製作')
                        : null,
                    // 瓶頸標記
                    isBottleneck.value
                        ? h(ElTag, { size: 'small', type: 'danger' }, () => '🪣 瓶頸')
                        : null,
                ]),
                // 總需求
                h('span', { class: 'col-required' }, formatNumber(props.node.totalRequired)),
                // 購買數量
                h('div', { class: 'col-owned' }, [
                    h(ElInputNumber, {
                        modelValue: props.node.purchasedQuantity,
                        'onUpdate:modelValue': (val: number) => emit('update-quantity', props.node, 'purchasedQuantity', val ?? 0),
                        min: 0,
                        size: 'small',
                        controlsPosition: 'right',
                    }),
                ]),
                // 單價
                h('div', { class: 'col-price' }, [
                    h(ElInputNumber, {
                        modelValue: props.node.unitPrice,
                        'onUpdate:modelValue': (val: number) => emit('update-quantity', props.node, 'unitPrice', val ?? 0),
                        min: 0,
                        size: 'small',
                        controlsPosition: 'right',
                    }),
                ]),
                // 小計
                h('span', { class: 'col-subtotal' }, formatNumber(props.node.subtotal)),
            ]),
            // 子節點
            props.node.expanded && props.node.children.length > 0
                ? h('div', { class: 'tree-children' },
                    props.node.children.map((child: MaterialTreeNode) =>
                        h(MaterialTreeNodeVue, {
                            key: child.id,
                            node: child,
                            bottleneckId: props.bottleneckId,
                            onToggleExpand: (n: MaterialTreeNode) => emit('toggle-expand', n),
                            onUpdateQuantity: (n: MaterialTreeNode, f: string, v: number) => emit('update-quantity', n, f, v),
                        })
                    )
                )
                : null,
        ]);

        function formatNumber(num: number): string {
            return num.toLocaleString('zh-TW', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
        }
    },
});
</script>

<style scoped>
.material-tree {
    width: 100%;
}

.tree-header {
    margin-bottom: 10px;
}

.tree-container {
    border: 1px solid var(--el-border-color);
    border-radius: 4px;
    overflow: hidden;
}

.tree-header-row {
    display: flex;
    align-items: center;
    padding: 8px 12px;
    background: var(--el-fill-color-light);
    font-weight: bold;
    font-size: 12px;
    border-bottom: 1px solid var(--el-border-color);
}

/* 使用 :deep() 讓 scoped 樣式能套用到 defineComponent 渲染的子元件 */
:deep(.tree-node-wrapper) {
    border-bottom: 1px solid var(--el-border-color-lighter);
}

:deep(.tree-node-wrapper:last-child) {
    border-bottom: none;
}

:deep(.tree-node-row) {
    display: flex;
    align-items: center;
    padding: 6px 12px;
    transition: background-color 0.2s;
}

:deep(.tree-node-row:hover) {
    background: var(--el-fill-color-lighter);
}

:deep(.tree-node-row.has-children) {
    cursor: pointer;
}

:deep(.col-name) {
    flex: 1;
    min-width: 200px;
    display: flex;
    align-items: center;
    gap: 6px;
}

:deep(.col-required),
:deep(.col-subtotal) {
    width: 80px;
    text-align: right;
    font-family: 'Consolas', 'Monaco', monospace;
}

:deep(.col-owned),
:deep(.col-price) {
    width: 120px;
}

:deep(.expand-btn) {
    cursor: pointer;
    user-select: none;
    width: 16px;
    display: inline-block;
    text-align: center;
    font-size: 10px;
    transition: transform 0.2s;
}

:deep(.expand-btn.expanded) {
    color: var(--el-color-primary);
}

:deep(.expand-placeholder) {
    width: 16px;
    display: inline-block;
    text-align: center;
    color: var(--el-text-color-placeholder);
}

:deep(.node-name) {
    font-size: 13px;
}

:deep(.shortage) {
    color: var(--el-color-danger);
    font-weight: bold;
}

:deep(.bottleneck) {
    background: var(--el-color-danger-light-9);
    border-left: 3px solid var(--el-color-danger);
}

:deep(.tree-children) {
    background: var(--el-fill-color-blank);
}

.empty-text {
    display: block;
    text-align: center;
    padding: 20px;
}

.tree-settings {
    display: flex;
    align-items: center;
    gap: 15px;
    margin-bottom: 15px;
    padding: 10px;
    background: var(--el-fill-color-light);
    border-radius: 4px;
}

.setting-item {
    display: flex;
    align-items: center;
    gap: 8px;
}

.setting-label {
    font-size: 13px;
    color: var(--el-text-color-regular);
    white-space: nowrap;
}

.cost-summary-bar {
    display: flex;
    flex-wrap: wrap;
    gap: 20px;
    padding: 12px 15px;
    background: var(--el-color-info-light-9);
    border-radius: 4px;
    margin-bottom: 15px;
}

.summary-item {
    display: flex;
    align-items: center;
    gap: 6px;
}

.summary-label {
    font-size: 13px;
    color: var(--el-text-color-regular);
}

.summary-value {
    font-size: 16px;
    font-weight: bold;
    font-family: 'Consolas', 'Monaco', monospace;
}

.summary-value.success {
    color: var(--el-color-success);
}

.summary-value.warning {
    color: var(--el-color-warning);
}

.summary-unit {
    font-size: 12px;
    color: var(--el-text-color-secondary);
}

.summary-detail {
    font-size: 12px;
    color: var(--el-text-color-secondary);
    margin-left: 4px;
}

/* 水晶區塊樣式 */
.crystal-section {
    margin-top: 20px;
    border: 1px solid var(--el-border-color);
    border-radius: 4px;
    overflow: hidden;
}

.crystal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 12px;
    background: var(--el-color-primary-light-9);
    border-bottom: 1px solid var(--el-border-color);
}

.crystal-total {
    font-size: 13px;
    font-weight: bold;
    color: var(--el-color-primary);
}

.crystal-table {
    transition: opacity 0.2s;
}

.crystal-table.disabled {
    opacity: 0.5;
}

.crystal-header-row {
    display: flex;
    align-items: center;
    padding: 8px 12px;
    background: var(--el-fill-color-light);
    font-weight: bold;
    font-size: 12px;
    border-bottom: 1px solid var(--el-border-color);
}

.crystal-row {
    display: flex;
    align-items: center;
    padding: 8px 12px;
    border-bottom: 1px solid var(--el-border-color-lighter);
}

.crystal-row.bottleneck {
    background: var(--el-color-danger-light-9);
    border-left: 3px solid var(--el-color-danger);
}

.crystal-row:last-child {
    border-bottom: none;
}

.crystal-row:hover {
    background: var(--el-fill-color-lighter);
}

.crystal-icon {
    margin-right: 6px;
}
</style>

<fluent locale="zh-CN">
load-material-tree = 载入材料树
total-required = 总需求
click-load-to-start = 点击上方按钮载入材料树状图
craft-amount = 制作数量
material-name = 材料名称
purchased-quantity = 购买数量
unit-price = 单价
subtotal = 小计
craftable-amount = 可制作数量
total-purchase-cost = 总购买成本
cost-per-craft = 单个成本
unit-pieces = 个
include-crystal-cost = 计入水晶成本
use-inventory-data = 自动带入库存
crystal-name = 水晶名称
crystal-total = 水晶总计
includes-crystal = 含水晶
</fluent>

<fluent locale="zh-TW">
load-material-tree = 載入材料樹
total-required = 總需求
click-load-to-start = 點擊上方按鈕載入材料樹狀圖
craft-amount = 製作數量
material-name = 材料名稱
purchased-quantity = 購買數量
unit-price = 單價
subtotal = 小計
craftable-amount = 可製作數量
total-purchase-cost = 總購買成本
cost-per-craft = 單個成本
unit-pieces = 個
include-crystal-cost = 計入水晶成本
use-inventory-data = 自動帶入庫存
crystal-name = 水晶名稱
crystal-total = 水晶總計
includes-crystal = 含水晶
</fluent>

<fluent locale="en-US">
load-material-tree = Load Material Tree
total-required = Total Required
click-load-to-start = Click the button above to load material tree
craft-amount = Craft Amount
material-name = Material Name
purchased-quantity = Purchased
unit-price = Unit Price
subtotal = Subtotal
craftable-amount = Craftable Amount
total-purchase-cost = Total Purchase Cost
cost-per-craft = Cost Per Craft
unit-pieces = pcs
include-crystal-cost = Include Crystal Cost
use-inventory-data = Auto-fill from Inventory
crystal-name = Crystal
crystal-total = Crystal Total
includes-crystal = incl. crystal
</fluent>

<fluent locale="ja-JP">
load-material-tree = 材料ツリーを読み込む
total-required = 総必要数
click-load-to-start = 上のボタンをクリックして材料ツリーを読み込みます
craft-amount = 製作数
material-name = 材料名
purchased-quantity = 購入数
unit-price = 単価
subtotal = 小計
craftable-amount = 製作可能数
total-purchase-cost = 総購入コスト
cost-per-craft = 単体コスト
unit-pieces = 個
include-crystal-cost = クリスタルコストを含める
use-inventory-data = 在庫から自動入力
crystal-name = クリスタル
crystal-total = クリスタル合計
includes-crystal = クリスタル含む
</fluent>
