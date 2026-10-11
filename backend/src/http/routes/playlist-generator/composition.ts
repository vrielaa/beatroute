import { createPlaylistDatasetService } from "@application/playlist-generator/playlist-dataset.service.js";
import { defaultSpotifyGateway } from "@integrations/spotify/spotify.gateway.js";
import { reccoBeatsService } from "@integrations/reccobeats/reccobeats.service.js";

/** Serwis przygotowania zbioru korzystający z produkcyjnych adapterów danych. */
const playlistDatasetService = createPlaylistDatasetService({
  getSpotifyTrackById: defaultSpotifyGateway.getSpotifyTrackById,
  getAudioFeaturesBySpotifyIds:
    reccoBeatsService.getManyTrackAudioFeaturesBySpotifyIds,
});

export { playlistDatasetService };
