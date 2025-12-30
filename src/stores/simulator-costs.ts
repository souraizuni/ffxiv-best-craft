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

export interface MaterialCost {
    materialId: number;
    materialName: string;
    price: number;
    quantity: number; // 購買/擁有的數量
    requiredPerCraft: number; // 每次製作需要的數量
    includeTax: boolean;
}

export interface EquipmentCostData {
    equipmentId: string; // 使用配方 ID 或物品名稱作為識別
    materials: MaterialCost[];
    taxRate: number; // 稅率百分比，預設 5
    targetCraftAmount: number; // 目標製作數量
}

export default defineStore('simulator-costs', {
    state: () => ({
        // 以裝備/配方為 key 儲存成本資料
        costs: new Map<string, EquipmentCostData>(),
        // 全域預設稅率
        defaultTaxRate: 5,
    }),

    getters: {
        toJson(): string {
            const costsObj: Record<string, EquipmentCostData> = {};
            for (const [key, value] of this.costs.entries()) {
                costsObj[key] = value;
            }
            return JSON.stringify({
                costs: costsObj,
                defaultTaxRate: this.defaultTaxRate,
            });
        },
    },

    actions: {
        fromJson(json: string) {
            try {
                const data = JSON.parse(json);
                if (data.costs) {
                    this.costs = new Map(Object.entries(data.costs));
                }
                if (typeof data.defaultTaxRate === 'number') {
                    this.defaultTaxRate = data.defaultTaxRate;
                }
            } catch (e) {
                console.error('Failed to parse simulator-costs.json:', e);
            }
        },

        // 取得或建立裝備的成本資料
        getOrCreateEquipmentCost(equipmentId: string): EquipmentCostData {
            let costData = this.costs.get(equipmentId);
            if (!costData) {
                costData = {
                    equipmentId,
                    materials: [],
                    taxRate: this.defaultTaxRate,
                    targetCraftAmount: 1,
                };
                this.costs.set(equipmentId, costData);
            }
            return costData;
        },

        // 更新材料成本
        updateMaterialCost(
            equipmentId: string,
            materialId: number,
            materialName: string,
            price: number,
            quantity: number,
            requiredPerCraft: number,
            includeTax: boolean,
        ) {
            const costData = this.getOrCreateEquipmentCost(equipmentId);
            const existingIndex = costData.materials.findIndex(
                (m: MaterialCost) => m.materialId === materialId,
            );

            const material: MaterialCost = {
                materialId,
                materialName,
                price,
                quantity,
                requiredPerCraft,
                includeTax,
            };

            if (existingIndex >= 0) {
                costData.materials[existingIndex] = material;
            } else {
                costData.materials.push(material);
            }
        },

        // 移除材料成本
        removeMaterialCost(equipmentId: string, materialId: number) {
            const costData = this.costs.get(equipmentId);
            if (costData) {
                costData.materials = costData.materials.filter(
                    (m: MaterialCost) => m.materialId !== materialId,
                );
            }
        },

        // 更新稅率
        updateTaxRate(equipmentId: string, taxRate: number) {
            const costData = this.getOrCreateEquipmentCost(equipmentId);
            costData.taxRate = taxRate;
        },

        // 計算單個材料的總成本（含稅計算）
        calculateMaterialTotalCost(
            material: MaterialCost,
            taxRate: number,
        ): number {
            const baseCost = material.price * material.quantity;
            if (material.includeTax) {
                // 價格已含稅，直接返回
                return baseCost;
            } else {
                // 價格不含稅，需要加上稅額
                return baseCost * (1 + taxRate / 100);
            }
        },

        // 計算裝備的總成本
        calculateEquipmentTotalCost(equipmentId: string): number {
            const costData = this.costs.get(equipmentId);
            if (!costData) return 0;

            return costData.materials.reduce((total: number, material: MaterialCost) => {
                return (
                    total +
                    this.calculateMaterialTotalCost(material, costData.taxRate)
                );
            }, 0);
        },

        // 計算稅額總計
        calculateTotalTax(equipmentId: string): number {
            const costData = this.costs.get(equipmentId);
            if (!costData) return 0;

            return costData.materials.reduce((total: number, material: MaterialCost) => {
                if (material.includeTax) {
                    return total;
                }
                const baseCost = material.price * material.quantity;
                return total + baseCost * (costData.taxRate / 100);
            }, 0);
        },

        // 清除裝備的所有成本資料
        clearEquipmentCost(equipmentId: string) {
            this.costs.delete(equipmentId);
        },

        // 計算可製作數量（根據材料庫存和每次製作需求量）
        calculateCraftableAmount(equipmentId: string): number {
            const costData = this.costs.get(equipmentId);
            if (!costData || costData.materials.length === 0) return 0;

            // 找出每種材料可以製作的數量，取最小值
            const craftableAmounts = costData.materials
                .filter((m: MaterialCost) => m.requiredPerCraft > 0)
                .map((m: MaterialCost) => Math.floor(m.quantity / m.requiredPerCraft));

            if (craftableAmounts.length === 0) return 0;
            return Math.min(...craftableAmounts);
        },

        // 計算單個成品的成本
        calculateCostPerCraft(equipmentId: string): number {
            const costData = this.costs.get(equipmentId);
            if (!costData || costData.materials.length === 0) return 0;

            // 計算每次製作的材料成本
            return costData.materials.reduce((total: number, material: MaterialCost) => {
                const materialCostPerUnit = material.price * (material.includeTax ? 1 : (1 + costData.taxRate / 100));
                return total + materialCostPerUnit * material.requiredPerCraft;
            }, 0);
        },

        // 更新目標製作數量
        updateTargetCraftAmount(equipmentId: string, targetAmount: number) {
            const costData = this.getOrCreateEquipmentCost(equipmentId);
            costData.targetCraftAmount = Math.max(0, Math.floor(targetAmount));
        },

        // 計算每種材料需要購買的數量（根據目標製作數量和現有庫存）
        calculateRequiredMaterialAmount(material: MaterialCost, targetCraftAmount: number): number {
            const totalNeeded = material.requiredPerCraft * targetCraftAmount;
            const shortage = totalNeeded - material.quantity;
            return Math.max(0, shortage);
        },

        // 取得所有材料的需要購買數量
        getRequiredMaterialAmounts(equipmentId: string): { materialId: number; materialName: string; required: number; totalNeeded: number }[] {
            const costData = this.costs.get(equipmentId);
            if (!costData || costData.materials.length === 0) return [];

            const targetAmount = costData.targetCraftAmount || 1;
            return costData.materials.map((m: MaterialCost) => {
                const totalNeeded = m.requiredPerCraft * targetAmount;
                return {
                    materialId: m.materialId,
                    materialName: m.materialName,
                    required: Math.max(0, totalNeeded - m.quantity),
                    totalNeeded,
                };
            });
        },

        // 計算目標製作數量的總成本
        calculateTargetCraftTotalCost(equipmentId: string): number {
            const costData = this.costs.get(equipmentId);
            if (!costData || costData.materials.length === 0) return 0;

            const targetAmount = costData.targetCraftAmount || 1;
            return costData.materials.reduce((total: number, material: MaterialCost) => {
                const totalNeeded = material.requiredPerCraft * targetAmount;
                const shortage = Math.max(0, totalNeeded - material.quantity);
                const materialCostPerUnit = material.price * (material.includeTax ? 1 : (1 + costData.taxRate / 100));
                return total + materialCostPerUnit * shortage;
            }, 0);
        },
    },
});
