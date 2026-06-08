import { fetchProjectSettings } from "../lib/settings.js";

describe("fetchProjectSettings", () => {
  const apiKey = "sk_test123";
  let mockFetch: jest.Mock;

  beforeEach(() => {
    mockFetch = jest.fn();
    global.fetch = mockFetch as unknown as typeof fetch;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  function okResponse(body: unknown) {
    return { ok: true, status: 200, json: async () => body } as Response;
  }

  it("fetches the v2 settings URL with the raw api key and returns the bare object", async () => {
    const settings = {
      language_from: "en",
      api_base_url: "https://api.eu.weglot.com",
      product: "2.0",
      languages: [{ language_to: "fr", enabled: true }],
    };
    mockFetch.mockResolvedValue(okResponse(settings));

    const result = await fetchProjectSettings(apiKey);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const calledUrl = mockFetch.mock.calls[0][0] as string;
    expect(calledUrl).toBe(
      "https://api.weglot.com/project-settings?api_key=sk_test123"
    );
    expect(result).toEqual(settings);
  });

  it("throws when product is not 2.0", async () => {
    mockFetch.mockResolvedValue(
      okResponse({
        product: "1.0",
        language_from: "en",
        api_base_url: "x",
        languages: [],
      })
    );
    await expect(fetchProjectSettings(apiKey)).rejects.toThrow(
      "requires a Weglot v2 project"
    );
  });

  it("throws a clear error on 401", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 401,
      statusText: "Unauthorized",
    } as Response);
    await expect(fetchProjectSettings(apiKey)).rejects.toThrow(
      "Invalid Weglot API key"
    );
  });

  it("throws a clear error on 404", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 404,
      statusText: "Not Found",
    } as Response);
    await expect(fetchProjectSettings(apiKey)).rejects.toThrow(
      "Weglot project not found"
    );
  });

  it("throws a generic error on unexpected status (500)", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
    } as Response);
    await expect(fetchProjectSettings(apiKey)).rejects.toThrow(
      "Failed to fetch Weglot project settings"
    );
  });
});
