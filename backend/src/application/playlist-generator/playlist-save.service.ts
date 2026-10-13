import type {
  PlaylistSaveDependencies,
  PlaylistToSave,
  SavedPlaylist,
} from "./types.js";

/** Maksymalna liczba utworów przekazywanych do jednej operacji dodawania. */
const PLAYLIST_TRACKS_BATCH_SIZE = 100;

/**
 * Tworzy serwis zapisujący wybór użytkownika jako nową, prywatną playlistę.
 * Korzysta wyłącznie z przekazanych operacji tworzenia playlisty i dodawania utworów.
 * Nie importuje produkcyjnego gatewaya, konfiguracji środowiska ani sesji HTTP.
 *
 * @param dependencies - Operacje tworzenia playlisty i zapisu pojedynczej partii utworów.
 * @returns Serwis udostępniający operację savePlaylist.
 */
function createPlaylistSaveService({
  createPlaylist,
  addTracksToPlaylist,
}: PlaylistSaveDependencies) {
  /**
   * Tworzy playlistę raz i dopisuje wszystkie wybrane utwory w partiach po 100.
   * Czeka na zakończenie każdej partii przed rozpoczęciem następnej, zachowując
   * kolejność ID. Nie zmienia wejścia, nie stosuje kryteriów ani nie przelicza rankingu.
   * Zwraca wynik dopiero po potwierdzeniu wszystkich partii. Błąd przerywa proces
   * i jest przekazywany wywołującemu bez automatycznego ponawiania operacji.
   *
   * @param playlist - Wcześniej zwalidowana nazwa i od 1 do 500 unikalnych Spotify ID.
   * @param accessToken - Token użytkownika z uprawnieniem do zapisu prywatnych playlist.
   * @returns Dane utworzonej playlisty oraz liczba utworów z potwierdzonych partii.
   * @throws Gdy utworzenie playlisty lub zapis dowolnej partii się nie powiedzie.
   */
  async function savePlaylist(
    playlist: PlaylistToSave,
    accessToken: string
  ): Promise<SavedPlaylist> {
    const createdPlaylist = await createPlaylist(accessToken, playlist.name);
    let savedTrackCount = 0;

    for (
      let start = 0;
      start < playlist.trackIds.length;
      start += PLAYLIST_TRACKS_BATCH_SIZE
    ) {
      const trackIds = playlist.trackIds.slice(
        start,
        start + PLAYLIST_TRACKS_BATCH_SIZE
      );

      await addTracksToPlaylist(accessToken, createdPlaylist.id, trackIds);
      savedTrackCount += trackIds.length;
    }

    return {
      id: createdPlaylist.id,
      name: createdPlaylist.name,
      spotifyUrl: createdPlaylist.external_urls.spotify,
      trackCount: savedTrackCount,
    };
  }

  return { savePlaylist };
}

export { createPlaylistSaveService };
