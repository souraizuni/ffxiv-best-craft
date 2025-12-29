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
import {
    GoogleAuthProvider,
    signInWithPopup,
    signOut as firebaseSignOut,
    onAuthStateChanged,
    type User,
} from 'firebase/auth';
import { getFirebaseAuth, isFirebaseConfigured } from '@/libs/firebase';

export interface UserInfo {
    uid: string;
    email: string | null;
    displayName: string | null;
    photoURL: string | null;
}

export const useAuthStore = defineStore('auth', () => {
    // State
    const user = ref<UserInfo | null>(null);
    const loading = ref(true);
    const error = ref<string | null>(null);
    const initialized = ref(false);

    // Getters
    const isLoggedIn = computed(() => user.value !== null);
    const isFirebaseEnabled = computed(() => isFirebaseConfigured());

    // 初始化認證狀態監聽
    function initAuth() {
        if (initialized.value) return;
        
        const auth = getFirebaseAuth();
        if (!auth) {
            loading.value = false;
            initialized.value = true;
            return;
        }

        onAuthStateChanged(auth, (firebaseUser: User | null) => {
            if (firebaseUser) {
                user.value = {
                    uid: firebaseUser.uid,
                    email: firebaseUser.email,
                    displayName: firebaseUser.displayName,
                    photoURL: firebaseUser.photoURL,
                };
            } else {
                user.value = null;
            }
            loading.value = false;
            initialized.value = true;
        });
    }

    // Google 登入
    async function signInWithGoogle(): Promise<boolean> {
        const auth = getFirebaseAuth();
        if (!auth) {
            error.value = 'Firebase 未設定';
            return false;
        }

        loading.value = true;
        error.value = null;

        try {
            const provider = new GoogleAuthProvider();
            await signInWithPopup(auth, provider);
            return true;
        } catch (e: any) {
            console.error('Google sign-in error:', e);
            error.value = e.message || '登入失敗';
            return false;
        } finally {
            loading.value = false;
        }
    }

    // 登出
    async function signOut(): Promise<boolean> {
        const auth = getFirebaseAuth();
        if (!auth) {
            error.value = 'Firebase 未設定';
            return false;
        }

        loading.value = true;
        error.value = null;

        try {
            await firebaseSignOut(auth);
            user.value = null;
            return true;
        } catch (e: any) {
            console.error('Sign-out error:', e);
            error.value = e.message || '登出失敗';
            return false;
        } finally {
            loading.value = false;
        }
    }

    // 清除錯誤
    function clearError() {
        error.value = null;
    }

    return {
        // State
        user,
        loading,
        error,
        initialized,
        // Getters
        isLoggedIn,
        isFirebaseEnabled,
        // Actions
        initAuth,
        signInWithGoogle,
        signOut,
        clearError,
    };
});
