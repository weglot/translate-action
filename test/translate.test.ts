import { translateStrings } from "../lib/translate.js";

describe("translateStrings", () => {
  const base = {
    apiKey: "sk_test123",
    apiBaseUrl: "https://api.eu.weglot.com",
    lFrom: "en",
    lTo: "fr",
    requestUrl: "https://github.com/owner/repo",
    deadline: Infinity,
  };
  let mockFetch: jest.Mock;

  beforeEach(() => {
    mockFetch = jest.fn();
    global.fetch = mockFetch as unknown as typeof fetch;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  function okResponse(
    toWords: Array<string | null>,
    ids?: Array<string | null>
  ) {
    return {
      ok: true,
      status: 200,
      json: async () =>
        ids ? { to_words: toWords, ids } : { to_words: toWords },
    } as Response;
  }

  it("returns [] without calling fetch for empty input", async () => {
    const result = await translateStrings({ ...base, strings: [] });
    expect(result).toEqual([]);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("POSTs to <apiBaseUrl>/translate with header auth, no query params, and label array", async () => {
    mockFetch.mockResolvedValue(okResponse(["Bonjour"]));

    const result = await translateStrings({ ...base, strings: ["Hello"] });

    expect(result).toEqual(["Bonjour"]);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe("https://api.eu.weglot.com/translate");
    const reqInit = init as RequestInit;
    expect(reqInit.method).toBe("POST");
    const headers = reqInit.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Key sk_test123");
    const body = JSON.parse(reqInit.body as string);
    expect(body).toEqual({
      l_from: "en",
      l_to: "fr",
      request_url: "https://github.com/owner/repo",
      words: [{ t: 1, w: "Hello", l: ["translate-action"] }],
    });
  });

  it("chunks requests larger than API_MAX_LENGTH and concatenates to_words", async () => {
    const strings = Array.from({ length: 1300 }, (_, i) => `s${i}`);
    mockFetch
      .mockResolvedValueOnce(okResponse(strings.slice(0, 600).map(s => `t-${s}`)))
      .mockResolvedValueOnce(
        okResponse(strings.slice(600, 1200).map(s => `t-${s}`))
      )
      .mockResolvedValueOnce(okResponse(strings.slice(1200).map(s => `t-${s}`)));

    const result = await translateStrings({ ...base, strings });

    expect(mockFetch).toHaveBeenCalledTimes(3);
    expect(result).toHaveLength(1300);
    expect(result[0]).toBe("t-s0");
    expect(result[1299]).toBe("t-s1299");

    const bodies = mockFetch.mock.calls.map(
      c => JSON.parse((c[1] as RequestInit).body as string).words
    );
    expect(bodies[0]).toHaveLength(600);
    expect(bodies[1]).toHaveLength(600);
    expect(bodies[2]).toHaveLength(100);
    expect(bodies[0][0]).toEqual({ t: 1, w: "s0", l: ["translate-action"] });
    expect(bodies[2][99]).toEqual({ t: 1, w: "s1299", l: ["translate-action"] });
  });

  it("throws when to_words is missing", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({}),
    } as Response);
    await expect(
      translateStrings({ ...base, strings: ["Hello"] })
    ).rejects.toThrow("to_words");
  });

  it("throws a clear error on 401", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 401,
      statusText: "Unauthorized",
      text: async () => "",
    } as Response);
    await expect(
      translateStrings({ ...base, strings: ["Hello"] })
    ).rejects.toThrow(/401.*Invalid API key/);
  });

  it("polls until a queued (null) string resolves", async () => {
    mockFetch
      .mockResolvedValueOnce(okResponse([null]))
      .mockResolvedValueOnce(okResponse(["Bonjour"]));

    const result = await translateStrings({
      ...base,
      strings: ["Hello"],
      pollIntervalMs: 1,
    });

    expect(result).toEqual(["Bonjour"]);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("re-requests only the still-null subset and merges by index", async () => {
    mockFetch
      .mockResolvedValueOnce(okResponse(["A", null]))
      .mockResolvedValueOnce(okResponse(["B"]));

    const result = await translateStrings({
      ...base,
      strings: ["a", "b"],
      pollIntervalMs: 1,
    });

    expect(result).toEqual(["A", "B"]);
    expect(mockFetch).toHaveBeenCalledTimes(2);
    const secondBody = JSON.parse(
      (mockFetch.mock.calls[1][1] as RequestInit).body as string
    );
    expect(secondBody.words).toEqual([
      { t: 1, w: "b", l: ["translate-action"] },
    ]);
  });

  it("throws a clear timeout error when strings stay queued past the deadline", async () => {
    mockFetch.mockResolvedValue(okResponse([null]));

    await expect(
      translateStrings({
        ...base,
        strings: ["Hello"],
        deadline: Date.now() + 30,
        pollIntervalMs: 1,
      })
    ).rejects.toThrow(/not translated within the timeout.*cached.*re-run/s);
  });

  it("treats an untranslatable null (id null) as source and does not poll or fail", async () => {
    mockFetch.mockResolvedValue(okResponse([null], [null]));

    const result = await translateStrings({
      ...base,
      strings: ["123"],
      deadline: Date.now() + 30,
      pollIntervalMs: 1,
    });

    expect(result).toEqual(["123"]);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("handles a mix of untranslatable and queued strings", async () => {
    mockFetch
      .mockResolvedValueOnce(okResponse([null, null], [null, "abc"]))
      .mockResolvedValueOnce(okResponse(["Bonjour"], ["abc"]));

    const result = await translateStrings({
      ...base,
      strings: ["", "Hello"],
      pollIntervalMs: 1,
    });

    expect(result).toEqual(["", "Bonjour"]);
    expect(mockFetch).toHaveBeenCalledTimes(2);
    const secondBody = JSON.parse(
      (mockFetch.mock.calls[1][1] as RequestInit).body as string
    );
    expect(secondBody.words).toEqual([
      { t: 1, w: "Hello", l: ["translate-action"] },
    ]);
  });

  it("source-falls-back a string that becomes untranslatable on a later poll", async () => {
    mockFetch
      .mockResolvedValueOnce(okResponse([null, null], [null, "abc"]))
      .mockResolvedValueOnce(okResponse([null], [null]));

    const result = await translateStrings({
      ...base,
      strings: ["x", "y"],
      deadline: Date.now() + 1000,
      pollIntervalMs: 1,
    });

    expect(result).toEqual(["x", "y"]);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });
});
