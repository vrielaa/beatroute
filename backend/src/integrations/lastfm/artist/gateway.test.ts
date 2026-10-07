import { describe, expect, it, vi } from "vitest";

import { createLastfmArtistGateway } from "./gateway.js";
import type { LastfmArtistApiResponse } from "./types.js";

describe("Last.fm artist gateway", () => {
  it("delegates a single artist lookup to the request adapter", async () => {
    const response = artistResponse("Radiohead");
    const requestArtistInfo = vi.fn().mockResolvedValue(response);
    const gateway = createLastfmArtistGateway({ requestArtistInfo });

    await expect(gateway.lookupArtist("Radiohead")).resolves.toBe(response);
    expect(requestArtistInfo).toHaveBeenCalledOnce();
    expect(requestArtistInfo).toHaveBeenCalledWith("Radiohead");
  });

  it("starts all lookups and preserves input order", async () => {
    const requests = new Map<
      string,
      DeferredPromise<LastfmArtistApiResponse>
    >();
    const requestArtistInfo = vi.fn((artistName: string) => {
      const request = createDeferredPromise<LastfmArtistApiResponse>();
      requests.set(artistName, request);
      return request.promise;
    });
    const gateway = createLastfmArtistGateway({ requestArtistInfo });

    const lookupPromise = gateway.lookupMany(["Radiohead", "Muse", "Björk"]);

    expect(requestArtistInfo.mock.calls).toEqual([
      ["Radiohead"],
      ["Muse"],
      ["Björk"],
    ]);

    requests.get("Muse")?.resolve(artistResponse("Muse"));
    requests.get("Björk")?.resolve(artistResponse("Björk"));
    requests.get("Radiohead")?.resolve(artistResponse("Radiohead"));

    await expect(lookupPromise).resolves.toMatchObject([
      { status: "fulfilled", requestedName: "Radiohead" },
      { status: "fulfilled", requestedName: "Muse" },
      { status: "fulfilled", requestedName: "Björk" },
    ]);
  });

  it("returns a rejected result, logs the error and continues lookup", async () => {
    const lookupError = new Error("Last.fm unavailable for Muse");
    const requestArtistInfo = vi.fn(async (artistName: string) => {
      if (artistName === "Muse") {
        throw lookupError;
      }

      return artistResponse(artistName);
    });
    const logger = { error: vi.fn() };
    const gateway = createLastfmArtistGateway({
      requestArtistInfo,
      logger,
    });

    const result = await gateway.lookupMany(["Radiohead", "Muse", "Björk"]);

    expect(result).toMatchObject([
      { status: "fulfilled", requestedName: "Radiohead" },
      { status: "rejected", requestedName: "Muse", error: lookupError },
      { status: "fulfilled", requestedName: "Björk" },
    ]);
    expect(requestArtistInfo).toHaveBeenCalledTimes(3);
    expect(logger.error).toHaveBeenCalledOnce();
    expect(logger.error).toHaveBeenCalledWith(
      'Last.fm artist info error for "Muse":',
      lookupError
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
