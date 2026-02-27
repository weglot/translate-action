import {
  extractLeafStrings,
  applyTranslations,
  readJson,
  writeJson,
} from "../../dist/file-types/json.js";
import path from "path";
import os from "os";
import fs from "fs/promises";

describe("extractLeafStrings", () => {
  it("returns empty paths and values for null or non-object", () => {
    expect(extractLeafStrings(null)).toEqual({ paths: [], values: [] });
    expect(extractLeafStrings(42)).toEqual({ paths: [], values: [] });
    expect(extractLeafStrings("hello")).toEqual({ paths: [], values: [] });
  });

  it("extracts leaf strings in deterministic (sorted) order", () => {
    const obj = {
      hello: "Hello",
      welcome: "Welcome to our app",
      nested: {
        title: "Settings",
        description: "Configure your preferences",
      },
    };
    const { paths, values } = extractLeafStrings(obj);
    expect(paths).toEqual([
      ["hello"],
      ["nested", "description"],
      ["nested", "title"],
      ["welcome"],
    ]);
    expect(values).toEqual([
      "Hello",
      "Configure your preferences",
      "Settings",
      "Welcome to our app",
    ]);
  });
});

describe("applyTranslations", () => {
  it("builds new object with translated values at same paths", () => {
    const obj: Record<string, unknown> = {
      hello: "Hello",
      nested: { title: "Settings" },
    };
    const paths = [["hello"], ["nested", "title"]];
    const translated = ["Bonjour", "Paramètres"];
    const result = applyTranslations(obj, paths, translated);
    expect(result).toEqual({
      hello: "Bonjour",
      nested: { title: "Paramètres" },
    });
    expect(obj).toEqual({ hello: "Hello", nested: { title: "Settings" } });
  });

  it("round-trip: extract then apply mock translations preserves structure", () => {
    const obj: Record<string, unknown> = {
      hello: "Hello",
      welcome: "Welcome to our app",
      nested: {
        title: "Settings",
        description: "Configure your preferences",
      },
    };
    const { paths, values } = extractLeafStrings(obj);
    const mockTranslated = values.map((v: string) => `[FR] ${v}`);
    const translatedObj = applyTranslations(obj, paths, mockTranslated);
    expect(translatedObj).toEqual({
      hello: "[FR] Hello",
      welcome: "[FR] Welcome to our app",
      nested: {
        title: "[FR] Settings",
        description: "[FR] Configure your preferences",
      },
    });
  });
});

describe("readJson", () => {
  it("parses valid JSON file", async () => {
    const obj = await readJson(
      path.join(__dirname, "..", "fixtures", "locales", "en.json")
    );
    expect(obj).toHaveProperty("hello", "Hello");
    expect(obj).toHaveProperty("nested");
  });

  it("throws on invalid JSON", async () => {
    const tmpDir = path.join(os.tmpdir(), "translate-action-json-test");
    const badPath = path.join(tmpDir, "bad.json");
    await fs.mkdir(tmpDir, { recursive: true });
    await fs.writeFile(badPath, "not json {", "utf8");
    await expect(readJson(badPath)).rejects.toThrow(/Invalid JSON/);
    await fs.rm(tmpDir, { recursive: true, force: true });
  });
});

describe("writeJson", () => {
  it("writes formatted JSON and creates directory", async () => {
    const tmpDir = path.join(os.tmpdir(), "translate-action-write-test");
    const outPath = path.join(tmpDir, "sub", "out.json");
    const obj = { key: "value" };
    await writeJson(outPath, obj);
    const content = await fs.readFile(outPath, "utf8");
    expect(JSON.parse(content)).toEqual(obj);
    await fs.rm(tmpDir, { recursive: true, force: true });
  });
});
