import type { PlaylistSaveProgress } from "./types.js";

/**
 * Informuje, że playlista została utworzona, ale nie potwierdzono zapisu wszystkich utworów.
 * Dotyczy również błędu pierwszej partii, gdy confirmedTrackCount wynosi zero.
 * Nie określa wyniku niepotwierdzonej partii i nie uruchamia ponowienia ani usuwania playlisty.
 *
 * @property progress - Dane playlisty i liczniki potwierdzonego oraz żądanego zapisu.
 * @property cause - Pierwotny błąd, zachowany do diagnostyki i późniejszego mapowania HTTP.
 * Nie powinien być udostępniany w publicznej odpowiedzi API.
 */
class PartialPlaylistSaveError extends Error {
  public readonly progress: PlaylistSaveProgress;

  /**
   * @param progress - Stan operacji w chwili błędu; kopiowane są wyłącznie opisane pola.
   * @param cause - Przyczyna nieudanego lub niepotwierdzonego zapisu partii.
   */
  constructor(progress: PlaylistSaveProgress, cause: unknown) {
    super(
      "Nie potwierdzono zapisu wszystkich utworów. Sprawdź utworzoną playlistę przed ponownym zapisem.",
      { cause }
    );
    this.name = "PartialPlaylistSaveError";
    this.progress = {
      id: progress.id,
      name: progress.name,
      spotifyUrl: progress.spotifyUrl,
      confirmedTrackCount: progress.confirmedTrackCount,
      requestedTrackCount: progress.requestedTrackCount,
    };
  }
}

export { PartialPlaylistSaveError };
