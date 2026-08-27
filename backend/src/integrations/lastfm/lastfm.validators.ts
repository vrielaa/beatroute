import { RequestValidationError } from "../../http/request-validation-error.js";
import type { LastfmTrackIdentifier } from "./track/types.js";

/** Niezweryfikowane body żądania zawierającego nazwy artystów. */
type ArtistNamesPayload = {
  artists?: unknown;
};

/** Niezweryfikowane parametry identyfikujące utwór. */
type TrackIdentifierQuery = {
  mbid?: unknown;
  artist?: unknown;
  track?: unknown;
};

export function parseArtistNames(body: ArtistNamesPayload = {}): string[] {
  if (!Array.isArray(body.artists) || body.artists.length === 0) {
    throw new RequestValidationError(
      "Pole artists musi być niepustą tablicą nazw artystów"
    );
  }

  if (body.artists.length > 40) {
    throw new RequestValidationError(
      "Jednocześnie można analizować maksymalnie 40 artystów"
    );
  }

  const artists = body.artists.map((artist) =>
    typeof artist === "string" ? artist.trim() : ""
  );

  if (artists.some((artist) => !artist)) {
    throw new RequestValidationError(
      "Każdy element artists musi być niepustym tekstem"
    );
  }

  return artists;
}

export function parseTrackInfoQuery(
  query: TrackIdentifierQuery = {}
): LastfmTrackIdentifier {
  const mbid = typeof query.mbid === "string" ? query.mbid.trim() : "";

  if (mbid) {
    return { mbid };
  }

  const artist = typeof query.artist === "string" ? query.artist.trim() : "";
  const track = typeof query.track === "string" ? query.track.trim() : "";

  if (!artist || !track) {
    throw new RequestValidationError(
      "Podaj mbid albo oba parametry: artist i track"
    );
  }

  return { artist, track };
}
