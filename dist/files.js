"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveSourceFiles = resolveSourceFiles;
exports.getOutputPath = getOutputPath;
const path_1 = __importDefault(require("path"));
const glob_1 = require("glob");
async function resolveSourceFiles(sourcePath, workspace) {
    const pattern = path_1.default.isAbsolute(sourcePath)
        ? sourcePath
        : path_1.default.join(workspace, sourcePath);
    const files = await (0, glob_1.glob)(pattern, { nodir: true, absolute: true });
    return files.sort();
}
function getOutputPath(sourceRelativePath, targetLang, sourceLang, outputDir, workspace) {
    const segments = sourceRelativePath.split(path_1.default.sep);
    const newSegments = segments.map(seg => {
        if (seg === sourceLang) {
            return targetLang;
        }
        const base = path_1.default.basename(seg, path_1.default.extname(seg));
        if (base === sourceLang) {
            return targetLang + path_1.default.extname(seg);
        }
        return seg;
    });
    const unchanged = newSegments.length === segments.length &&
        newSegments.every((seg, i) => seg === segments[i]);
    let finalSegments = newSegments;
    if (unchanged) {
        if (finalSegments.length === 0) {
            finalSegments = [`${targetLang}`];
        }
        else {
            const last = finalSegments[finalSegments.length - 1];
            const ext = path_1.default.extname(last);
            const base = path_1.default.basename(last, ext);
            finalSegments = [
                ...finalSegments.slice(0, -1),
                `${base}-${targetLang}${ext}`,
            ];
        }
    }
    const newRelative = finalSegments.join(path_1.default.sep);
    const base = outputDir ? path_1.default.join(workspace, outputDir) : workspace;
    return path_1.default.join(base, newRelative);
}
