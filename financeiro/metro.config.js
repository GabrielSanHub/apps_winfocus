// financeiro/metro.config.js
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Adiciona 'wasm' como uma extensão de asset (arquivo estático)
config.resolver.assetExts.push('wasm');

module.exports = config;