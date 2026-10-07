import { describe, expect, it, vi } from "vitest";

import { createLastfmArtistGateway } from "./gateway.js";
import type { LastfmArtistApiResponse } from "./types.js";

describe("Last.fm artist gateway", () => {
  it("delegates a single artist request to the fetch adapter", async () => {
    const response = artistResponse("Radiohead");
    const fetchArtistInfo = vi.fn().mockResolvedValue(response);
    const gateway = createLastfmArtistGateway({ fetchArtistInfo });

    await expect(gateway.getArtistInfo("Radiohead")).resolves.toBe(response);
    expect(fetchArtistInfo).toHaveBeenCalledOnce();
    expect(fetchArtistInfo).toHaveBeenCalledWith("Radiohead");
  });

  it("starts all artist requests and preserves input order", async () => {
    const requests = new Map<
      string,
      DeferredPromise<LastfmArtistApiResponse>
    >();
    const fetchArtistInfo = vi.fn((artistName: string) => {
      const request = createDeferredPromise<LastfmArtistApiResponse>();
      requests.set(artistName, request);
      return request.promise;
    });
    const gateway = createLastfmArtistGateway({ fetchArtistInfo });

    const resultsPromise = gateway.getManyArtistInfoResults([
      "Radiohead",
      "Muse",
      "Björk",
    ]);

    expect(fetchArtistInfo.mock.calls).toEqual([
      ["Radiohead"],
      ["Muse"],
      ["Björk"],
    ]);

    requests.get("Muse")?.resolve(artistResponse("Muse"));
    requests.get("Björk")?.resolve(artistResponse("Björk"));
    requests.get("Radiohead")?.resolve(artistResponse("Radiohead"));

    await expect(resultsPromise).resolves.toMatchObject([
      { status: "fulfilled", requestedName: "Radiohead" },
      { status: "fulfilled", requestedName: "Muse" },
      { status: "fulfilled", requestedName: "Björk" },
    ]);
  });

  it("returns a rejected result, logs the error and continues fetching", async () => {
    const requestError = new Error("Last.fm unavailable for Muse");
    const fetchArtistInfo = vi.fn(async (artistName: string) => {
      if (artistName === "Muse") {
        throw requestError;
      }

      return artistResponse(artistName);
    });
    const logger = { error: vi.fn() };
    const gateway = createLastfmArtistGateway({
      fetchArtistInfo,
      logger,
    });

    const result = await gateway.getManyArtistInfoResults([
      "Radiohead",
      "Muse",
      "Björk",
    ]);

    expect(result).toMatchObject([
      { status: "fulfilled", requestedName: "Radiohead" },
      { status: "rejected", requestedName: "Muse", error: requestError },
      { status: "fulfilled", requestedName: "Björk" },
    ]);
    expect(fetchArtistInfo).toHaveBeenCalledTimes(3);
    expect(logger.error).toHaveBeenCalledOnce();
    expect(logger.error).toHaveBeenCalledWith(
      'Last.fm artist info error for "Muse":',
      requestError
    );
  });
});

/**
 * Reprezentuje ręcznie sterowany Promise używany do zmiany kolejności zakończeń.
 *
 * @property promise - Promise oczekujący na ręczne zakończenie.
 * @property resolve - Kończy Promise przekazaną wartością.
 */
type DeferredPromise<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
};

function createDeferredPromise<T>(): DeferredPromise<T> {
  let resolvePromise: ((value: T) => void) | undefined;
  const promise = new Promise<T>((resolve) => {
    resolvePromise = resolve;
  });

  return {
    promise,
    resolve(value) {
      resolvePromise?.(value);
    },
  };
}

function artistResponse(name: string): LastfmArtistApiResponse {
  return {
    artist: {
      name,
    },
  };
}
