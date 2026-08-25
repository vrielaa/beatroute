import crypto from "crypto";
import { appConfig } from "../../config/app.config.js";
import { assertLastfmConfig } from "../../config/lastfm.config.js";

export class LastfmApiError extends Error {
  constructor(message, code = null) {
    super(message);
    this.name = "LastfmApiError";
    this.code = code;
  }
}

export function createLastfmApiSignature(
  params,
  { sharedSecret = appConfig.lastfm.sharedSecret } = {}
) {
  const signatureSource = Object.entries(params)
    .filter(
      ([key, value]) =>
        !["format", "callback"].includes(key) &&
        value !== undefined &&
        value !== null
    )
    .sort(([firstKey], [secondKey]) => {
      if (firstKey < secondKey) return -1;
      if (firstKey > secondKey) return 1;
      return 0;
    })
    .map(([key, value]) => `${key}${String(value)}`)
    .join("");

  return crypto
    .createHash("md5")
    .update(`${signatureSource}${sharedSecret}`, "utf8")
    .digest("hex");
}

export function createLastfmClient({
  fetchImpl = globalThis.fetch,
  config = appConfig.lastfm,
} = {}) {
  return async function fetchFromLastfm(
    method,
    params = {},
    { signed = false, sessionKey = null, httpMethod = "GET" } = {}
  ) {
    assertLastfmConfig(config);

    const requestParams = {
      api_key: config.apiKey,
      method,
      ...params,
    };

    if (sessionKey) {
      requestParams.sk = sessionKey;
    }

    if (signed) {
      requestParams.api_sig = createLastfmApiSignature(requestParams, {
        sharedSecret: config.sharedSecret,
      });
    }

    requestParams.format = "json";

    const searchParams = new URLSearchParams(
      Object.entries(requestParams).map(([key, value]) => [key, String(value)])
    );

    const requestOptions = {
      method: httpMethod,
      headers: {
        Accept: "application/json",
        "User-Agent": config.userAgent,
      },
    };

    let url = config.apiRoot;

    if (httpMethod === "POST") {
      requestOptions.headers["Content-Type"] =
        "application/x-www-form-urlencoded";
      requestOptions.body = searchParams;
    } else {
      url = `${config.apiRoot}?${searchParams.toString()}`;
    }

    const response = await fetchImpl(url, requestOptions);
    const rawText = await response.text();

    let data;

    try {
      data = rawText ? JSON.parse(rawText) : null;
    } catch {
      throw new LastfmApiError("Last.fm zwrócił odpowiedź inną niż JSON");
    }

    if (!response.ok || data?.error) {
      throw new LastfmApiError(
        data?.message ||
          `Last.fm request failed with status ${response.status}`,
        data?.error ?? null
      );
    }

    return data;
  };
}

export const fetchFromLastfm = createLastfmClient();
