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
    let replacedSourceLang = false;
    const newSegments = segments.map(seg => {
        if (seg === sourceLang) {
            replacedSourceLang = true;
            return targetLang;
        }
        const base = path_1.default.basename(seg, path_1.default.extname(seg));
        if (base === sourceLang) {
            replacedSourceLang = true;
            return targetLang + path_1.default.extname(seg);
        }
        return seg;
    });
    if (!replacedSourceLang && newSegments.length > 0) {
        const lastSegment = newSegments[newSegments.length - 1];
        const extension = path_1.default.extname(lastSegment);
        const baseName = path_1.default.basename(lastSegment, extension);
        newSegments[newSegments.length - 1] =
            `${baseName}.${targetLang}${extension}`;
    }
    const newRelative = newSegments.join(path_1.default.sep);
    const base = outputDir ? path_1.default.join(workspace, outputDir) : workspace;
    return path_1.default.join(base, newRelative);
}
