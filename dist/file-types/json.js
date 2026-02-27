"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractLeafStrings = extractLeafStrings;
exports.applyTranslations = applyTranslations;
exports.readJson = readJson;
exports.writeJson = writeJson;
const path_1 = __importDefault(require("path"));
const promises_1 = __importDefault(require("fs/promises"));
function extractLeafStrings(obj, pathSegments = []) {
    const paths = [];
    const values = [];
    if (obj === null || typeof obj !== "object") {
        return { paths, values };
    }
    const keys = Object.keys(obj).sort();
    for (const key of keys) {
        const value = obj[key];
        const keyPath = [...pathSegments, key];
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
function setAtPath(obj, pathSegments, value) {
    let current = obj;
    for (const key of pathSegments.slice(0, -1)) {
        if (!(key in current) ||
            typeof current[key] !== "object" ||
            current[key] === null) {
            current[key] = {};
        }
        current = current[key];
    }
    current[pathSegments[pathSegments.length - 1]] = value;
}
function applyTranslations(obj, paths, translatedValues) {
    const out = JSON.parse(JSON.stringify(obj));
    for (const [i, pathItem] of paths.entries()) {
        setAtPath(out, pathItem, translatedValues[i]);
    }
    return out;
}
async function readJson(filePath) {
    const content = await promises_1.default.readFile(filePath, "utf8");
    try {
        return JSON.parse(content);
    }
    catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        throw new Error(`Invalid JSON in ${filePath}: ${message}`);
    }
}
async function writeJson(filePath, obj) {
    await promises_1.default.mkdir(path_1.default.dirname(filePath), { recursive: true });
    await promises_1.default.writeFile(filePath, JSON.stringify(obj, null, 2) + "\n", "utf8");
}
