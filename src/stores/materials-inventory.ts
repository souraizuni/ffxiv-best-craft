// This file is part of BestCraft.
// Copyright (C) 2025 Tnze
//
// BestCraft is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published
// by the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// BestCraft is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program.  If not, see <https://www.gnu.org/licenses/>.

import { defineStore } from 'pinia';
import { ref, computed } from 'vue';

// 水晶類型（ID < 20）
export interface CrystalInventory {
    id: number;          // 水晶 ID
    name: string;        // 水晶名稱
    quantity: number;    // 持有數量
    unitPrice: number;   // 購買單價
}

// 材料庫存
export interface MaterialInventory {
    id: number;          // 材料 ID
    name: string;        // 材料名稱
    quantity: number;    // 持有數量
    unitPrice: number;   // 購買單價
}

// 預設水晶列表（FF14 的 8 種水晶）
const DEFAULT_CRYSTALS: CrystalInventory[] = [
    { id: 2, name: '火之碎晶', quantity: 0, unitPrice: 0 },
    { id: 3, name: '冰之碎晶', quantity: 0, unitPrice: 0 },
    { id: 4, name: '風之碎晶', quantity: 0, unitPrice: 0 },
    { id: 5, name: '土之碎晶', quantity: 0, unitPrice: 0 },
    { id: 6, name: '雷之碎晶', quantity: 0, unitPrice: 0 },
    { id: 7, name: '水之碎晶', quantity: 0, unitPrice: 0 },
    { id: 8, name: '火之水晶', quantity: 0, unitPrice: 0 },
    { id: 9, name: '冰之水晶', quantity: 0, unitPrice: 0 },
    { id: 10, name: '風之水晶', quantity: 0, unitPrice: 0 },
    { id: 11, name: '土之水晶', quantity: 0, unitPrice: 0 },
    { id: 12, name: '雷之水晶', quantity: 0, unitPrice: 0 },
    { id: 13, name: '水之水晶', quantity: 0, unitPrice: 0 },
    { id: 14, name: '火之晶簇', quantity: 0, unitPrice: 0 },
    { id: 15, name: '冰之晶簇', quantity: 0, unitPrice: 0 },
    { id: 16, name: '風之晶簇', quantity: 0, unitPrice: 0 },
    { id: 17, name: '土之晶簇', quantity: 0, unitPrice: 0 },
    { id: 18, name: '雷之晶簇', quantity: 0, unitPrice: 0 },
    { id: 19, name: '水之晶簇', quantity: 0, unitPrice: 0 },
];

export const useMaterialsInventoryStore = defineStore('materials-inventory', () => {
    // 水晶庫存
    const crystals = ref<CrystalInventory[]>(JSON.parse(JSON.stringify(DEFAULT_CRYSTALS)));
    
    // 材料庫存
    const materials = ref<MaterialInventory[]>([]);

    // 取得水晶資訊
    function getCrystal(id: number): CrystalInventory | undefined {
        return crystals.value.find((c: CrystalInventory) => c.id === id);
    }

    // 更新水晶數量
    function updateCrystalQuantity(id: number, quantity: number) {
        const crystal = crystals.value.find((c: CrystalInventory) => c.id === id);
        if (crystal) {
            crystal.quantity = Math.max(0, quantity);
        }
    }

    // 更新水晶單價
    function updateCrystalPrice(id: number, unitPrice: number) {
        const crystal = crystals.value.find((c: CrystalInventory) => c.id === id);
        if (crystal) {
            crystal.unitPrice = Math.max(0, unitPrice);
        }
    }

    // 更新水晶名稱（用於多語言）
    function updateCrystalName(id: number, name: string) {
        const crystal = crystals.value.find((c: CrystalInventory) => c.id === id);
        if (crystal) {
            crystal.name = name;
        }
    }

    // 取得材料資訊
    function getMaterial(id: number): MaterialInventory | undefined {
        return materials.value.find((m: MaterialInventory) => m.id === id);
    }

    // 新增或更新材料
    function upsertMaterial(id: number, name: string, quantity?: number, unitPrice?: number) {
        const existing = materials.value.find((m: MaterialInventory) => m.id === id);
        if (existing) {
            if (quantity !== undefined) existing.quantity = Math.max(0, quantity);
            if (unitPrice !== undefined) existing.unitPrice = Math.max(0, unitPrice);
            if (name) existing.name = name;
        } else {
            materials.value.push({
                id,
                name,
                quantity: quantity ?? 0,
                unitPrice: unitPrice ?? 0,
            });
        }
    }

    // 更新材料數量
    function updateMaterialQuantity(id: number, quantity: number) {
        const material = materials.value.find((m: MaterialInventory) => m.id === id);
        if (material) {
            material.quantity = Math.max(0, quantity);
        }
    }

    // 更新材料單價
    function updateMaterialPrice(id: number, unitPrice: number) {
        const material = materials.value.find((m: MaterialInventory) => m.id === id);
        if (material) {
            material.unitPrice = Math.max(0, unitPrice);
        }
    }

    // 移除材料
    function removeMaterial(id: number) {
        const index = materials.value.findIndex((m: MaterialInventory) => m.id === id);
        if (index !== -1) {
            materials.value.splice(index, 1);
        }
    }

    // 計算水晶總成本
    const totalCrystalCost = computed(() => {
        return crystals.value.reduce((sum: number, c: CrystalInventory) => sum + c.quantity * c.unitPrice, 0);
    });

    // 計算材料總成本
    const totalMaterialCost = computed(() => {
        return materials.value.reduce((sum: number, m: MaterialInventory) => sum + m.quantity * m.unitPrice, 0);
    });

    // 序列化為 JSON
    function toJson(): string {
        return JSON.stringify({
            crystals: crystals.value,
            materials: materials.value,
        });
    }

    // 從 JSON 還原
    function fromJson(json: string) {
        try {
            const data = JSON.parse(json);
            if (Array.isArray(data.crystals)) {
                // 合併預設水晶和已儲存的資料
                crystals.value = DEFAULT_CRYSTALS.map(defaultCrystal => {
                    const saved = data.crystals.find((c: CrystalInventory) => c.id === defaultCrystal.id);
                    return saved ? { ...defaultCrystal, ...saved } : { ...defaultCrystal };
                });
            }
            if (Array.isArray(data.materials)) {
                materials.value = data.materials;
            }
        } catch (e) {
            console.error('Failed to parse materials-inventory.json:', e);
        }
    }

    // 重置所有資料
    function reset() {
        crystals.value = JSON.parse(JSON.stringify(DEFAULT_CRYSTALS));
        materials.value = [];
    }

    return {
        // State
        crystals,
        materials,
        
        // Getters
        totalCrystalCost,
        totalMaterialCost,
        
        // Actions - Crystals
        getCrystal,
        updateCrystalQuantity,
        updateCrystalPrice,
        updateCrystalName,
        
        // Actions - Materials
        getMaterial,
        upsertMaterial,
        updateMaterialQuantity,
        updateMaterialPrice,
        removeMaterial,
        
        // Serialization
        toJson,
        fromJson,
        reset,
    };
});

export default useMaterialsInventoryStore;
