const SETTINGS_BASE = "https://api.weglot.com";

export interface WeglotSettings {
  language_from: string;
  api_base_url: string;
  product: string;
  languages: Array<{ language_to: string; enabled: boolean }>;
}

export async function fetchProjectSettings(
  apiKey: string
): Promise<WeglotSettings> {
  const params = new URLSearchParams({ api_key: apiKey });
  const url = `${SETTINGS_BASE}/project-settings?${params.toString()}`;

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

  const settings = (await res.json()) as WeglotSettings;

  if (settings.product !== "2.0") {
    throw new Error(
      `This action requires a Weglot v2 project (product "2.0"), but got "${settings.product ?? "unknown"}". Please use a Weglot v2 API key.`
    );
  }

  return settings;
}
