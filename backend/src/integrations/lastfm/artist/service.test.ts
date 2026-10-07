import { describe, expect, it, vi } from "vitest";

import { createLastfmArtistService } from "./service.js";
import type { LastfmArtistApiResponse } from "./types.js";

describe("Last.fm artist service", () => {
  it("fetches and normalizes tags for a single artist", async () => {
    const response = {
      artist: { tags: { tag: [{ name: " rock " }, { name: "seen live" }] } },
    };
    const fetchArtistInfo = vi.fn().mockResolvedValue(response);
    const service = createLastfmArtistService({ fetchArtistInfo });

    await expect(service.getArtistTags("Radiohead")).resolves.toEqual([
      { name: "rock", url: null },
      { name: "seen live", url: null },
    ]);
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
    const service = createLastfmArtistService({ fetchArtistInfo });

    const resultsPromise = service.getManyArtistGenreResults([
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
      { status: "fulfilled", artist: { requestedName: "Radiohead" } },
      { status: "fulfilled", artist: { requestedName: "Muse" } },
      { status: "fulfilled", artist: { requestedName: "Björk" } },
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
    const service = createLastfmArtistService({
      fetchArtistInfo,
      logger,
    });

    const result = await service.getManyArtistGenreResults([
      "Radiohead",
      "Muse",
      "Björk",
    ]);

    expect(result).toMatchObject([
      { status: "fulfilled", artist: { requestedName: "Radiohead" } },
      {
        status: "rejected",
        artist: { requestedName: "Muse", genreCandidates: [] },
        error: requestError,
        invalidCredentials: false,
      },
      { status: "fulfilled", artist: { requestedName: "Björk" } },
    ]);
    expect(fetchArtistInfo).toHaveBeenCalledTimes(3);
    expect(logger.error).toHaveBeenCalledOnce();
    expect(logger.error).toHaveBeenCalledWith(
      'Last.fm artist info error for "Muse":',
      requestError
    );
  });

  it("maps fetched artist names and genre candidates for the application", async () => {
    const fetchArtistInfo = vi.fn().mockResolvedValue({
      artist: {
        name: "Radiohead",
        tags: { tag: [{ name: " Alternative Rock " }, { name: "seen live" }] },
      },
    });
    const service = createLastfmArtistService({ fetchArtistInfo });

    await expect(
      service.getManyArtistGenreResults(["radiohead"])
    ).resolves.toEqual([
      {
        status: "fulfilled",
        artist: {
          resolvedName: "Radiohead",
          requestedName: "radiohead",
          genreCandidates: [
            {
              name: "Alternative Rock",
              key: "alternative rock",
              canonicalName: "alternative",
            },
          ],
        },
      },
    ]);
  });

  it("marks Last.fm error code 10 as invalid credentials", async () => {
    const error = Object.assign(new Error("Invalid API key"), { code: 10 });
    const service = createLastfmArtistService({
      fetchArtistInfo: vi.fn().mockRejectedValue(error),
      logger: { error: vi.fn() },
    });

    await expect(
      service.getManyArtistGenreResults(["Radiohead"])
    ).resolves.toMatchObject([
      { status: "rejected", error, invalidCredentials: true },
    ]);
  });

  it("propagates errors when fetching tags for a single artist", async () => {
    const error = new Error("Last.fm unavailable");
    const service = createLastfmArtistService({
      fetchArtistInfo: vi.fn().mockRejectedValue(error),
    });

    await expect(service.getArtistTags("Radiohead")).rejects.toBe(error);
  });

  it("does not fetch data for an empty list of artists", async () => {
    const fetchArtistInfo = vi.fn();
    const service = createLastfmArtistService({ fetchArtistInfo });

    await expect(service.getManyArtistGenreResults([])).resolves.toEqual([]);
    expect(fetchArtistInfo).not.toHaveBeenCalled();
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
