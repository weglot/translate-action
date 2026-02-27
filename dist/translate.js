"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.translateStrings = translateStrings;
const constants_js_1 = require("./constants.js");
async function translateStrings(opts) {
    const { apiKey, lFrom, lTo, requestUrl, strings, version } = opts;
    if (strings.length === 0) {
        return [];
    }
    const words = strings.map(w => ({ t: 1, w, l: "weglot-translate-action" }));
    const slices = [];
    for (let start = 0; start < words.length; start += constants_js_1.API_MAX_LENGTH) {
        slices.push(words.slice(start, start + constants_js_1.API_MAX_LENGTH));
    }
    const allTranslated = [];
    for (const [s, slice] of slices.entries()) {
        const body = JSON.stringify({
            l_from: lFrom,
            l_to: lTo,
            request_url: requestUrl,
            words: slice,
        });
        const params = new URLSearchParams({
            api_key: apiKey,
            s: String(s),
            v: version,
        });
        const url = `${constants_js_1.API_BASE}/translate?${params.toString()}`;
        const res = await fetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Accept: "application/json",
            },
            body,
        });
        if (!res.ok) {
            const text = await res.text();
            if (res.status === 400) {
                throw new Error(`Weglot API error (400): Translations unavailable. ${text || "Check your plan and quota."}`);
            }
            if (res.status === 401 || res.status === 403) {
                throw new Error(`Weglot API error (${res.status}): Invalid API key or access denied.`);
            }
            throw new Error(`Weglot API error (${res.status}): ${text || res.statusText}`);
        }
        const json = (await res.json());
        const toWords = json.to_words;
        if (!Array.isArray(toWords)) {
            throw new Error("Weglot API response missing or invalid to_words");
        }
        allTranslated.push(...toWords);
    }
    return allTranslated;
}
