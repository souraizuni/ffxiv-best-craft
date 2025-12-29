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
import { ref, onActivated, onMounted } from 'vue';
import {
    ElScrollbar,
    ElForm,
    ElFormItem,
    ElSelect,
    ElOption,
    ElButton,
    ElLink,
    ElRadioGroup,
    ElRadioButton,
    ElDialog,
    ElText,
    ElDivider,
    ElAvatar,
    ElAlert,
    ElCard,
} from 'element-plus';
import { useFluent } from 'fluent-vue';
import useSettingsStore, { dataSourceList } from '@/stores/settings';
import { useAuthStore } from '@/stores/auth';
import { useCloudSyncStore } from '@/stores/cloud-sync';
import { languages } from '../lang';
import { useColorMode } from '@vueuse/core';
import { isTauri, isWebsite, isYYYYGames } from '@/libs/Consts';
import { openUrl } from '@/libs/Utils';
import SupportUs from '@/components/SupportUs.vue';
import E1 from '@/eastereggs/e1';

const emit = defineEmits<{
    (e: 'setTitle', title: string): void;
}>();
onActivated(() => emit('setTitle', 'settings'));

const { $t } = useFluent();
const store = useSettingsStore();
const authStore = useAuthStore();
const cloudSyncStore = useCloudSyncStore();
const colorMode = useColorMode().store;

// 初始化認證
onMounted(() => {
    authStore.initAuth();
    cloudSyncStore.setupAutoSync();
});

const appName = ref('BestCraft');
const version = ref('');
const tauriVersion = ref('');
var checkingUpdate = ref(false);
var onCheckUpdateClick = async () => {};
const licenseDialogVisible = ref(false);
const switchLinesDialogVisible = ref(false);

if (isTauri) {
    import('@tauri-apps/api/app').then(
        ({ getName, getVersion, getTauriVersion }) => {
            getName().then(n => (appName.value = n));
            getVersion().then(v => (version.value = v));
            getTauriVersion().then(t => (tauriVersion.value = t));
        },
    );
    onCheckUpdateClick = async () => {
        let { checkUpdate } = await import('../update');
        checkingUpdate.value = true;
        await checkUpdate($t, false);
        checkingUpdate.value = false;
    };
}

/// Fix language setting when datasource changed
function fixDataSourceLanguage() {
    const dsLangAllowedList = dataSourceList.get(store.dataSource);
    const dsLang = store.dataSourceLang;
    if (
        dsLangAllowedList &&
        dsLangAllowedList.length > 0 &&
        dsLangAllowedList.find(v => v == dsLang) == undefined
    ) {
        store.dataSourceLang = dsLangAllowedList[0];
    }
}

// Google 登入
async function handleGoogleSignIn() {
    await authStore.signInWithGoogle();
}

// 登出
async function handleSignOut() {
    await authStore.signOut();
}

// 上傳到雲端
async function handleUploadToCloud() {
    await cloudSyncStore.uploadToCloud();
}

// 從雲端下載
async function handleDownloadFromCloud() {
    await cloudSyncStore.downloadFromCloud();
}
</script>

<template>
    <el-scrollbar>
        <el-form class="setting-page" label-width="120px">
            <!-- 雲端同步區塊 -->
            <el-card class="cloud-sync-card" v-if="authStore.isFirebaseEnabled">
                <template #header>
                    <span>{{ $t('cloud-sync') }}</span>
                </template>
                
                <!-- 錯誤提示 -->
                <el-alert
                    v-if="authStore.error"
                    :title="authStore.error"
                    type="error"
                    show-icon
                    :closable="true"
                    @close="authStore.clearError()"
                    style="margin-bottom: 15px;"
                />
                <el-alert
                    v-if="cloudSyncStore.syncStatus.error"
                    :title="cloudSyncStore.syncStatus.error"
                    type="error"
                    show-icon
                    :closable="true"
                    @close="cloudSyncStore.clearError()"
                    style="margin-bottom: 15px;"
                />

                <!-- 未登入狀態 -->
                <div v-if="!authStore.isLoggedIn" class="login-section">
                    <el-text type="info">{{ $t('login-hint') }}</el-text>
                    <el-button
                        type="primary"
                        @click="handleGoogleSignIn"
                        :loading="authStore.loading"
                        style="margin-top: 10px;"
                    >
                        {{ $t('sign-in-with-google') }}
                    </el-button>
                </div>

                <!-- 已登入狀態 -->
                <div v-else class="user-section">
                    <div class="user-info">
                        <el-avatar
                            :src="authStore.user?.photoURL || undefined"
                            :size="48"
                        />
                        <div class="user-details">
                            <el-text tag="b">{{ authStore.user?.displayName }}</el-text>
                            <el-text type="info" size="small">{{ authStore.user?.email }}</el-text>
                        </div>
                    </div>
                    
                    <el-divider />
                    
                    <div class="sync-actions">
                        <el-button
                            type="primary"
                            @click="handleUploadToCloud"
                            :loading="cloudSyncStore.syncStatus.syncing"
                        >
                            {{ $t('upload-to-cloud') }}
                        </el-button>
                        <el-button
                            @click="handleDownloadFromCloud"
                            :loading="cloudSyncStore.syncStatus.syncing"
                        >
                            {{ $t('download-from-cloud') }}
                        </el-button>
                    </div>
                    
                    <el-text
                        v-if="cloudSyncStore.syncStatus.lastSyncTime"
                        type="info"
                        size="small"
                        style="margin-top: 10px; display: block;"
                    >
                        {{ $t('last-sync') }}: {{ cloudSyncStore.syncStatus.lastSyncTime.toLocaleString() }}
                    </el-text>
                    
                    <el-divider />
                    
                    <el-button
                        type="danger"
                        plain
                        @click="handleSignOut"
                        :loading="authStore.loading"
                    >
                        {{ $t('sign-out') }}
                    </el-button>
                </div>
            </el-card>

            <el-divider v-if="authStore.isFirebaseEnabled" />

            <el-form-item :label="$t('language')">
                <el-select v-model="store.language">
                    <el-option :label="$t('system-lang')" value="system" />
                    <el-option
                        v-for="[v, name] in languages"
                        :label="name"
                        :value="v"
                    />
                </el-select>
            </el-form-item>
            <el-form-item :label="$t('theme')">
                <el-radio-group v-model="colorMode">
                    <el-radio-button value="light">
                        {{ $t('light') }}
                    </el-radio-button>
                    <el-radio-button value="dark">
                        {{ $t('dark') }}
                    </el-radio-button>
                    <el-radio-button value="auto">
                        {{ $t('auto') }}
                    </el-radio-button>
                </el-radio-group>
            </el-form-item>
            <el-form-item :label="$t('data-source')">
                <el-select
                    v-model="store.dataSource"
                    @change="fixDataSourceLanguage"
                >
                    <el-option
                        v-for="dataSource in dataSourceList"
                        :label="$t(`ds-${dataSource[0].replace('.', '')}`)"
                        :value="dataSource[0]"
                    >
                        <span style="float: left">
                            {{ $t(`ds-${dataSource[0].replace('.', '')}`) }}
                        </span>
                        <span class="data-source-option-note">
                            {{
                                $t(`ds-${dataSource[0].replace('.', '')}-desc`)
                            }}
                        </span>
                    </el-option>
                </el-select>
            </el-form-item>
            <!-- Data source languages -->
            <el-form-item
                v-if="(dataSourceList.get(store.dataSource)?.length ?? 0) > 1"
            >
                <el-select v-model="store.dataSourceLang">
                    <el-option
                        v-for="lang in dataSourceList.get(store.dataSource)"
                        :label="$t(`dslang-${lang}`)"
                        :value="lang!"
                    >
                        <span style="float: left">
                            {{ $t(`dslang-${lang}`) }}
                        </span>
                    </el-option>
                </el-select>
            </el-form-item>
            <el-form-item v-if="isWebsite" :label="$t('switch-lines')">
                <el-button @click="switchLinesDialogVisible = true">
                    {{ $t('detail') }}
                </el-button>
                <el-dialog
                    v-model="switchLinesDialogVisible"
                    :title="$t('switch-lines')"
                >
                    <p>
                        BestCraft
                        是开源软件，可以在多个不同的服务器上部署，以下是目前已知的部署了本软件的网站：
                    </p>
                    <p>
                        <el-link href="https://tnze.yyyy.games/" type="primary">
                            YYYY.GAMES
                        </el-link>
                        <el-text size="small" type="info">
                            由 <span>瑤瑤瑤影@神意之地</span> 运营
                        </el-text>
                    </p>
                    <p>
                        <el-link
                            href="https://bestcraft.nbb.fan/"
                            type="primary"
                        >
                            NBB.FAN
                        </el-link>
                        <el-text size="small" type="info">
                            由 <span>N.B.B</span> 运营
                        </el-text>
                    </p>
                    <p>
                        <el-link
                            href="https://ffxiv-best-craft.pages.dev/"
                            type="primary"
                        >
                            Cloudflare Pages
                        </el-link>
                        <el-text size="small" type="info">
                            由 <span>Tnze</span> 随意地设置在 Cloudflare
                            上，不适合国内访问
                        </el-text>
                    </p>
                </el-dialog>
            </el-form-item>
            <template v-if="isTauri">
                <el-form-item :label="$t('version-number')">
                    {{ version }}
                </el-form-item>
                <el-form-item :label="$t('tauri')">
                    {{ tauriVersion }}
                </el-form-item>
                <el-form-item>
                    <el-button
                        type="primary"
                        @click="onCheckUpdateClick"
                        :loading="checkingUpdate"
                    >
                        {{
                            checkingUpdate
                                ? $t('checking-update')
                                : $t('check-update')
                        }}
                    </el-button>
                </el-form-item>
            </template>
            <el-form-item :label="$t('developer')">
                {{ E1.c() ? E1.t3 : 'Tnze' }}
            </el-form-item>
            <el-form-item :label="$t('source')">
                <el-link
                    @click="openUrl('https://gitee.com/Tnze/ffxiv-best-craft')"
                >
                    Gitee
                </el-link>
                <el-link
                    @click="openUrl('https://github.com/Tnze/ffxiv-best-craft')"
                >
                    Github
                </el-link>
            </el-form-item>
            <el-form-item :label="$t('license')">
                <el-button @click="licenseDialogVisible = true">AGPL</el-button>
                <el-dialog
                    class="licenses-dialog"
                    v-model="licenseDialogVisible"
                    :title="$t('license')"
                    width="50%"
                >
                    <p>{{ $t('licenses-notices-1') }}</p>
                    <p>{{ $t('licenses-notices-2') }}</p>
                    <p>{{ $t('licenses-notices-3') }}</p>
                </el-dialog>
            </el-form-item>
            <el-form-item v-if="isYYYYGames" :label="$t('donate')">
                <SupportUs />
            </el-form-item>
        </el-form>
    </el-scrollbar>
</template>

<style scoped>
.setting-page {
    margin-top: 20px;
    background-color: transparent !important;
}

.el-link {
    margin-right: 8px;
}

.el-select {
    width: 210px;
}

.data-source-option-note {
    float: right;
    color: var(--el-text-color-secondary);
    font-size: 13px;
}

.cloud-sync-card {
    margin: 0 20px 20px 20px;
}

.login-section {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 20px;
}

.user-section {
    padding: 10px;
}

.user-info {
    display: flex;
    align-items: center;
    gap: 15px;
}

.user-details {
    display: flex;
    flex-direction: column;
    gap: 4px;
}

.sync-actions {
    display: flex;
    gap: 10px;
    flex-wrap: wrap;
}
</style>

<fluent locale="zh-CN">
# language =
theme = 主题
light = 亮
dark = 暗
auto = 自动

data-source = 数据源
ds-local = 本地
# ds-yyyygames = 
ds-xivapi = Xivapi
ds-local-desc = 国服数据
ds-yyyygames-desc = 混合
ds-xivapi-desc = 国际服数据
switch-lines = 切换线路
dslang-zh-CN = 简体中文
dslang-zh-TW = 繁体中文
dslang-en = 英语
dslang-ja = 日语
dslang-de = 德语
dslang-fr = 法语
system-lang = 跟随系统
version-number = 版本号
tauri = Tauri
developer = 作者
feedback = 反馈 / 聊天
license = 许可
source = 源代码
donate = 捐赠
detail = 详情

check-update = 检查更新
checking-update = 正在检查更新

cloud-sync = 云端同步
login-hint = 登录 Google 账号以同步您的设置和数据
sign-in-with-google = 使用 Google 登录
sign-out = 登出
upload-to-cloud = 上传到云端
download-from-cloud = 从云端下载
last-sync = 上次同步
</fluent>

<fluent locale="zh-TW">
# language =
theme = 主題
light = 亮
dark = 暗
auto = 自動

data-source = 資料來源
ds-local = 本地
# ds-yyyygames = 
ds-xivapi = Xivapi
ds-local-desc = 國服資料
ds-yyyygames-desc = 混合
ds-xivapi-desc = 國際服資料
switch-lines = 切換線路
dslang-zh-CN = 簡體中文
dslang-zh-TW = 繁體中文
dslang-en = 英語
dslang-ja = 日語
dslang-de = 德語
dslang-fr = 法語
system-lang = 跟隨系統
version-number = 版本號
tauri = Tauri
developer = 作者
feedback = 反饋 / 聊天
license = 許可
source = 原始碼
donate = 捐贈
detail = 詳情

check-update = 檢查更新
checking-update = 正在檢查更新

cloud-sync = 雲端同步
login-hint = 登入 Google 帳號以同步您的設定和資料
sign-in-with-google = 使用 Google 登入
sign-out = 登出
upload-to-cloud = 上傳到雲端
download-from-cloud = 從雲端下載
last-sync = 上次同步
</fluent>

<fluent locale="en-US">
language = Language
theme = Theme
light = Light
dark = Dark
auto = Auto
data-source = Data Source
ds-local = Local
ds-yyyygames = YYYY.GAMES
ds-xivapi = Xivapi
ds-local-desc = Chinese
ds-yyyygames-desc = Mixed
ds-xivapi-desc = Latest
switch-lines = Switch Lines
dslang-zh-CN = Simplified Chinese
dslang-zh-TW = Traditional Chinese
dslang-en = English
dslang-ja = Japanese
dslang-de = German
dslang-fr = French
system-lang = System
version-number = Version
tauri = Tauri
developer = Author
feedback = Feedback
license = License
source = Source
donate = Donate
detail = Detail

check-update = Check Update
checking-update = Checking Update

cloud-sync = Cloud Sync
login-hint = Sign in with Google to sync your settings and data
sign-in-with-google = Sign in with Google
sign-out = Sign Out
upload-to-cloud = Upload to Cloud
download-from-cloud = Download from Cloud
last-sync = Last Sync
</fluent>

<fluent locale="ja-JP">
# language =
data-source = データソース
ds-local = ローカル
# ds-xivapi =
# ds-cafe =
switch-lines = サーバの切り替え
dslang-zh-CN = 簡体字中国語
dslang-zh-TW = 繁体字中国語
dslang-en = 英語
dslang-ja = 日本語
dslang-de = ドイツ語
dslang-fr = フランス語
version-number = バージョン
tauri = Tauri
developer = 作者
feedback = フィードバック
license = ライセンス
source = ソースコード
donate = 寄付する
detail = 詳細

check-update = 更新のチェック
checking-update = 更新をチェックしています

cloud-sync = クラウド同期
login-hint = Google アカウントでログインして設定とデータを同期します
sign-in-with-google = Google でログイン
sign-out = ログアウト
upload-to-cloud = クラウドにアップロード
download-from-cloud = クラウドからダウンロード
last-sync = 最終同期
</fluent>
