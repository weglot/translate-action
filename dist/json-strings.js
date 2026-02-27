"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractLeafStrings = extractLeafStrings;
exports.setAtPath = setAtPath;
exports.applyTranslations = applyTranslations;
function extractLeafStrings(obj, path = []) {
    const paths = [];
    const values = [];
    if (obj === null || typeof obj !== "object") {
        return { paths, values };
    }
    const keys = Object.keys(obj).sort();
    for (const key of keys) {
        const value = obj[key];
        const keyPath = [...path, key];
        if (typeof value === "string") {
            paths.push(keyPath);
            values.push(value);
        }
        else if (value !== null &&
            typeof value === "object" &&
            !Array.isArray(value)) {
            const child = extractLeafStrings(value, keyPath);
            paths.push(...child.paths);
            values.push(...child.values);
        }
    }
    return { paths, values };
}
function setAtPath(obj, path, value) {
    let current = obj;
    for (const key of path.slice(0, -1)) {
        if (!(key in current) ||
            typeof current[key] !== "object" ||
            current[key] === null) {
            current[key] = {};
        }
        current = current[key];
    }
    current[path[path.length - 1]] = value;
}
function applyTranslations(obj, paths, translatedValues) {
    const out = JSON.parse(JSON.stringify(obj));
    for (const [i, pathItem] of paths.entries()) {
        setAtPath(out, pathItem, translatedValues[i]);
    }
    return out;
}
