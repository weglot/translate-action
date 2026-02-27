import { CDN_BASE } from "./constants.js";

export type WeglotSettings = Record<string, unknown>;

export async function fetchProjectSettings(
  apiKey: string
): Promise<WeglotSettings> {
  const settingsKey = apiKey.startsWith("wg_") ? apiKey.slice(3) : apiKey;
  const url = `${CDN_BASE}/projects-settings/${settingsKey}.json`;

  const res = await fetch(url, {
    method: "GET",
    headers: { Accept: "application/json" },
  });

  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      throw new Error(
        `Invalid Weglot API key or access denied (${res.status}). Check that your API key is correct.`
      );
    }
    if (res.status === 404) {
      throw new Error(
        `Weglot project not found (404). Check that the API key is valid and the project exists.`
      );
    }
    throw new Error(
      `Failed to fetch Weglot project settings: ${res.status} ${res.statusText}`
    );
  }

  const data = (await res.json()) as Record<string, unknown>;
  const settings: WeglotSettings = (data.settings ?? data) as Record<
    string,
    unknown
  >;

  return settings;
}
