import { describe, expect, it } from "vitest";

import { mapSoundchartsAudioFeatures } from "./mapper.js";

describe("mapSoundchartsAudioFeatures", () => {
  it("maps available values and fills missing values with null", () => {
    expect(
      mapSoundchartsAudioFeatures({ tempo: 128, energy: 0.8, timeSignature: 4 })
    ).toEqual({
      acousticness: null,
      danceability: null,
      energy: 0.8,
      instrumentalness: null,
      liveness: null,
      loudness: null,
      speechiness: null,
      tempo: 128,
      valence: null,
      key: null,
      mode: null,
      timeSignature: 4,
    });
  });
});
