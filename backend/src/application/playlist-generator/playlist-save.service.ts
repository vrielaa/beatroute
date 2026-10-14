import type {
  PlaylistSaveDependencies,
  PlaylistToSave,
  PlaylistSaveProgress,
  PendingPlaylistSave,
  SavedPlaylist,
} from "./types.js";
import { PartialPlaylistSaveError } from "./partial-playlist-save.error.js";
import { PlaylistSaveConflictError } from "./playlist-save-conflict.error.js";

/** Maksymalna liczba utworów przekazywanych do jednej operacji dodawania. */
const PLAYLIST_TRACKS_BATCH_SIZE = 100;

/**
 * Tworzy serwis zapisujący nową playlistę i wznawiający jej nieukończony zapis.
 * Korzysta wyłącznie z przekazanych operacji odczytu i zapisu playlisty.
 * Nie importuje produkcyjnego gatewaya, konfiguracji środowiska ani sesji HTTP.
 *
 * @param dependencies - Operacje tworzenia playlisty, odczytu zawartości i dodawania partii.
 * @returns Operacje savePlaylist i resumePlaylist, bez automatycznego ponawiania zapisów.
 */
function createPlaylistSaveService({
  createPlaylist,
  addTracksToPlaylist,
  getPlaylistContents,
}: PlaylistSaveDependencies) {
  const activePlaylistIds = new Set<string>();
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
    return appendRemainingTracks(
      {
        id: createdPlaylist.id,
        name: createdPlaylist.name,
        spotifyUrl: createdPlaylist.external_urls.spotify,
        confirmedTrackCount: 0,
        requestedTrackCount: selectedTrackIds.length,
      },
      selectedTrackIds,
      accessToken
    );
  }

  /**
   * Sprawdza faktyczną zawartość istniejącej playlisty i dopisuje brakującą końcówkę wyboru.
   * Nie ufa samemu licznikowi potwierdzeń: niepotwierdzona partia mogła być już zapisana.
   * Wymaga zgodności kolejności wszystkich odczytanych ID z początkiem pierwotnego wyboru
   * i co najmniej tylu pozycji, ile wcześniej potwierdzono. Braki, duplikaty, usunięcia
   * i ręczne zmiany zatrzymują zapis. Pełna zgodna lista daje sukces bez kolejnego POST-a.
   * Blokuje równoległe wznowienia tej samej playlisty w obrębie instancji serwisu.
   * Nie tworzy nowej playlisty, nie usuwa utworów i nie przelicza rankingu.
   *
   * @param pending - Kopia pierwotnego wyboru i postępu zachowana przez backend.
   * @param accessToken - Token użytkownika uprawnionego do odczytu i zapisu playlisty.
   * @returns Potwierdzenie kompletnej playlisty o tym samym ID.
   * @throws PlaylistSaveConflictError Gdy trwa wznowienie albo odczyt nie jest zgodnym początkiem wyboru.
   * @throws PartialPlaylistSaveError Gdy dopisywanie kolejnej partii zawiedzie.
   */
  async function resumePlaylist(
    pending: PendingPlaylistSave,
    accessToken: string
  ): Promise<SavedPlaylist> {
    const progress = { ...pending.progress };
    const trackIds = [...pending.trackIds];

    if (activePlaylistIds.has(progress.id)) {
      throw new PlaylistSaveConflictError("PLAYLIST_SAVE_IN_PROGRESS");
    }

    activePlaylistIds.add(progress.id);

    try {
      const contents = await getPlaylistContents(accessToken, progress.id);

      if (
        contents.trackIds.length < progress.confirmedTrackCount ||
        contents.trackIds.length > trackIds.length ||
        contents.trackIds.some(
          (id, index) => id === null || id !== trackIds[index]
        )
      ) {
        throw new PlaylistSaveConflictError("PLAYLIST_CONTENTS_CHANGED");
      }

      progress.confirmedTrackCount = contents.trackIds.length;
      return await appendRemainingTracks(progress, trackIds, accessToken);
    } finally {
      activePlaylistIds.delete(progress.id);
    }
  }

  /** Dopisuje tylko niepotwierdzoną końcówkę i zachowuje aktualny postęp w razie błędu. */
  async function appendRemainingTracks(
    progress: PlaylistSaveProgress,
    selectedTrackIds: string[],
    accessToken: string
  ): Promise<SavedPlaylist> {
    try {
      for (
        let start = progress.confirmedTrackCount;
        start < selectedTrackIds.length;
        start += PLAYLIST_TRACKS_BATCH_SIZE
      ) {
        const trackIds = selectedTrackIds.slice(
          start,
          start + PLAYLIST_TRACKS_BATCH_SIZE
        );

        await addTracksToPlaylist(accessToken, progress.id, trackIds);
        progress.confirmedTrackCount += trackIds.length;
      }
    } catch (cause) {
      throw new PartialPlaylistSaveError(progress, cause);
    }

    return {
      id: progress.id,
      name: progress.name,
      spotifyUrl: progress.spotifyUrl,
      trackCount: progress.confirmedTrackCount,
    };
  }

  return { savePlaylist, resumePlaylist };
}

export { createPlaylistSaveService };
