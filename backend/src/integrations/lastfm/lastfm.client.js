import crypto from "crypto";
import {
  LASTFM_API_KEY,
  LASTFM_API_ROOT,
  LASTFM_SHARED_SECRET,
  LASTFM_USER_AGENT,
  assertLastfmConfig,
} from "../../config/lastfm.config.js";

export class LastfmApiError extends Error {
  constructor(message, code = null) {
    super(message);
    this.name = "LastfmApiError";
    this.code = code;
  }
}

export function createLastfmApiSignature(params) {
  assertLastfmConfig();

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
    .update(`${signatureSource}${LASTFM_SHARED_SECRET}`, "utf8")
    .digest("hex");
}

export async function fetchFromLastfm(
  method,
  params = {},
  { signed = false, sessionKey = null, httpMethod = "GET" } = {}
) {
  assertLastfmConfig();

  const requestParams = {
    api_key: LASTFM_API_KEY,
    method,
    ...params,
  };

  if (sessionKey) {
    requestParams.sk = sessionKey;
  }

  if (signed) {
    requestParams.api_sig = createLastfmApiSignature(requestParams);
  }

  requestParams.format = "json";

  const searchParams = new URLSearchParams(
    Object.entries(requestParams).map(([key, value]) => [key, String(value)])
  );

  const requestOptions = {
    method: httpMethod,
    headers: {
      Accept: "application/json",
      "User-Agent": LASTFM_USER_AGENT,
    },
  };

  let url = LASTFM_API_ROOT;

  if (httpMethod === "POST") {
    requestOptions.headers["Content-Type"] =
      "application/x-www-form-urlencoded";
    requestOptions.body = searchParams;
  } else {
    url = `${LASTFM_API_ROOT}?${searchParams.toString()}`;
  }

  const response = await fetch(url, requestOptions);
  const rawText = await response.text();

  let data;

  try {
    data = rawText ? JSON.parse(rawText) : null;
  } catch {
    throw new LastfmApiError("Last.fm zwrócił odpowiedź inną niż JSON");
  }

  if (!response.ok || data?.error) {
    throw new LastfmApiError(
      data?.message || `Last.fm request failed with status ${response.status}`,
      data?.error ?? null
    );
  }

  return data;
}
