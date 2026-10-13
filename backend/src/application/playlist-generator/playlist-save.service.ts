import type {
  PlaylistSaveDependencies,
  PlaylistToSave,
  SavedPlaylist,
} from "./types.js";
import { PartialPlaylistSaveError } from "./partial-playlist-save.error.js";

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
   * kolejność ID z kopii wykonanej na początku operacji. Nie zmienia wejścia,
   * nie stosuje kryteriów ani nie przelicza rankingu.
   * Zwraca wynik dopiero po potwierdzeniu wszystkich partii. Błąd dodawania przerywa
   * proces i zachowuje dane playlisty, liczbę potwierdzonych utworów oraz przyczynę.
   * Nie ponawia operacji i nie usuwa utworzonej playlisty. Wynik niepotwierdzonej
   * partii może być nieznany, a licznik obejmuje wyłącznie wcześniejsze potwierdzenia.
   *
   * @param playlist - Wcześniej zwalidowana nazwa i od 1 do 500 unikalnych Spotify ID.
   * @param accessToken - Token użytkownika z uprawnieniem do zapisu prywatnych playlist.
   * @returns Dane utworzonej playlisty oraz liczba utworów z potwierdzonych partii.
   * @throws PartialPlaylistSaveError Gdy dodawanie utworów zawiedzie po utworzeniu playlisty.
   * Błąd tworzenia playlisty jest przekazywany bez opisu postępu, ponieważ jej dane nie są znane.
   */
  async function savePlaylist(
    playlist: PlaylistToSave,
    accessToken: string
  ): Promise<SavedPlaylist> {
    const selectedTrackIds = [...playlist.trackIds];
    const createdPlaylist = await createPlaylist(accessToken, playlist.name);
    const spotifyUrl = createdPlaylist.external_urls.spotify;
    let confirmedTrackCount = 0;

    try {
      for (
        let start = 0;
        start < selectedTrackIds.length;
        start += PLAYLIST_TRACKS_BATCH_SIZE
      ) {
        const trackIds = selectedTrackIds.slice(
          start,
          start + PLAYLIST_TRACKS_BATCH_SIZE
        );

        await addTracksToPlaylist(accessToken, createdPlaylist.id, trackIds);
        confirmedTrackCount += trackIds.length;
      }
    } catch (cause) {
      throw new PartialPlaylistSaveError(
        {
          id: createdPlaylist.id,
          name: createdPlaylist.name,
          spotifyUrl,
          confirmedTrackCount,
          requestedTrackCount: selectedTrackIds.length,
        },
        cause
      );
    }

    return {
      id: createdPlaylist.id,
      name: createdPlaylist.name,
      spotifyUrl,
      trackCount: confirmedTrackCount,
    };
  }

  return { savePlaylist };
}

export { createPlaylistSaveService };
