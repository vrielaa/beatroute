/**
 * Osiem pomiarów cech audio przyjmowanych przez generator playlist.
 * Wszystkie pola są wymagane; null oznacza brak pomiaru, a nie wartość zero.
 * Typy nie walidują JSON-a ani zakresów liczb — robi to parser frontendu i niezależnie backend.
 *
 * @property tempo - Dodatnie tempo w BPM albo null przy braku pomiaru.
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
 * Metadane i pomiary utworu, niezależne od źródła danych.
 * Backend przycina teksty i nie zwraca dodatkowych pól wejściowych.
 *
 * @property id - Niepusty identyfikator unikalny w zbiorze; nie musi być identyfikatorem Spotify.
 * @property name - Niepusta nazwa utworu.
 * @property artists - Niepusta lista niepustych nazw artystów.
 * @property audioFeatures - Wszystkie osiem pomiarów, z null dla niedostępnych danych.
 */
type PlaylistTrack = {
  id: string;
  name: string;
  artists: string[];
  audioFeatures: PlaylistAudioFeatures;
};

/**
 * Zbiór wejściowy zgodny z wersją 1 formatu pliku JSON.
 * Ustawienia generatora są przesyłane osobno, nie stanowią części zbioru.
 *
 * @property version - Wersja formatu danych; obsługiwana jest wyłącznie wartość 1.
 * @property tracks - Od 1 do 500 utworów z unikalnymi identyfikatorami po przycięciu tekstów.
 */
type PlaylistDataset = {
  version: 1;
  tracks: PlaylistTrack[];
};

/**
 * Włączony zakres tempa w BPM, z obiema granicami włącznie.
 * Granice muszą być dodatnie i skończone, a minimum nie może przekraczać maksimum.
 *
 * @property min - Najmniejsze dopuszczalne tempo.
 * @property max - Największe dopuszczalne tempo.
 */
type TempoRange = {
  min: number;
  max: number;
};

/**
 * Obowiązkowe warunki dopuszczenia utworu do wynikowej playlisty.
 * Wszystkie pola są obecne; null wyłącza warunek, a zero jest aktywnym maksimum.
 * Brak pomiaru potrzebnego do aktywnego warunku powoduje odrzucenie utworu.
 *
 * @property tempoRange - Zakres BPM albo null bez ograniczenia tempa.
 * @property maxSpeechiness - Maksymalny pomiar udziału mowy w zakresie 0–1 albo null.
 * @property maxLiveness - Maksymalny pomiar prawdopodobieństwa wykonania na żywo w zakresie 0–1 albo null.
 *
 * @example
 * { tempoRange: { min: 120, max: 140 }, maxSpeechiness: 0.33, maxLiveness: null }
 */
type PlaylistRequirements = {
  tempoRange: TempoRange | null;
  maxSpeechiness: number | null;
  maxLiveness: number | null;
};

/** Preferowany poziom cechy: low — niski, medium — średni, high — wysoki. */
type PlaylistPreferenceLevel = 'low' | 'medium' | 'high';

/**
 * Preferencje wpływające na kolejność dopuszczonych utworów, nie na ich odrzucenie.
 * Wszystkie pola są obecne; null oznacza „Bez znaczenia”.
 *
 * @property energy - Preferowany poziom energii.
 * @property danceability - Preferowany poziom taneczności.
 * @property valence - Preferowany poziom pozytywnego nastroju.
 * @property acousticness - Preferowany poziom akustyczności.
 * @property instrumentalness - Preferowany poziom instrumentalności.
 */
type PlaylistPreferences = {
  energy: PlaylistPreferenceLevel | null;
  danceability: PlaylistPreferenceLevel | null;
  valence: PlaylistPreferenceLevel | null;
  acousticness: PlaylistPreferenceLevel | null;
  instrumentalness: PlaylistPreferenceLevel | null;
};

/**
 * Sprawdzone ustawienia generatora, niezależne od zbioru utworów.
 * Formularz nie tworzy tych ustawień, dopóki aktywne wymagania są niepoprawne.
 *
 * @property requirements - Obowiązkowe warunki dopuszczenia utworu; null wyłącza dany warunek.
 * @property preferences - Poziomy pięciu cech ustalające ranking; null oznacza „Bez znaczenia”.
 */
type PlaylistCriteria = {
  requirements: PlaylistRequirements;
  preferences: PlaylistPreferences;
};

/** Nazwa jednej z pięciu cech ocenianych według preferencji użytkownika. */
type PlaylistPreferenceFeature = keyof PlaylistPreferences;

/**
 * Ocena jednej aktywnej preferencji zwrócona przez backend.
 * Wyłączona preferencja nie tworzy wpisu. Brak pomiaru oznacza null zarówno
 * w measurement, jak i match; dopasowanie zero jest poprawną oceną.
 *
 * @property feature - Oceniana cecha audio.
 * @property level - Preferowany poziom wybrany przez użytkownika.
 * @property measurement - Pomiar cechy w zakresie 0–1 albo null.
 * @property match - Dopasowanie w zakresie 0–1 albo null przy braku pomiaru.
 *
 * @example
 * { feature: 'energy', level: 'high', measurement: 0.75, match: 1 }
 */
type PlaylistFeatureMatch = {
  feature: PlaylistPreferenceFeature;
  level: PlaylistPreferenceLevel;
  measurement: number | null;
  match: number | null;
};

/**
 * Utwór z oceną preferencji i jej wyjaśnieniem, otrzymany w wynikowym rankingu.
 * Ocena jest niezaokrągloną średnią dostępnych dopasowań o jednakowych wagach,
 * nie prawdopodobieństwem polubienia utworu. Kompletność wynika z liczby ocen
 * innych niż null względem liczby wpisów w featureMatches.
 *
 * @property track - Oceniony utwór ze znormalizowanymi metadanymi i pomiarami.
 * @property overallMatch - Wynik 0–1 albo null bez aktywnych preferencji lub dostępnych pomiarów.
 * @property featureMatches - Wszystkie aktywne preferencje, także te bez pomiarów;
 * pusta lista oznacza wyłączenie wszystkich preferencji.
 */
type PlaylistTrackEvaluation = {
  track: PlaylistTrack;
  overallMatch: number | null;
  featureMatches: PlaylistFeatureMatch[];
};

/**
 * Przyczyna niespełnienia jednego aktywnego wymagania przez utwór.
 * Kod jest identyfikatorem do przygotowania komunikatu w UI, nie gotowym tekstem.
 *
 * @property feature - Cecha objęta niespełnionym wymaganiem.
 * @property code - missing-measurement: brak pomiaru; outside-range: tempo poza zakresem;
 * above-maximum: speechiness lub liveness większe niż dopuszczalne maksimum.
 *
 * @example
 * { feature: 'tempo', code: 'outside-range' }
 */
type PlaylistTrackRejectionReason =
  | {
      feature: 'tempo' | 'speechiness' | 'liveness';
      code: 'missing-measurement';
    }
  | {
      feature: 'tempo';
      code: 'outside-range';
    }
  | {
      feature: 'speechiness' | 'liveness';
      code: 'above-maximum';
    };

/**
 * Utwór niedopuszczony do playlisty przez obowiązkowe wymagania.
 *
 * @property track - Utwór ze znormalizowanymi metadanymi i pomiarami.
 * @property reasons - Niepusta lista wszystkich powodów odrzucenia.
 */
type RejectedPlaylistTrack = {
  track: PlaylistTrack;
  reasons: PlaylistTrackRejectionReason[];
};

/**
 * Odpowiedź endpointu generatora; nie oznacza utworzenia playlisty w Spotify.
 * Każdy utwór wejściowy znajduje się w jednej grupie. Każda grupa może być pusta.
 *
 * @property rankedTracks - Dopuszczone utwory w kolejności malejącej oceny; null na końcu,
 * remisy rozstrzyga średnia bliskość dostępnych pomiarów do wybranych poziomów.
 * Przy równych obu ocenach lub braku aktywnych preferencji zachowana jest kolejność źródłowa.
 * @property rejectedTracks - Odrzucone utwory z powodami, w kolejności źródłowej.
 */
type GeneratedPlaylist = {
  rankedTracks: PlaylistTrackEvaluation[];
  rejectedTracks: RejectedPlaylistTrack[];
};

/**
 * Body żądania POST /api/playlist-generator/generate.
 * Nie zawiera tokenów dostawców; generator analizuje przesłane pomiary.
 *
 * @property dataset - Zbiór wejściowy zgodny z wersją 1 formatu.
 * @property requirements - Obowiązkowe warunki dopuszczenia utworów.
 * @property preferences - Poziomy cech określające ranking dopuszczonych utworów.
 */
type PlaylistGeneratorRequest = {
  dataset: PlaylistDataset;
  requirements: PlaylistRequirements;
  preferences: PlaylistPreferences;
};

export type {
  PlaylistAudioFeatures,
  PlaylistTrack,
  PlaylistDataset,
  TempoRange,
  PlaylistRequirements,
  PlaylistPreferenceLevel,
  PlaylistPreferences,
  PlaylistCriteria,
  PlaylistPreferenceFeature,
  PlaylistFeatureMatch,
  PlaylistTrackEvaluation,
  PlaylistTrackRejectionReason,
  RejectedPlaylistTrack,
  GeneratedPlaylist,
  PlaylistGeneratorRequest,
};
