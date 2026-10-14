/**
 * Zatrzymuje wznowienie, gdy trwa inny zapis lub zawartość playlisty nie odpowiada wyborowi.
 * Nie przechowuje odpowiedzi Spotify, tokenu ani identyfikatorów utworów.
 *
 * @property code - Publiczna przyczyna konfliktu zapisu.
 */
class PlaylistSaveConflictError extends Error {
  constructor(
    public readonly code:
      "PLAYLIST_SAVE_IN_PROGRESS" | "PLAYLIST_CONTENTS_CHANGED"
  ) {
    super(
      code === "PLAYLIST_SAVE_IN_PROGRESS"
        ? "Zapis tej playlisty już trwa"
        : "Zawartość playlisty została zmieniona. Wznowienie zatrzymane."
    );
    this.name = "PlaylistSaveConflictError";
  }
}

export { PlaylistSaveConflictError };
