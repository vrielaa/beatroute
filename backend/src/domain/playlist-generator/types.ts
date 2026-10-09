/**
 * Pomiary cech audio wykorzystywane przez generator playlist.
 * Wszystkie pola są obecne; null oznacza brak pomiaru, a nie wartość zero.
 * Typ number nie sprawdza zakresów wartości — odpowiada za to walidator danych.
 *
 * @property tempo - Tempo w BPM; dodatnia, skończona liczba albo null.
 * @property energy - Szacowana intensywność brzmienia w zakresie 0–1 albo null.
 * @property danceability - Szacowana przydatność do tańca w zakresie 0–1 albo null.
 * @property valence - Szacowana pozytywność brzmienia w zakresie 0–1 albo null.
 * @property acousticness - Szacowany charakter akustyczny w zakresie 0–1 albo null.
 * @property instrumentalness - Szacowany charakter instrumentalny w zakresie 0–1 albo null.
 * @property speechiness - Szacowany udział mowy w zakresie 0–1 albo null.
 * @property liveness - Szacowane prawdopodobieństwo wykonania na żywo w zakresie 0–1 albo null.
 */
type PlaylistAudioFeatures = {
  tempo: number | null;
  energy: number | null;
  danceability: number | null;
  valence: number | null;
  acousticness: number | null;
  instrumentalness: number | null;
  speechiness: number | null;
  liveness: number | null;
};

/**
 * Utwór z metadanymi i pomiarami, niezależny od źródła danych.
 * Ten sam model będzie używany dla pliku oraz danych pobranych z API.
 *
 * @property id - Niepusty identyfikator unikalny w zbiorze; nie musi pochodzić ze Spotify.
 * @property name - Niepusta nazwa utworu.
 * @property artists - Niepusta tablica niepustych nazw artystów.
 * @property audioFeatures - Osiem pomiarów wymaganych przez format, z null dla braków.
 */
type PlaylistTrack = {
  id: string;
  name: string;
  artists: string[];
  audioFeatures: PlaylistAudioFeatures;
};

/**
 * Zbiór utworów wejściowych generatora, zgodny z formatem pliku JSON.
 * Nie zawiera ustawień generatora — wymagania i preferencje wybiera użytkownik osobno.
 *
 * @property version - Wersja formatu; obecnie obsługiwana jest wyłącznie wartość 1.
 * @property tracks - Utwory z metadanymi i pomiarami cech audio.
 */
type PlaylistDataset = {
  version: 1;
  tracks: PlaylistTrack[];
};

/**
 * Dopuszczalny zakres tempa utworu w BPM. Obie granice są włączone.
 * Granice muszą być dodatnie i skończone, a minimum nie może przekraczać maksimum.
 * Poprawność wartości sprawdzi walidator wymagań, nie sam typ TypeScript.
 *
 * @property min - Najmniejsze dopuszczalne tempo w BPM.
 * @property max - Największe dopuszczalne tempo w BPM.
 */
type TempoRange = {
  min: number;
  max: number;
};

/**
 * Obowiązkowe warunki dopuszczenia utworu do playlisty, niezależne od preferencji.
 * Wszystkie pola są obecne; null wyłącza dany warunek. Utwór musi spełnić każdy
 * aktywny warunek. Brak potrzebnego pomiaru uniemożliwia spełnienie warunku.
 * Gdy wszystkie warunki są wyłączone, żaden utwór nie jest odrzucany na ich podstawie.
 *
 * @property tempoRange - Dopuszczalny zakres BPM albo null bez ograniczenia tempa.
 * @property maxSpeechiness - Maksymalny pomiar udziału mowy w skali 0–1 albo null bez ograniczenia.
 * @property maxLiveness - Maksymalny pomiar prawdopodobieństwa wykonania na żywo w skali 0–1 albo null bez ograniczenia.
 *
 * @example
 * { tempoRange: { min: 120, max: 140 }, maxSpeechiness: 0.33, maxLiveness: null }
 */
type PlaylistRequirements = {
  tempoRange: TempoRange | null;
  maxSpeechiness: number | null;
  maxLiveness: number | null;
};

export type {
  PlaylistAudioFeatures,
  PlaylistTrack,
  PlaylistDataset,
  TempoRange,
  PlaylistRequirements,
};
