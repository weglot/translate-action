"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const core = __importStar(require("@actions/core"));
const github = __importStar(require("@actions/github"));
const path_1 = __importDefault(require("path"));
const settings_js_1 = require("./settings.js");
const translate_js_1 = require("./translate.js");
const json_js_1 = require("./file-types/json.js");
const files_js_1 = require("./files.js");
function filterLanguages(languagesInput, configuredLanguages) {
    return languagesInput
        .split(",")
        .map(l => l.trim())
        .filter(code => {
        const ok = !!configuredLanguages.find(l => l.custom_code === code || l.language_to === code);
        if (ok) {
            return true;
        }
        core.warning(`Language "${code}" is not configured in your Weglot project; skipping.`);
        return false;
    });
}
async function main() {
    try {
        const apiKey = core.getInput("api-key", { required: true }).trim();
        if (!apiKey) {
            core.setFailed("api-key is required");
            return;
        }
        const sourcePath = core.getInput("source-path", { required: true }).trim();
        const outputDir = core.getInput("output-dir", { required: false }).trim();
        const outputMode = (core.getInput("output-mode", { required: false }) || "files").toLowerCase();
        const languagesInput = core
            .getInput("languages", { required: false })
            .trim();
        const prBranch = core.getInput("pr-branch", { required: false }).trim();
        const workspace = process.env.GITHUB_WORKSPACE || process.cwd();
        core.info("Fetching Weglot project settings...");
        const settings = await (0, settings_js_1.fetchProjectSettings)(apiKey);
        const language_from = settings.language_from;
        const versions = settings.versions;
        const version = versions?.translations != null ? String(versions.translations) : "1";
        const languagesFromSettings = (settings.languages ?? []);
        const targetLanguages = languagesInput
            ? filterLanguages(languagesInput, languagesFromSettings)
            : languagesFromSettings.map(l => l.custom_code ?? l.language_to);
        if (targetLanguages.length === 0) {
            core.setFailed("No target languages to translate.");
            return;
        }
        core.info(`Source language: ${language_from}. Target languages: ${targetLanguages.join(", ")}`);
        const sourceFiles = await (0, files_js_1.resolveSourceFiles)(sourcePath, workspace);
        if (sourceFiles.length === 0) {
            core.setFailed(`No files matched: ${sourcePath}`);
            return;
        }
        core.info(`Found ${sourceFiles.length} source file(s).`);
        const requestUrl = process.env.GITHUB_SERVER_URL && process.env.GITHUB_REPOSITORY
            ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}`
            : "https://github.com";
        const writtenPaths = [];
        for (const sourceFilePath of sourceFiles) {
            const relativePath = path_1.default.relative(workspace, sourceFilePath);
            if (!relativePath.endsWith(".json")) {
                core.warning(`Skipping non-JSON file: ${relativePath}`);
                continue;
            }
            const obj = await (0, json_js_1.readJson)(sourceFilePath);
            const { paths, values } = (0, json_js_1.extractLeafStrings)(obj);
            if (values.length === 0) {
                core.info(`No strings to translate in ${relativePath}`);
                continue;
            }
            for (const lTo of targetLanguages) {
                core.info(`Translating ${relativePath} -> ${lTo}...`);
                const translated = await (0, translate_js_1.translateStrings)({
                    apiKey,
                    lFrom: language_from,
                    lTo,
                    requestUrl,
                    strings: values,
                    version,
                });
                const translatedObj = (0, json_js_1.applyTranslations)(obj, paths, translated);
                const outPath = (0, files_js_1.getOutputPath)(relativePath, lTo, language_from, outputDir, workspace);
                await (0, json_js_1.writeJson)(outPath, translatedObj);
                writtenPaths.push(outPath);
            }
        }
        if (writtenPaths.length === 0) {
            core.setFailed("No translated files were written.");
            return;
        }
        const outputBase = outputDir ? path_1.default.join(workspace, outputDir) : workspace;
        core.setOutput("output-path", outputBase);
        if (outputMode === "pr") {
            await createPullRequest(workspace, writtenPaths, prBranch);
        }
    }
    catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        core.setFailed(message);
    }
}
async function createPullRequest(workspace, writtenPaths, prBranchInput) {
    const exec = (await Promise.resolve().then(() => __importStar(require("@actions/exec")))).exec;
    const octokit = github.getOctokit(process.env.GITHUB_TOKEN);
    const branchName = prBranchInput || `weglot-translations-${Date.now()}`;
    await exec("git", ["config", "user.name", "github-actions[bot]"], {
        cwd: workspace,
    });
    await exec("git", ["config", "user.email", "github-actions[bot]@users.noreply.github.com"], {
        cwd: workspace,
    });
    await exec("git", ["checkout", "-b", branchName], { cwd: workspace });
    for (const p of writtenPaths) {
        const relative = path_1.default.relative(workspace, p);
        await exec("git", ["add", relative], { cwd: workspace });
    }
    await exec("git", ["commit", "-m", "Add Weglot translated localization files"], {
        cwd: workspace,
    });
    await exec("git", ["push", "-u", "origin", branchName], { cwd: workspace });
    const { owner, repo } = github.context.repo;
    const defaultBranch = github.context.payload.repository?.default_branch ?? "main";
    const pr = await octokit.rest.pulls.create({
        base: defaultBranch,
        body: "This PR was created by the Weglot Translate Action with the latest translations.",
        head: branchName,
        owner,
        repo,
        title: "Add Weglot translated localization files",
    });
    core.setOutput("pr-url", pr.data.html_url);
    core.info(`Pull request created: ${pr.data.html_url}`);
}
main();
