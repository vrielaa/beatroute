import crypto from "crypto";
import { appConfig } from "../../config/app.config.js";
import { assertLastfmConfig } from "../../config/lastfm.config.js";
import { LastfmApiError } from "./lastfm-api.error.js";
import {
  createHttpRequestExecutor,
  HttpRequestExecutionError,
  parseRetryAfterSeconds,
} from "@integrations/request-policy.js";
import { createRequestScheduler } from "@integrations/request-scheduler.js";

import type { HttpRequestPolicy } from "@integrations/request-policy.js";
import type { RequestScheduler } from "@integrations/request-scheduler.js";

/** Wspólny scheduler wszystkich produkcyjnych zapytań do Last.fm. */
const lastfmRequestScheduler = createRequestScheduler({
  maxConcurrentRequests: 2,
  rateLimit: {
    maxRequests: 2,
    intervalMs: 1_000,
  },
});

type RequestOptions = {
  headers: Record<string, string>;
  method: string;
  body?: URLSearchParams;
};

/**
 * Określa zależności i ustawienia klienta Last.fm.
 *
 * @property fetchImpl - Implementacja `fetch`, którą można zastąpić w testach.
 * @property config - Adresy i dane dostępowe API Last.fm.
 * @property requestPolicy - Nadpisania timeoutu oraz zasad retry.
 * @property scheduler - Opcjonalny scheduler współdzielący limity zapytań.
 */
type LastfmClientConfiguration = {
  fetchImpl?: typeof fetch;
  config?: typeof appConfig.lastfm;
  requestPolicy?: Partial<HttpRequestPolicy>;
  scheduler?: RequestScheduler;
};

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
  const retryAfterSeconds = parseRetryAfterSeconds(
    response.headers.get("retry-after")
  );
  const rawText = await response.text();
  let data: unknown;

  try {
    data = rawText ? JSON.parse(rawText) : null;
  } catch (cause) {
    throw new LastfmApiError("Last.fm zwrócił odpowiedź inną niż JSON", null, {
      category: "invalid-response",
      upstreamStatus: response.status,
      retryAfterSeconds,
      details: cause,
    });
  }

  const errorCode = getLastfmErrorCode(data);

  if (!response.ok || errorCode !== null) {
    throw new LastfmApiError(
      getLastfmErrorMessage(data) ??
        `Last.fm request failed with status ${response.status}`,
      errorCode,
      {
        upstreamStatus: response.status,
        retryAfterSeconds,
        details: data,
      }
    );
  }

  return data;
}

/** Odczytuje liczbowy kod błędu z odpowiedzi Last.fm. */
function getLastfmErrorCode(data: unknown): number | null {
  if (!isRecord(data) || typeof data.error !== "number") {
    return null;
  }

  return data.error;
}

/** Odczytuje komunikat błędu z odpowiedzi Last.fm. */
function getLastfmErrorMessage(data: unknown): string | null {
  if (!isRecord(data) || typeof data.message !== "string") {
    return null;
  }

  return data.message;
}

/** Sprawdza, czy nieznana wartość jest obiektem możliwym do odczytu. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function createLastfmClient({
  fetchImpl = globalThis.fetch,
  config = appConfig.lastfm,
  requestPolicy,
  scheduler,
}: LastfmClientConfiguration = {}) {
  const executeRequest = createHttpRequestExecutor({
    fetchImpl,
    policy: requestPolicy,
    scheduler,
  });
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

    let response: Response;

    try {
      response = await executeRequest(url, options);
    } catch (cause) {
      if (cause instanceof HttpRequestExecutionError) {
        const timedOut = cause.kind === "timeout";

        throw new LastfmApiError(
          timedOut
            ? "Last.fm nie odpowiedziało w wymaganym czasie"
            : "Nie udało się połączyć z Last.fm",
          null,
          {
            category: timedOut ? "timeout" : "network",
            details: cause.originalCause,
          }
        );
      }

      throw cause;
    }

    return parseAndValidateResponse(response);
  };
}

const fetchFromLastfm = createLastfmClient({
  scheduler: lastfmRequestScheduler,
});

export { createLastfmApiSignature, createLastfmClient, fetchFromLastfm };
