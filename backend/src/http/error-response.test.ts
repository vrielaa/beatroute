import { describe, expect, it } from "vitest";

import { ReccoBeatsApiError } from "@integrations/reccobeats/reccobeats-api.error.js";
import { mapErrorToHttp } from "./error-response.js";

describe("mapErrorToHttp", () => {
  it("maps a ReccoBeats API failure to Bad Gateway", () => {
    const error = new ReccoBeatsApiError("ReccoBeats unavailable", 530, {
      error_code: 1033,
    });

    expect(mapErrorToHttp(error)).toEqual({
      status: 502,
      body: {
        error: {
          code: "RECCOBEATS_API_ERROR",
          message: "Nie udało się pobrać danych z ReccoBeats",
          details: {
            upstreamStatus: 530,
          },
        },
      },
    });
  });
});
