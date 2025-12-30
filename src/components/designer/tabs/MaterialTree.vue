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
} from 'element-plus';
import { Refresh, Warning, Loading } from '@element-plus/icons-vue';
import useSettingsStore from '@/stores/settings';
import { DataSource } from '@/datasource/source';
import { ItemWithAmount, RecipeInfo } from '@/libs/Craft';

// 樹狀節點資料結構
export interface MaterialTreeNode {
    id: number;                     // 材料 ID
    name: string;                   // 材料名稱
    requiredPerCraft: number;       // 每次製作所需數量
    totalRequired: number;          // 總共需要數量（根據目標製作數量計算）
    ownedQuantity: number;          // 持有數量
    unitPrice: number;              // 單價
    needToBuy: number;              // 需購買數量
    recipeId?: number;              // 若此材料可製作，則有配方 ID
    canCraft: boolean;              // 是否可以製作
    expanded: boolean;              // 是否展開子材料
    loading: boolean;               // 是否正在載入子材料
    children: MaterialTreeNode[];   // 子材料
    depth: number;                  // 樹的深度
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

// 樹狀資料
const treeData = ref<MaterialTreeNode[]>([]);
const loading = ref(false);
const loadError = ref<string | null>(null);

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

// 取得配方材料
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

    try {
        const dataSource = await settingsStore.getDataSource();
        const ingredients = await fetchIngredients(dataSource, props.recipeId);

        const nodes: MaterialTreeNode[] = [];
        for (const ing of ingredients) {
            const itemInfo = await fetchItemInfo(dataSource, ing.ingredient_id);
            const recipe = await findRecipeByItemId(dataSource, itemInfo.id, itemInfo.name);

            const node: MaterialTreeNode = {
                id: itemInfo.id,
                name: itemInfo.name,
                requiredPerCraft: ing.amount,
                totalRequired: ing.amount * localCraftAmount.value,
                ownedQuantity: 0,
                unitPrice: 0,
                needToBuy: ing.amount * localCraftAmount.value,
                recipeId: recipe?.id,
                canCraft: recipe !== null,
                expanded: false,
                loading: false,
                children: [],
                depth: 0,
            };
            nodes.push(node);
        }

        treeData.value = nodes;
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
        // 收合
        node.expanded = false;
        node.children = [];
    } else {
        // 展開
        node.loading = true;
        try {
            const dataSource = await settingsStore.getDataSource();
            const ingredients = await fetchIngredients(dataSource, node.recipeId);

            const children: MaterialTreeNode[] = [];
            for (const ing of ingredients) {
                const itemInfo = await fetchItemInfo(dataSource, ing.ingredient_id);
                const recipe = await findRecipeByItemId(dataSource, itemInfo.id, itemInfo.name);

                // 計算子材料需要的數量（根據父材料的需購買數量）
                const parentNeedToCraft = Math.ceil(Math.max(0, node.needToBuy) / node.requiredPerCraft);
                const childRequired = ing.amount * parentNeedToCraft;

                const childNode: MaterialTreeNode = {
                    id: itemInfo.id,
                    name: itemInfo.name,
                    requiredPerCraft: ing.amount,
                    totalRequired: childRequired,
                    ownedQuantity: 0,
                    unitPrice: 0,
                    needToBuy: childRequired,
                    recipeId: recipe?.id,
                    canCraft: recipe !== null,
                    expanded: false,
                    loading: false,
                    children: [],
                    depth: node.depth + 1,
                };
                children.push(childNode);
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

// 更新節點數量
function updateNodeQuantity(node: MaterialTreeNode, field: 'ownedQuantity' | 'unitPrice', value: number) {
    node[field] = value;
    recalculateNode(node);
    recalculateAll();
}

// 重新計算單一節點
function recalculateNode(node: MaterialTreeNode) {
    node.needToBuy = Math.max(0, node.totalRequired - node.ownedQuantity);

    // 如果有子節點，重新計算子節點的需求量
    if (node.expanded && node.children.length > 0) {
        const parentNeedToCraft = Math.ceil(node.needToBuy / node.requiredPerCraft);
        for (const child of node.children) {
            child.totalRequired = child.requiredPerCraft * parentNeedToCraft;
            recalculateNode(child);
        }
    }
}

// 重新計算所有節點並更新目標成本
function recalculateAll() {
    // 重新計算各節點的需購買數量
    for (const node of treeData.value) {
        node.totalRequired = node.requiredPerCraft * localCraftAmount.value;
        recalculateNode(node);
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
            // 計算此節點的成本
            total += node.needToBuy * node.unitPrice;
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
                <span class="col-owned">{{ $t('owned-quantity') }}</span>
                <span class="col-need">{{ $t('need-to-buy') }}</span>
                <span class="col-price">{{ $t('unit-price') }}</span>
                <span class="col-subtotal">{{ $t('subtotal') }}</span>
            </div>

            <!-- 遞迴渲染樹節點 -->
            <MaterialTreeNodeVue
                v-for="node in treeData"
                :key="node.id"
                :node="node"
                @toggle-expand="toggleExpand"
                @update-quantity="updateNodeQuantity"
            />
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
    },
    emits: ['toggle-expand', 'update-quantity'],
    setup(props: { node: MaterialTreeNode }, { emit }: { emit: (event: string, ...args: unknown[]) => void }) {
        const indentStyle = computed(() => `${props.node.depth * 24}px`);

        return () => h('div', { class: 'tree-node-wrapper' }, [
            // 節點行
            h('div', { class: ['tree-node-row', { 'has-children': props.node.canCraft }] }, [
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
                ]),
                // 總需求
                h('span', { class: 'col-required' }, formatNumber(props.node.totalRequired)),
                // 持有數量
                h('div', { class: 'col-owned' }, [
                    h(ElInputNumber, {
                        modelValue: props.node.ownedQuantity,
                        'onUpdate:modelValue': (val: number) => emit('update-quantity', props.node, 'ownedQuantity', val ?? 0),
                        min: 0,
                        size: 'small',
                        controlsPosition: 'right',
                    }),
                ]),
                // 需購買
                h('span', {
                    class: ['col-need', { shortage: props.node.needToBuy > 0 }],
                }, formatNumber(props.node.needToBuy)),
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
                h('span', { class: 'col-subtotal' }, formatNumber(props.node.needToBuy * props.node.unitPrice)),
            ]),
            // 子節點
            props.node.expanded && props.node.children.length > 0
                ? h('div', { class: 'tree-children' },
                    props.node.children.map((child: MaterialTreeNode) =>
                        h(MaterialTreeNodeVue, {
                            key: child.id,
                            node: child,
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

.tree-node-wrapper {
    border-bottom: 1px solid var(--el-border-color-lighter);
}

.tree-node-wrapper:last-child {
    border-bottom: none;
}

.tree-node-row {
    display: flex;
    align-items: center;
    padding: 6px 12px;
    transition: background-color 0.2s;
}

.tree-node-row:hover {
    background: var(--el-fill-color-lighter);
}

.tree-node-row.has-children {
    cursor: pointer;
}

.col-name {
    flex: 1;
    min-width: 200px;
    display: flex;
    align-items: center;
    gap: 6px;
}

.col-required,
.col-need,
.col-subtotal {
    width: 80px;
    text-align: right;
    font-family: 'Consolas', 'Monaco', monospace;
}

.col-owned,
.col-price {
    width: 100px;
}

.expand-btn {
    cursor: pointer;
    user-select: none;
    width: 16px;
    display: inline-block;
    text-align: center;
    font-size: 10px;
    transition: transform 0.2s;
}

.expand-btn.expanded {
    color: var(--el-color-primary);
}

.expand-placeholder {
    width: 16px;
    display: inline-block;
    text-align: center;
    color: var(--el-text-color-placeholder);
}

.node-name {
    font-size: 13px;
}

.shortage {
    color: var(--el-color-danger);
    font-weight: bold;
}

.tree-children {
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
</style>

<fluent locale="zh-CN">
load-material-tree = 载入材料树
total-required = 总需求
click-load-to-start = 点击上方按钮载入材料树状图
craft-amount = 制作数量
material-name = 材料名称
owned-quantity = 持有数量
need-to-buy = 需购买
unit-price = 单价
subtotal = 小计
</fluent>

<fluent locale="zh-TW">
load-material-tree = 載入材料樹
total-required = 總需求
click-load-to-start = 點擊上方按鈕載入材料樹狀圖
craft-amount = 製作數量
material-name = 材料名稱
owned-quantity = 持有數量
need-to-buy = 需購買
unit-price = 單價
subtotal = 小計
</fluent>

<fluent locale="en-US">
load-material-tree = Load Material Tree
total-required = Total Required
click-load-to-start = Click the button above to load material tree
craft-amount = Craft Amount
material-name = Material Name
owned-quantity = Owned
need-to-buy = Need to Buy
unit-price = Unit Price
subtotal = Subtotal
</fluent>

<fluent locale="ja-JP">
load-material-tree = 材料ツリーを読み込む
total-required = 総必要数
click-load-to-start = 上のボタンをクリックして材料ツリーを読み込みます
craft-amount = 製作数
material-name = 材料名
owned-quantity = 所持数
need-to-buy = 購入必要
unit-price = 単価
subtotal = 小計
</fluent>
