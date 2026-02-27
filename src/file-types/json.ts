import path from "path";
import fs from "fs/promises";

export function extractLeafStrings(
  obj: unknown,
  pathSegments: string[] = []
): { paths: string[][]; values: string[] } {
  const paths: string[][] = [];
  const values: string[] = [];

  if (obj === null || typeof obj !== "object") {
    return { paths, values };
  }

  const keys = Object.keys(obj as object).sort();
  for (const key of keys) {
    const value = (obj as Record<string, unknown>)[key];
    const keyPath = [...pathSegments, key];
    if (typeof value === "string") {
      paths.push(keyPath);
      values.push(value);
    } else if (
      value !== null &&
      typeof value === "object" &&
      !Array.isArray(value)
    ) {
      const child = extractLeafStrings(value, keyPath);
      paths.push(...child.paths);
      values.push(...child.values);
    }
  }

  return { paths, values };
}

function setAtPath(
  obj: Record<string, unknown>,
  pathSegments: string[],
  value: unknown
): void {
  let current: Record<string, unknown> = obj;
  for (const key of pathSegments.slice(0, -1)) {
    if (
      !(key in current) ||
      typeof current[key] !== "object" ||
      current[key] === null
    ) {
      current[key] = {};
    }
    current = current[key] as Record<string, unknown>;
  }
  current[pathSegments[pathSegments.length - 1]] = value;
}

export function applyTranslations(
  obj: Record<string, unknown>,
  paths: string[][],
  translatedValues: string[]
): Record<string, unknown> {
  const out = JSON.parse(JSON.stringify(obj)) as Record<string, unknown>;
  for (const [i, pathItem] of paths.entries()) {
    setAtPath(out, pathItem, translatedValues[i]);
  }
  return out;
}

export async function readJson(
  filePath: string
): Promise<Record<string, unknown>> {
  const content = await fs.readFile(filePath, "utf8");
  try {
    return JSON.parse(content) as Record<string, unknown>;
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    throw new Error(`Invalid JSON in ${filePath}: ${message}`);
  }
}

export async function writeJson(
  filePath: string,
  obj: Record<string, unknown>
): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(obj, null, 2) + "\n", "utf8");
}
