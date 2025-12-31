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
import { ref, watch } from 'vue';
import {
    doc,
    getDoc,
    setDoc,
    serverTimestamp,
    type DocumentReference,
} from 'firebase/firestore';
import { getFirebaseFirestore } from '@/libs/firebase';
import { useAuthStore } from './auth';
import useSettingsStore from './settings';
import useGearsetsStore from './gearsets';
import useDesignerStore from './designer';
import useSimulatorCostsStore from './simulator-costs';
import useMaterialsInventoryStore from './materials-inventory';

export interface SyncStatus {
    lastSyncTime: Date | null;
    syncing: boolean;
    error: string | null;
}

export const useCloudSyncStore = defineStore('cloud-sync', () => {
    // State
    const syncStatus = ref<SyncStatus>({
        lastSyncTime: null,
        syncing: false,
        error: null,
    });
    const autoSync = ref(true);

    // 取得使用者文件參考
    function getUserDocRef(): DocumentReference | null {
        const db = getFirebaseFirestore();
        const authStore = useAuthStore();
        
        if (!db || !authStore.user) {
            return null;
        }
        
        return doc(db, 'users', authStore.user.uid);
    }

    // 上傳資料到雲端
    async function uploadToCloud(): Promise<boolean> {
        const docRef = getUserDocRef();
        if (!docRef) {
            syncStatus.value.error = '未登入或 Firebase 未設定';
            return false;
        }

        syncStatus.value.syncing = true;
        syncStatus.value.error = null;

        try {
            const settingsStore = useSettingsStore();
            const gearsetsStore = useGearsetsStore();
            const designerStore = useDesignerStore();
            const simulatorCostsStore = useSimulatorCostsStore();
            const materialsInventoryStore = useMaterialsInventoryStore();

            const data = {
                settings: settingsStore.toJson,
                gearsets: gearsetsStore.toJson,
                designer: designerStore.toJson,
                simulatorCosts: simulatorCostsStore.toJson,
                materialsInventory: materialsInventoryStore.toJson(),
                updatedAt: serverTimestamp(),
            };

            await setDoc(docRef, data, { merge: true });
            syncStatus.value.lastSyncTime = new Date();
            return true;
        } catch (e: any) {
            console.error('Upload to cloud error:', e);
            syncStatus.value.error = e.message || '上傳失敗';
            return false;
        } finally {
            syncStatus.value.syncing = false;
        }
    }

    // 從雲端下載資料
    async function downloadFromCloud(): Promise<boolean> {
        const docRef = getUserDocRef();
        if (!docRef) {
            syncStatus.value.error = '未登入或 Firebase 未設定';
            return false;
        }

        syncStatus.value.syncing = true;
        syncStatus.value.error = null;

        try {
            const docSnap = await getDoc(docRef);
            
            if (!docSnap.exists()) {
                // 雲端沒有資料，上傳本地資料
                return await uploadToCloud();
            }

            const data = docSnap.data();
            const settingsStore = useSettingsStore();
            const gearsetsStore = useGearsetsStore();
            const designerStore = useDesignerStore();
            const simulatorCostsStore = useSimulatorCostsStore();
            const materialsInventoryStore = useMaterialsInventoryStore();

            if (data.settings) {
                settingsStore.fromJson(data.settings);
            }
            if (data.gearsets) {
                gearsetsStore.fromJson(data.gearsets);
            }
            if (data.designer) {
                designerStore.fromJson(data.designer);
            }
            if (data.simulatorCosts) {
                simulatorCostsStore.fromJson(data.simulatorCosts);
            }
            if (data.materialsInventory) {
                materialsInventoryStore.fromJson(data.materialsInventory);
            }

            syncStatus.value.lastSyncTime = new Date();
            return true;
        } catch (e: any) {
            console.error('Download from cloud error:', e);
            syncStatus.value.error = e.message || '下載失敗';
            return false;
        } finally {
            syncStatus.value.syncing = false;
        }
    }

    // 設置自動同步（當登入狀態變化時）
    function setupAutoSync() {
        const authStore = useAuthStore();
        
        watch(
            () => authStore.isLoggedIn,
            async (isLoggedIn) => {
                if (isLoggedIn && autoSync.value) {
                    // 登入後自動從雲端下載
                    await downloadFromCloud();
                }
            },
        );
    }

    // 清除錯誤
    function clearError() {
        syncStatus.value.error = null;
    }

    return {
        // State
        syncStatus,
        autoSync,
        // Actions
        uploadToCloud,
        downloadFromCloud,
        setupAutoSync,
        clearError,
    };
});
