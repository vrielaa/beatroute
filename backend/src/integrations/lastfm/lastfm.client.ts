import crypto from "crypto";
import { appConfig } from "../../config/app.config.js";
import { assertLastfmConfig } from "../../config/lastfm.config.js";

type RequestOptions = {
  headers: Record<string, string>;
  method: string;
  body?: URLSearchParams;
};

class LastfmApiError extends Error {
  code: number | null;
  name: string;

  constructor(message: string, code: number | null = null) {
    super(message);
    this.name = "LastfmApiError";
    this.code = code;
  }
}

function createLastfmApiSignature(
  params: Record<string, unknown>,
  { sharedSecret = appConfig.lastfm.sharedSecret } = {}
): string {
  const signatureSource = Object.entries(params)
    .filter(
      ([key, val]) => !["format", "callback"].includes(key) && val != null
    )
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}${String(value)}`)
    .join("");

  return crypto
    .createHash("md5")
    .update(`${signatureSource}${sharedSecret}`, "utf8")
    .digest("hex");
}

function buildRequestParams(
  method: string,
  params: Record<string, unknown>,
  config: typeof appConfig.lastfm,
  sessionKey: string | null,
  signed: boolean
): Record<string, string> {
  const requestParams: Record<string, unknown> = {
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

  const stringParams: Record<string, string> = {};
  for (const [key, value] of Object.entries(requestParams)) {
    if (value != null) stringParams[key] = String(value);
  }
  return stringParams;
}

function prepareFetchArgs(
  httpMethod: string,
  stringParams: Record<string, string>,
  config: typeof appConfig.lastfm
): { url: string; options: RequestOptions } {
  const searchParams = new URLSearchParams(stringParams);
  const headers: Record<string, string> = {
    Accept: "application/json",
    "User-Agent": config.userAgent,
  };

  const options: RequestOptions = {
    method: httpMethod,
    headers,
  };

  if (httpMethod === "POST") {
    options.headers["Content-Type"] = "application/x-www-form-urlencoded";
    options.body = searchParams;
    return { url: config.apiRoot, options };
  }

  return {
    url: `${config.apiRoot}?${searchParams.toString()}`,
    options,
  };
}

async function parseAndValidateResponse(response: Response): Promise<any> {
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

function createLastfmClient({
  fetchImpl = globalThis.fetch,
  config = appConfig.lastfm,
} = {}) {
  return async function fetchFromLastfm(
    method: string,
    params: Record<string, unknown> = {},
    { signed = false, sessionKey = null, httpMethod = "GET" } = {}
  ) {
    assertLastfmConfig(config);

    const stringParams = buildRequestParams(
      method,
      params,
      config,
      sessionKey,
      signed
    );
    const { url, options } = prepareFetchArgs(httpMethod, stringParams, config);

    const response = await fetchImpl(url, options as any);
    return parseAndValidateResponse(response);
  };
}

const fetchFromLastfm = createLastfmClient();

export {
  LastfmApiError,
  createLastfmApiSignature,
  createLastfmClient,
  fetchFromLastfm,
};
