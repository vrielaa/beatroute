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

import type { HttpRequestPolicy } from "@integrations/request-policy.js";

/** Zależności klienta Soundcharts możliwe do zastąpienia w testach. */
type SoundchartsClientConfiguration = {
  fetchImpl?: typeof fetch;
  baseUrl?: string;
  appId?: string;
  apiKey?: string;
  requestPolicy?: Partial<HttpRequestPolicy>;
};

function createSoundchartsClient({
  fetchImpl = globalThis.fetch,
  baseUrl = appConfig.soundcharts.baseUrl,
  appId = appConfig.soundcharts.appId,
  apiKey = appConfig.soundcharts.apiKey,
  requestPolicy,
}: SoundchartsClientConfiguration = {}) {
  const executeRequest = createHttpRequestExecutor({
    fetchImpl,
    policy: requestPolicy,
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

const fetchFromSoundcharts = createSoundchartsClient();

export { createSoundchartsClient, fetchFromSoundcharts };
export type { SoundchartsClientConfiguration };
