"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getConfig = getConfig;
function getConfig(env = 'production') {
    const isDev = env === 'dev';
    return {
        apiBase: isDev ? 'https://api.weglot.dev' : 'https://api.weglot.com',
        cdnBase: isDev ? 'https://cdn.weglot.dev' : 'https://cdn.weglot.com',
    };
}
