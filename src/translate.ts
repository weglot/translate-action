import { API_MAX_LENGTH, POLL_INTERVAL_MS } from "./constants.js";

export interface TranslateOptions {
  apiKey: string;
  apiBaseUrl: string;
  lFrom: string;
  lTo: string;
  requestUrl: string;
  strings: string[];
  deadline: number;
  pollIntervalMs?: number;
}

interface Word {
  t: number;
  w: string;
  l: string[];
}

interface WordResult {
  value: string | null;
  queued: boolean;
}

const sleep = (ms: number): Promise<void> =>
  new Promise(res => setTimeout(res, ms));

async function requestTranslations(
  apiBaseUrl: string,
  apiKey: string,
  lFrom: string,
  lTo: string,
  requestUrl: string,
  words: Word[]
): Promise<WordResult[]> {
  const url = `${apiBaseUrl}/translate`;
  const results: WordResult[] = [];
  for (let start = 0; start < words.length; start += API_MAX_LENGTH) {
    const slice = words.slice(start, start + API_MAX_LENGTH);
    const body = JSON.stringify({
      l_from: lFrom,
      l_to: lTo,
      request_url: requestUrl,
      words: slice,
    });
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Key ${apiKey}`,
      },
      body,
    });

    if (!res.ok) {
      const text = await res.text();
      if (res.status === 400) {
        throw new Error(
          `Weglot API error (400): Translations unavailable. ${text || "Check your plan and quota."}`
        );
      }
      if (res.status === 401 || res.status === 403) {
        throw new Error(
          `Weglot API error (${res.status}): Invalid API key or access denied.`
        );
      }
      throw new Error(
        `Weglot API error (${res.status}): ${text || res.statusText}`
      );
    }

    const json = (await res.json()) as {
      to_words?: Array<string | null>;
      ids?: Array<string | null>;
    };
    const toWords = json.to_words;
    if (!Array.isArray(toWords)) {
      throw new Error("Weglot API response missing or invalid to_words");
    }
    const ids = Array.isArray(json.ids) ? json.ids : null;
    toWords.forEach((value, i) => {
      const id = ids ? (ids[i] ?? null) : null;
      const queued = value === null && (ids === null || id !== null);
      results.push({ queued, value });
    });
  }
  return results;
}

export async function translateStrings(
  opts: TranslateOptions
): Promise<string[]> {
  const { apiKey, apiBaseUrl, lFrom, lTo, requestUrl, strings, deadline } =
    opts;
  const pollIntervalMs = opts.pollIntervalMs ?? POLL_INTERVAL_MS;
  if (strings.length === 0) {
    return [];
  }

  const allWords: Word[] = strings.map(w => ({
    t: 1,
    w,
    l: ["translate-action"],
  }));

  const initial = await requestTranslations(
    apiBaseUrl,
    apiKey,
    lFrom,
    lTo,
    requestUrl,
    allWords
  );

  const results: Array<string | null> = initial.map((result, index) => {
    if (result.value !== null) {
      return result.value;
    }
    // Untranslatable leaf (no queued translation): keep the source string.
    return result.queued ? null : strings[index];
  });

  let pending = initial
    .map((result, index) =>
      result.value === null && result.queued ? index : -1
    )
    .filter(index => index >= 0);

  while (pending.length > 0 && Date.now() < deadline) {
    await sleep(pollIntervalMs);
    const subsetWords = pending.map(index => allWords[index]);
    const subset = await requestTranslations(
      apiBaseUrl,
      apiKey,
      lFrom,
      lTo,
      requestUrl,
      subsetWords
    );
    const stillPending: number[] = [];
    pending.forEach((originalIndex, k) => {
      const result = subset[k];
      if (result.value !== null) {
        results[originalIndex] = result.value;
      } else if (!result.queued) {
        results[originalIndex] = strings[originalIndex];
      } else {
        stillPending.push(originalIndex);
      }
    });
    pending = stillPending;
  }

  if (pending.length > 0) {
    throw new Error(
      `${pending.length} string(s) were not translated within the timeout (LLM translations are queued). Already-translated strings are cached — re-run the action to resume.`
    );
  }

  return results as string[];
}
