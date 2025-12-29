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

import { initializeApp, type FirebaseApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';
import { getFirestore, type Firestore } from 'firebase/firestore';

// Firebase 設定
// 注意：這些設定需要在 Firebase Console 中建立專案後取得
// 請將以下設定替換為您自己的 Firebase 專案設定
const firebaseConfig = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY || '',
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || '',
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || '',
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || '',
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '',
    appId: import.meta.env.VITE_FIREBASE_APP_ID || '',
};

let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let db: Firestore | null = null;

// 檢查 Firebase 設定是否有效
export function isFirebaseConfigured(): boolean {
    return !!(
        firebaseConfig.apiKey &&
        firebaseConfig.authDomain &&
        firebaseConfig.projectId
    );
}

// 初始化 Firebase（延遲載入）
export function initializeFirebase(): FirebaseApp | null {
    if (!isFirebaseConfigured()) {
        console.warn('Firebase is not configured. Cloud sync features will be disabled.');
        return null;
    }

    if (!app) {
        app = initializeApp(firebaseConfig);
    }
    return app;
}

// 取得 Auth 實例
export function getFirebaseAuth(): Auth | null {
    if (!isFirebaseConfigured()) return null;
    
    if (!auth) {
        const firebaseApp = initializeFirebase();
        if (firebaseApp) {
            auth = getAuth(firebaseApp);
        }
    }
    return auth;
}

// 取得 Firestore 實例
export function getFirebaseFirestore(): Firestore | null {
    if (!isFirebaseConfigured()) return null;
    
    if (!db) {
        const firebaseApp = initializeFirebase();
        if (firebaseApp) {
            db = getFirestore(firebaseApp);
        }
    }
    return db;
}
