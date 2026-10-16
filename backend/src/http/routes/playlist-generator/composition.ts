import { createPlaylistDatasetService } from "@application/playlist-generator/playlist-dataset.service.js";
import { createPlaylistSaveService } from "@application/playlist-generator/playlist-save.service.js";
import { defaultSpotifyGateway } from "@integrations/spotify/spotify.gateway.js";
import { reccoBeatsService } from "@integrations/reccobeats/reccobeats.service.js";

/**
 * Przygotowanie zbioru z produkcyjnych adapterów dla wszystkich trzech źródeł.
 * Tryb strict przerywa przygotowanie przy technicznym błędzie pojedynczego
 * odczytu cech, zamiast traktować awarię jako brak danych utworu.
 */
const playlistDatasetService = createPlaylistDatasetService({
  getSpotifyTrackById: defaultSpotifyGateway.getSpotifyTrackById,
  getAudioFeaturesBySpotifyIds: (ids) =>
    reccoBeatsService.getManyTrackAudioFeaturesBySpotifyIds(ids, {
      errorMode: "strict",
    }),
  getCurrentUserSavedTracks: defaultSpotifyGateway.getCurrentUserSavedTracks,
  getPlaylistMetadata: defaultSpotifyGateway.getPlaylistMetadata,
  getPlaylistItemsPage: defaultSpotifyGateway.getPlaylistItemsPage,
});

/** Serwis zapisu prywatnych playlist korzystający z produkcyjnego gatewaya Spotify. */
const playlistSaveService = createPlaylistSaveService({
  createPlaylist: defaultSpotifyGateway.createPlaylist,
  addTracksToPlaylist: defaultSpotifyGateway.addTracksToPlaylist,
  getPlaylistContents: defaultSpotifyGateway.getPlaylistContents,
});

export { playlistDatasetService, playlistSaveService };
