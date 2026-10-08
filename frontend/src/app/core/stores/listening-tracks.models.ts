/**
 * Stan pobierania utworów i ich analizy. Pusty wynik jest odróżniony od awarii.
 * `tracks-error` oznacza błąd Spotify, a `audio-error` błąd pobierania analizy
 * dla utworów, które zostały już pobrane.
 */
type ListeningTracksLoadState =
  | 'loading'
  | 'ready'
  | 'no-tracks'
  | 'no-audio-features'
  | 'tracks-error'
  | 'audio-error';

/**
 * Kompletność zbioru utworów i dostępność ich cech audio.
 *
 * @property requestedTracksCount - Liczba utworów wybrana przez użytkownika.
 * @property spotifyTotalTracksCount - Liczba utworów dostępnych według Spotify.
 * @property returnedTracksCount - Liczba utworów otrzymanych ze Spotify.
 * @property audioDataTracksCount - Liczba odczytów cech audio; null przed otrzymaniem analizy.
 */
interface TracksFoundRatio {
  requestedTracksCount: number;
  spotifyTotalTracksCount: number;
  returnedTracksCount: number;
  audioDataTracksCount: number | null;
}

export type { ListeningTracksLoadState, TracksFoundRatio };
