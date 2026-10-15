import { parseSpotifyTopTracksQuery } from "@integrations/spotify/spotify.validators.js";
import { RequestValidationError } from "@http/request-validation-error.js";
import type { TopTracksBatchSelection } from "@application/tracks/top-tracks.types.js";

/** Waliduje jedną partię i wymaganą kompletność danych; domyślnie dla statystyk. */
function parseTopTracksBatchQuery(
  query: {
    limit?: unknown;
    offset?: unknown;
    time_range?: unknown;
    purpose?: unknown;
  } = {}
): TopTracksBatchSelection {
  const selection = parseSpotifyTopTracksQuery(query);
  const purpose = query.purpose ?? "statistics";
  if (purpose !== "statistics" && purpose !== "music-map") {
    throw new RequestValidationError(
      'Parametr "purpose" musi być równy "statistics" albo "music-map"'
    );
  }
  return { ...selection, purpose };
}

export { parseTopTracksBatchQuery };
