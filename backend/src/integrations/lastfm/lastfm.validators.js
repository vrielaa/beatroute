export function parseArtistNames(body = {}) {
  if (!Array.isArray(body.artists) || body.artists.length === 0) {
    throw new TypeError("Pole artists musi być niepustą tablicą nazw artystów");
  }

  if (body.artists.length > 40) {
    throw new TypeError(
      "Jednocześnie można analizować maksymalnie 40 artystów"
    );
  }

  const artists = body.artists.map((artist) =>
    typeof artist === "string" ? artist.trim() : ""
  );

  if (artists.some((artist) => !artist)) {
    throw new TypeError("Każdy element artists musi być niepustym tekstem");
  }

  return artists;
}

export function parseTrackInfoQuery(query = {}) {
  const mbid = typeof query.mbid === "string" ? query.mbid.trim() : "";

  if (mbid) {
    return { mbid };
  }

  const artist = typeof query.artist === "string" ? query.artist.trim() : "";
  const track = typeof query.track === "string" ? query.track.trim() : "";

  if (!artist || !track) {
    throw new TypeError("Podaj mbid albo oba parametry: artist i track");
  }

  return { artist, track };
}
