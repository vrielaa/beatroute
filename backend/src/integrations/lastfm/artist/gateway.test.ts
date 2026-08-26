import { describe, expect, it, vi } from "vitest";

import { createLastfmArtistGateway } from "./gateway.js";
import type { LastfmArtistApiResponse } from "./types.js";

describe("Last.fm artist gateway", () => {
  it.each([0, -1, 1.5, Number.NaN])(
    "rejects invalid batch size: %s",
    (batchSize) => {
      expect(() =>
        createLastfmArtistGateway({
          requestArtistInfo: vi.fn(),
          batchSize,
        })
      ).toThrow(RangeError);
    }
  );

  it("delegates a single artist lookup to the request adapter", async () => {
    const response = artistResponse("Radiohead");
    const requestArtistInfo = vi.fn().mockResolvedValue(response);
    const gateway = createLastfmArtistGateway({ requestArtistInfo });

    await expect(gateway.lookupArtist("Radiohead")).resolves.toBe(response);
    expect(requestArtistInfo).toHaveBeenCalledOnce();
    expect(requestArtistInfo).toHaveBeenCalledWith("Radiohead");
  });

  it("starts the next batch only after the current batch finishes", async () => {
    const requests = new Map<
      string,
      DeferredPromise<LastfmArtistApiResponse>
    >();
    const requestArtistInfo = vi.fn((artistName: string) => {
      const request = createDeferredPromise<LastfmArtistApiResponse>();
      requests.set(artistName, request);
      return request.promise;
    });
    const gateway = createLastfmArtistGateway({
      requestArtistInfo,
      batchSize: 2,
    });

    const lookupPromise = gateway.lookupMany(["Radiohead", "Muse", "Björk"]);

    expect(requestArtistInfo.mock.calls).toEqual([["Radiohead"], ["Muse"]]);

    requests.get("Muse")?.resolve(artistResponse("Muse"));
    requests.get("Radiohead")?.resolve(artistResponse("Radiohead"));

    await vi.waitFor(() => {
      expect(requestArtistInfo).toHaveBeenCalledTimes(3);
    });
    expect(requestArtistInfo).toHaveBeenLastCalledWith("Björk");

    requests.get("Björk")?.resolve(artistResponse("Björk"));

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
      batchSize: 2,
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
