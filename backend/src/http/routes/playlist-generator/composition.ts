import { createPlaylistDatasetService } from "@application/playlist-generator/playlist-dataset.service.js";
import { createPlaylistSaveService } from "@application/playlist-generator/playlist-save.service.js";
import { defaultSpotifyGateway } from "@integrations/spotify/spotify.gateway.js";
import { reccoBeatsService } from "@integrations/reccobeats/reccobeats.service.js";

/** Serwis przygotowania zbioru korzystający z produkcyjnych adapterów danych. */
const playlistDatasetService = createPlaylistDatasetService({
  getSpotifyTrackById: defaultSpotifyGateway.getSpotifyTrackById,
  getAudioFeaturesBySpotifyIds:
    reccoBeatsService.getManyTrackAudioFeaturesBySpotifyIds,
  getCurrentUserSavedTracks: defaultSpotifyGateway.getCurrentUserSavedTracks,
});

/** Serwis zapisu prywatnych playlist korzystający z produkcyjnego gatewaya Spotify. */
const playlistSaveService = createPlaylistSaveService({
  createPlaylist: defaultSpotifyGateway.createPlaylist,
  addTracksToPlaylist: defaultSpotifyGateway.addTracksToPlaylist,
  getPlaylistContents: defaultSpotifyGateway.getPlaylistContents,
});

export { playlistDatasetService, playlistSaveService };
