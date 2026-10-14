/**
 * Plik JSON wskazujący utwory Spotify do przygotowania zbioru generatora.
 * Nie wymaga nazw, artystów ani pomiarów — te dane uzupełni aplikacja.
 * Walidacja przycina ID i usuwa duplikaty, zachowując kolejność pierwszych wystąpień.
 *
 * @property version - Wersja formatu pliku; obsługiwana jest wartość 1.
 * @property spotifyTrackIds - Identyfikatory utworów Spotify; plik zawiera od 1 do 500 wpisów.
 * Każdy ID ma 22 znaki: cyfry lub litery alfabetu łacińskiego, z rozróżnieniem wielkości liter.
 *
 * @example
 * { version: 1, spotifyTrackIds: ["3sNVsP50132BTNlImLx70i"] }
 */
type PlaylistTrackIdsFile = {
  version: 1;
  spotifyTrackIds: string[];
};

/**
 * Osiem pomiarów cech audio przyjmowanych przez generator playlist.
 * Wszystkie pola są wymagane; null oznacza brak pomiaru, a nie wartość zero.
 * Backend normalizuje pomiary podczas pobierania i waliduje je przed generowaniem.
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
 * Przygotowany zbiór metadanych i pomiarów analizowany przez generator.
 * Jest modelem wewnętrznym; format źródła danych opisuje osobny typ PlaylistTrackIdsFile.
 * Ustawienia generatora są przesyłane osobno, nie stanowią części zbioru.
 *
 * @property version - Wersja formatu danych; obsługiwana jest wyłącznie wartość 1.
 * @property tracks - Do 500 utworów z unikalnymi identyfikatorami; przygotowanie może zwrócić
 * pustą listę, ale żądanie generowania wymaga co najmniej jednego utworu.
 */
type PlaylistDataset = {
  version: 1;
  tracks: PlaylistTrack[];
};

/**
 * Utwór pominięty podczas pobierania danych, nie przez wymagania użytkownika.
 *
 * @property spotifyId - Identyfikator z pliku użytkownika.
 * @property reason - metadata-unavailable oznacza brak wymaganych metadanych Spotify;
 * audio-features-unavailable oznacza nieudany odczyt lub brak wszystkich użytecznych pomiarów.
 */
type SkippedPlaylistTrack = {
  spotifyId: string;
  reason: 'metadata-unavailable' | 'audio-features-unavailable';
};

/**
 * Utwór zachowany w zbiorze mimo częściowych braków cech audio.
 *
 * @property spotifyId - Identyfikator utworu w przygotowanym zbiorze.
 * @property missingFeatures - Nazwy pomiarów zapisanych jako null, nie jako zero.
 */
type IncompletePlaylistTrack = {
  spotifyId: string;
  missingFeatures: (keyof PlaylistAudioFeatures)[];
};

/**
 * Odpowiedź przygotowania danych na podstawie ID, zachowana do kolejnych analiz.
 * Zmiana kryteriów nie wymaga ponownego pobierania metadanych ani pomiarów.
 *
 * @property dataset - Zbiór generatora; pusta lista oznacza brak utworów do analizy.
 * @property skippedTracks - Pominięte identyfikatory z bezpiecznymi kodami przyczyn.
 * @property incompleteTracks - Zachowane utwory z informacją o brakujących pomiarach.
 */
type PreparedPlaylistDataset = {
  dataset: PlaylistDataset;
  skippedTracks: SkippedPlaylistTrack[];
  incompleteTracks: IncompletePlaylistTrack[];
};

/**
 * Postęp przygotowania bieżącego pliku, liczony wyłącznie z zakończonych partii.
 * Nie szacuje pracy wewnątrz trwającego żądania ani czasu pozostałego do końca.
 * Przetworzone ID obejmują zarówno przygotowane, jak i pominięte utwory.
 *
 * @property processedTracks - Liczba ID z partii, których odpowiedzi już otrzymano.
 * @property totalTracks - Liczba unikalnych ID w bieżącym pliku.
 * @property preparedTracks - Liczba utworów z metadanymi i użytecznymi pomiarami.
 * @property skippedTracks - Liczba utworów pominiętych podczas przygotowania danych.
 * @property completedBatches - Liczba zakończonych partii, także z pustym zbiorem.
 * @property totalBatches - Liczba partii potrzebnych do przygotowania całego pliku.
 */
type PlaylistPreparationProgress = {
  processedTracks: number;
  totalTracks: number;
  preparedTracks: number;
  skippedTracks: number;
  completedBatches: number;
  totalBatches: number;
};

/**
 * Etap procesu rozpoczętego przyciskiem generowania, nie licznik przetworzonych utworów.
 * preparation trwa do otrzymania metadanych i pomiarów; analysis obejmuje filtrowanie
 * oraz ranking; completed jest ustawiany dopiero po otrzymaniu wyniku generatora.
 */
type PlaylistGenerationStage = 'preparation' | 'analysis' | 'completed';

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
 * Nazwa i wybór utworów przekazywane do zapisu nowej, prywatnej playlisty Spotify.
 * Nie zawiera kryteriów, pomiarów, tokenu ani identyfikatora docelowej playlisty.
 * Backend niezależnie sprawdza nazwę, identyfikatory i uprawnienia sesji.
 *
 * @property name - Nazwa playlisty; po przycięciu musi zawierać od 1 do 100 znaków.
 * @property trackIds - Od 1 do 500 unikalnych, 22-znakowych Spotify ID.
 * Kolejność jest kolejnością zapisu; wybór Top N i ręczny przekazują ID według rankingu.
 */
type PlaylistToSave = {
  name: string;
  trackIds: string[];
};

/**
 * Potwierdzenie pełnego zapisu playlisty, zwracane przez backend ze statusem 201.
 * Nie opisuje częściowej awarii; ta trafia do kanału błędów żądania HTTP.
 *
 * @property id - Identyfikator nowo utworzonej playlisty Spotify.
 * @property name - Nazwa utworzonej playlisty zwrócona przez Spotify.
 * @property spotifyUrl - Odnośnik do playlisty umożliwiający jej otwarcie w Spotify.
 * @property trackCount - Liczba wybranych utworów, których dodanie potwierdzono po wszystkich partiach.
 */
type SavedPlaylist = {
  id: string;
  name: string;
  spotifyUrl: string;
  trackCount: number;
};

/**
 * Postęp zapisu zachowany, gdy playlista już istnieje, ale dodawanie utworów zawiodło.
 * Niepotwierdzona partia mogła zostać zapisana przed utratą odpowiedzi, więc liczniki
 * nie określają dokładnej zawartości playlisty. Przed kolejnym zapisem trzeba ją sprawdzić.
 *
 * @property id - Identyfikator utworzonej playlisty.
 * @property name - Nazwa utworzonej playlisty.
 * @property spotifyUrl - Odnośnik do istniejącej playlisty w Spotify.
 * @property confirmedTrackCount - Liczba utworów z potwierdzonych partii, również zero.
 * @property requestedTrackCount - Liczba utworów wybranych na początku operacji, od 1 do 500.
 */
type PlaylistSaveProgress = {
  id: string;
  name: string;
  spotifyUrl: string;
  confirmedTrackCount: number;
  requestedTrackCount: number;
};

/**
 * Sposób wyboru dopuszczonych utworów z gotowego rankingu do zapisu w Spotify.
 * top oznacza pierwsze N pozycji; manual oznacza konkretne utwory zaznaczone przez użytkownika.
 * Żaden tryb nie zmienia ocen, kolejności rankingu ani powodów odrzucenia.
 * Zapis wybranych utworów zawsze zachowuje kolejność otrzymanego rankingu.
 *
 * @example
 * 'top' — z rankingu 100 utworów wybieramy pierwsze 50 po ustawieniu N = 50.
 * 'manual' — wybieramy np. pozycje 2, 7 i 12, niezależnie od kolejności kliknięć.
 */
type PlaylistSelectionMode = 'top' | 'manual';

/**
 * Edytowane wartości formularza wyboru utworów z gotowego rankingu.
 * Nie są częścią kryteriów generatora ani pliku wejściowego.
 *
 * @property mode - Automatyczny wybór pierwszych N pozycji albo wybór ręczny.
 * @property topTrackCount - Liczba pierwszych pozycji albo null dla pustego pola;
 * wymaga walidacji w trybie top, a w trybie manual jest zachowana, ale nieaktywna.
 */
type PlaylistSelectionFormValues = {
  mode: PlaylistSelectionMode;
  topTrackCount: number | null;
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
  PlaylistTrackIdsFile,
  PlaylistAudioFeatures,
  PlaylistTrack,
  PlaylistDataset,
  SkippedPlaylistTrack,
  IncompletePlaylistTrack,
  PreparedPlaylistDataset,
  PlaylistPreparationProgress,
  PlaylistGenerationStage,
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
  PlaylistToSave,
  SavedPlaylist,
  PlaylistSaveProgress,
  PlaylistSelectionMode,
  PlaylistSelectionFormValues,
  PlaylistGeneratorRequest,
};
