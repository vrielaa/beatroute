import type {
  PlaylistDataset,
  PlaylistRequirements,
  PlaylistPreferences,
  GeneratedPlaylist,
} from "@domain/playlist-generator/types.js";

import { filterPlaylistTracks } from "./filter-tracks.js";
import { rankPlaylistTracks } from "./rank-track.js";

/**
 * Generuje playlistę przez filtrowanie wymagań, a następnie ranking dopuszczonych utworów.
 * Utwory odrzucone nie są oceniane przez ranking i nie mogą wrócić do playlisty
 * dzięki dobremu dopasowaniu do preferencji. Ich powody odrzucenia pozostają w wyniku.
 * Nie modyfikuje wejścia, nie odczytuje plików i nie wywołuje zewnętrznych API.
 *
 * @param dataset - Wcześniej zwalidowany zbiór utworów z pomiarami.
 * @param requirements - Zwalidowane obowiązkowe warunki dopuszczenia utworów.
 * @param preferences - Zwalidowane preferencje określające kolejność dopuszczonych utworów.
 * @returns Uporządkowane oceny dopuszczonych utworów i odrzucone utwory z powodami.
 */
function generatePlaylist(
  dataset: PlaylistDataset,
  requirements: PlaylistRequirements,
  preferences: PlaylistPreferences
): GeneratedPlaylist {
  const filteredTracks = filterPlaylistTracks(dataset.tracks, requirements);
  const acceptedTracks = filteredTracks.acceptedTracks;
  const rejectedTracks = filteredTracks.rejectedTracks;
  const rankedTracks = rankPlaylistTracks(acceptedTracks, preferences);

  return {
    rankedTracks,
    rejectedTracks,
  };
}

export { generatePlaylist };
