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
import { DataSource } from '@/datasource/source';
import { WebSource, YYYYGamesApiBase } from '@/datasource/web-source';
import {
    BetaXivApiRecipeSource,
    BetaXivapiBase,
} from '@/datasource/beta-xivapi-source';
import { isTauri, isWebsite } from '@/libs/Consts';

export type DataSourceID =
    | 'local'
    | 'yyyy.games'
    | 'yyyy.games-beta'
    | 'cafe'
    | 'xivapi';
export type DataSourceLangID = 'zh-CN' | 'zh-TW' | 'en' | 'de' | 'fr' | 'ja';

export const dataSourceList: Map<string, DataSourceLangID[]> = new Map([
    ['local', []],
    ['yyyy.games', ['zh-CN', 'zh-TW', 'en', 'de', 'fr', 'ja']],
    ['xivapi', ['en', 'de', 'fr', 'ja']],
]);
if (!isTauri) {
    dataSourceList.delete('local');
}

// 根據瀏覽器語言決定預設資料來源語言
function getDefaultDataSourceLang(): DataSourceLangID {
    const browserLang = navigator.language || 'zh-CN';
    if (browserLang.startsWith('zh-TW') || browserLang.startsWith('zh-Hant')) {
        return 'zh-TW';
    } else if (browserLang.startsWith('zh')) {
        return 'zh-CN';
    } else if (browserLang.startsWith('ja')) {
        return 'ja';
    } else if (browserLang.startsWith('en')) {
        return 'en';
    } else if (browserLang.startsWith('de')) {
        return 'de';
    } else if (browserLang.startsWith('fr')) {
        return 'fr';
    }
    // 預設為繁體中文
    return 'zh-TW';
}

export default defineStore('settings', {
    state: () => ({
        language: 'system',
        dataSource: dataSourceList.keys().next().value!,
        dataSourceLang: getDefaultDataSourceLang(),
    }),
    getters: {
        toJson(): string {
            return JSON.stringify({
                language: this.language,
                dataSource: this.dataSource,
                dataSourceLang: this.dataSourceLang,
            });
        },
        getDataSource(): () => Promise<DataSource> {
            const dataSourceLanguageList =
                dataSourceList.get(this.dataSource) ??
                dataSourceList.values().next().value!;
            // Check language setting valid
            let dataSourceLanguage = this.dataSourceLang;
            if (dataSourceLanguageList.length > 0) {
                if (
                    dataSourceLanguage == undefined ||
                    !dataSourceLanguageList.includes(dataSourceLanguage)
                ) {
                    dataSourceLanguage = dataSourceLanguageList[0];
                }
            }
            let dataSources: Record<string, () => Promise<DataSource>> = {
                'yyyy.games': async () => {
                    return new WebSource(YYYYGamesApiBase, dataSourceLanguage!);
                },
                xivapi: async () => {
                    return new BetaXivApiRecipeSource(
                        BetaXivapiBase,
                        <'en' | 'ja' | 'de' | 'fr'>dataSourceLanguage,
                    );
                },
            };
            let defaultSource = dataSources['yyyy.games'];
            if (isTauri) {
                let localSource = async () => {
                    let { LocalRecipeSource } = await import(
                        '../datasource/local-source'
                    );
                    return new LocalRecipeSource();
                };
                dataSources['local'] = localSource;
                defaultSource = localSource;
            }
            return dataSources[this.dataSource] ?? defaultSource;
        },
    },
    actions: {
        loadSettings(localSettings: any) {
            this.$patch(localSettings);
            let allowedLangs = dataSourceList.get(this.dataSource);
            if (allowedLangs == undefined) {
                const [defaultSource, langs] = dataSourceList
                    .entries()
                    .next().value!;
                this.dataSource = <DataSourceID>defaultSource;
                allowedLangs = langs;
            }
            if (
                this.dataSourceLang == undefined ||
                allowedLangs.indexOf(this.dataSourceLang) == -1
            ) {
                this.dataSourceLang =
                    allowedLangs.find(
                        lang =>
                            lang != undefined && this.language.startsWith(lang),
                    ) ?? allowedLangs[0];
            }
            if (localSettings.dataSourceLang)
                this.dataSourceLang = localSettings.dataSourceLang;
            else {
                if (this.language.startsWith('en')) {
                    this.dataSourceLang = 'en';
                } else if (this.language.startsWith('ja')) {
                    this.dataSourceLang = 'ja';
                } else if (this.language.startsWith('zh-TW') || this.language.startsWith('zh-Hant')) {
                    this.dataSourceLang = 'zh-TW';
                } else if (this.language.startsWith('zh')) {
                    this.dataSourceLang = 'zh-CN';
                }
            }
        },
        fromJson(json: string) {
            this.$patch(JSON.parse(json));
            if (
                this.dataSource !== 'xivapi' &&
                this.dataSource !== 'yyyy.games-beta' &&
                (isWebsite || this.dataSource !== 'local')
            ) {
                this.dataSource = 'yyyy.games';
            }
            if (String(this.dataSourceLang) == 'zh') {
                this.dataSourceLang = 'zh-CN';
            }
        },
    },
});
