import { appConfig } from "../../config/app.config.js";
import {
  type SoundchartsApiResponse,
  type SoundchartsApiErrorResponse,
} from "./types.js";
import { SoundchartsApiError } from "./soundcharts-api.error.js";
import {
  createHttpRequestExecutor,
  HttpRequestExecutionError,
  parseRetryAfterSeconds,
} from "@integrations/request-policy.js";
import { createRequestScheduler } from "@integrations/request-scheduler.js";

import type { HttpRequestPolicy } from "@integrations/request-policy.js";
import type { RequestScheduler } from "@integrations/request-scheduler.js";

/** Wspólny scheduler wszystkich produkcyjnych zapytań do Soundcharts. */
const soundchartsRequestScheduler = createRequestScheduler({
  maxConcurrentRequests: 5,
});

/**
 * Określa zależności i ustawienia klienta Soundcharts.
 *
 * @property fetchImpl - Implementacja `fetch`, którą można zastąpić w testach.
 * @property baseUrl - Bazowy adres API Soundcharts.
 * @property appId - Identyfikator aplikacji przekazywany do Soundcharts.
 * @property apiKey - Klucz API przekazywany do Soundcharts.
 * @property requestPolicy - Nadpisania timeoutu oraz zasad retry.
 * @property scheduler - Opcjonalny scheduler współdzielący limity zapytań.
 */
type SoundchartsClientConfiguration = {
  fetchImpl?: typeof fetch;
  baseUrl?: string;
  appId?: string;
  apiKey?: string;
  requestPolicy?: Partial<HttpRequestPolicy>;
  scheduler?: RequestScheduler;
};

function createSoundchartsClient({
  fetchImpl = globalThis.fetch,
  baseUrl = appConfig.soundcharts.baseUrl,
  appId = appConfig.soundcharts.appId,
  apiKey = appConfig.soundcharts.apiKey,
  requestPolicy,
  scheduler,
}: SoundchartsClientConfiguration = {}) {
  const executeRequest = createHttpRequestExecutor({
    fetchImpl,
    policy: requestPolicy,
    scheduler,
  });
  return async function fetchFromSoundcharts(
    endpointPath: string
  ): Promise<SoundchartsApiResponse> {
    let response: Response;

    try {
      response = await executeRequest(`${baseUrl}${endpointPath}`, {
        headers: {
          "x-app-id": appId,
          "x-api-key": apiKey,
          Accept: "application/json",
        },
      });
    } catch (cause) {
      if (cause instanceof HttpRequestExecutionError) {
        const timedOut = cause.kind === "timeout";

        throw new SoundchartsApiError(
          timedOut
            ? "Soundcharts nie odpowiedziało w wymaganym czasie"
            : "Nie udało się połączyć z Soundcharts",
          timedOut ? 504 : 502,
          cause.originalCause,
          {
            category: timedOut ? "timeout" : "network",
          }
        );
      }
      throw cause;
    }

    const retryAfterSeconds = parseRetryAfterSeconds(
      response.headers.get("retry-after")
    );

    let data: SoundchartsApiResponse;

    try {
      data = (await response.json()) as SoundchartsApiResponse;
    } catch (cause) {
      throw new SoundchartsApiError(
        "Soundcharts zwrócił odpowiedź inną niż JSON",
        response.status,
        cause,
        { category: "invalid-response", retryAfterSeconds }
      );
    }

    if (!response.ok) {
      const errorData = data as SoundchartsApiErrorResponse;

      throw new SoundchartsApiError(
        errorData.errors?.[0]?.message || "Soundcharts request failed",
        response.status,
        data,
        { retryAfterSeconds }
      );
    }

    return data;
  };
}

const fetchFromSoundcharts = createSoundchartsClient({
  scheduler: soundchartsRequestScheduler,
});

export { createSoundchartsClient, fetchFromSoundcharts };
export type { SoundchartsClientConfiguration };
