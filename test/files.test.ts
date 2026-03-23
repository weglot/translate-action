import path from "path";
import os from "os";
import { getOutputPath, resolveSourceFiles } from "../dist/files.js";

describe("getOutputPath", () => {
  const workspace = path.join(os.tmpdir(), "translate-action-test-workspace");

  it("replaces language in filename (en.json -> fr.json)", () => {
    const out = getOutputPath(
      "locales/en.json",
      "fr",
      "en",
      "",
      workspace
    );
    expect(out).toBe(path.join(workspace, "locales", "fr.json"));
  });

  it("replaces language in directory segment (locales/en/main.json -> locales/fr/main.json)", () => {
    const out = getOutputPath(
      "locales/en/main.json",
      "fr",
      "en",
      "",
      workspace
    );
    expect(out).toBe(path.join(workspace, "locales", "fr", "main.json"));
  });

  it("prepends output_dir when provided", () => {
    const out = getOutputPath(
      "locales/en/main.json",
      "fr",
      "en",
      "translated",
      workspace
    );
    expect(out).toBe(path.join(workspace, "translated", "locales", "fr", "main.json"));
  });

  it("appends target language to filename when source language does not appear in path or filename", () => {
    const out = getOutputPath(
      "locales/main.json",
      "fr",
      "en",
      "",
      workspace
    );
    expect(out).toBe(path.join(workspace, "locales", "main.fr.json"));
  });
});

describe("resolveSourceFiles", () => {
  const workspace = path.resolve(__dirname, "..");

  it("resolves a single file path (literal)", async () => {
    const files = await resolveSourceFiles(
      path.join("test", "fixtures", "locales", "en.json"),
      workspace
    );
    expect(files.length).toBe(1);
    expect(files[0]).toBe(path.join(workspace, "test", "fixtures", "locales", "en.json"));
  });

  it("resolves glob pattern and returns sorted paths", async () => {
    const files = await resolveSourceFiles(
      path.join("test", "fixtures", "**", "*.json"),
      workspace
    );
    expect(Array.isArray(files)).toBe(true);
    expect(files.length).toBeGreaterThanOrEqual(1);
    const sorted = [...files].sort();
    expect(files).toEqual(sorted);
  });
});
