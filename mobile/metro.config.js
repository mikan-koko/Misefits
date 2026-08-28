// eslint-disable-next-line @typescript-eslint/no-var-requires
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// assets/webapp/vendor/*.bin: ベンダーJSライブラリをMetroに「実行可能なJSソース」ではなく
// 「同梱アセット」として扱わせるための拡張子（require()でAsset.fromModule()に渡すため）。
// .html はMetroのデフォルトassetExtsに既に含まれている。
config.resolver.assetExts.push('bin');

module.exports = config;
