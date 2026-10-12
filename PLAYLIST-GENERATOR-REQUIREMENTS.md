# Ustalenia generatora playlist

Uzgodnione 8 października 2026 r., format importu zmieniony 11 października 2026 r.
Dokument opisuje uzgodnione wymagania i stan ich wdrożenia. Funkcje docelowe,
które nie są jeszcze dostępne, są oznaczone w opisie. Projekt jest pracą inżynierską;
rozwiązanie ma być czytelne, testowalne i bez zbędnych warstw infrastruktury.

## Źródła danych

Docelowo użytkownik wybiera jedno z trzech źródeł:

1. Plik JSON zawierający wyłącznie identyfikatory utworów Spotify.
   Użytkownik nie dostarcza nazw, artystów, okładek ani pomiarów cech audio.
   Aplikacja uzupełnia dane z API przed uruchomieniem generatora.
2. Zapisane utwory zalogowanego użytkownika Spotify.
3. Playlista Spotify należąca do użytkownika lub przez niego współtworzona.

Wszystkie źródła dostarczają utwory do przygotowania wspólnego PlaylistDataset.
Filtrowanie i ranking działają na tym zbiorze, niezależnie od źródła danych.
Wybór pliku tylko odczytuje i sprawdza ID lokalnie. Metadane i pomiary pobieramy
dopiero po kliknięciu „Generuj playlistę”. Udane przygotowanie zachowujemy w pamięci;
kolejne generowania dla innych kryteriów korzystają z tego samego zbioru, bez ponownego
pobierania danych z API. Zmiana kryteriów nie uruchamia procesu automatycznie.

## Format pliku wejściowego

Plik jest zapisany jako JSON w kodowaniu UTF-8. Wymagane są tylko pola version
i spotifyTrackIds. Przykład: [playlist-track-ids.json](examples/playlist-track-ids.json).

```json
{
  "version": 1,
  "spotifyTrackIds": ["3sNVsP50132BTNlImLx70i", "4U4LEUWV8sFtos5PdjfDA7"]
}
```

- version ma wartość liczbową 1 i opisuje wersję formatu, nie wersję aplikacji.
- spotifyTrackIds jest tablicą od 1 do 500 wpisów; limit dotyczy pliku przed usunięciem duplikatów.
- Każdy wpis jest ID utworu Spotify złożonym z 22 liter alfabetu łacińskiego lub cyfr.
- Przycinamy teksty i usuwamy duplikaty, zachowując kolejność pierwszych wystąpień.
- Wielkość liter ma znaczenie; identyfikatorów nie zmieniamy na małe litery.
- Nie przyjmujemy adresów URL ani URI spotify:track: w miejsce ID.
- Poprawny format ID nie potwierdza istnienia utworu ani dostępności jego pomiarów.
- Dodatkowe pola nie trafiają do wyniku walidacji.
- Wymagania i preferencje użytkownik wybiera osobno w formularzu.

Typ PlaylistTrackIdsFile znajduje się w backend/src/application/playlist-generator/types.ts
i w frontendowym playlist-generator.models.ts. Frontendowy parsePlaylistTrackIdsFile
w playlist-track-ids.parser.ts oraz backendowy walidator w track-ids.validator.ts
niezależnie sprawdzają format. Nie wykonują wywołań API.

### Etapy przejścia na import ID

1. Format, typy i walidacja pliku z ID, z testami — przygotowane.
2. Serwis aplikacyjny uzupełniający metadane i pomiary, z informacją o brakach i testami — przygotowany.
3. Autoryzowany endpoint przygotowania zbioru, testy HTTP i opis w OpenAPI — przygotowane.
4. Podłączenie importu ID w UI, z pobieraniem danych tylko raz i testami — przygotowane.
5. Końcowa weryfikacja przepływu, porządki oraz aktualizacja README i przegląd OpenAPI.

Interfejs przyjmuje plik z samymi ID. Poprzedni format z tracks i audioFeatures
nie jest już formatem importu w UI; pozostaje wewnętrznym modelem generatora.

### Przygotowanie zbioru z ID

Serwis createPlaylistDatasetService w
backend/src/application/playlist-generator/playlist-dataset.service.ts przyjmuje dwie
jawne zależności: odczyt metadanych pojedynczego utworu Spotify i odczyt cech
audio wskazanych ID. Nie importuje produkcyjnych klientów ani konfiguracji.
Produkcyjne zależności są składane w http/routes/playlist-generator/composition.ts.
Przygotowanie zbioru jest dostępne przez API i uruchamiane przyciskiem generowania w UI.

Metoda prepareDataset przyjmuje zwalidowany PlaylistTrackIdsFile i token Spotify.
Pobiera metadane po kolei, a cechy tylko dla utworów z nazwą i co najmniej jednym
wykonawcą. Zapytania o cechy dzieli na porcje do 40 ID, aby ograniczyć długość
adresu żądania. To ograniczenie wielkości porcji, nie zastępstwo schedulera HTTP
kontrolującego tempo i równoległość. Wyniki łączy po spotifyId, a nie po kolejności
odpowiedzi. Zachowuje identyfikatory i kolejność wejściową.

Wynik PreparedPlaylistDataset zawiera:

- dataset — metadane i osiem pomiarów gotowych do filtrowania i rankingu;
- skippedTracks — pominięte ID z kodem metadata-unavailable (404 lub brak
  wymaganych metadanych) albo audio-features-unavailable (nieudany odczyt
  pojedynczego utworu lub brak wszystkich ośmiu użytecznych pomiarów);
- incompleteTracks — zachowane utwory z listą brakujących pomiarów.

Niepoprawny pomiar staje się null, nie zerem. Częściowe braki nie usuwają utworu:
generator nadal rozstrzyga, czy brakuje pomiaru potrzebnego do aktywnego wymagania.
Zero w skali 0–1 pozostaje poprawną wartością. Pominięcie przy pobieraniu danych
jest czymś innym niż odrzucenie przez wymagania użytkownika.

Błędy całych zapytań, w tym problemy z tokenem, limit API lub brak połączenia,
przerywają przygotowanie i są przekazywane do obsługi błędów. Nie zastępujemy ich
pustym wynikiem. Jeśli wszystkie odczyty zakończą się brakami pojedynczych utworów,
dataset.tracks jest pusty; UI wyświetla wtedy informację o brakach zamiast
wywoływać generator. Surowe komunikaty dostawcy i token nie trafiają do wyniku.

Testy serwisu używają atrap źródeł, bez zewnętrznych API. Sprawdzają format zbioru,
łączenie po ID, kolejność, porcje do 40 ID, normalizację pomiarów, częściowe braki,
pomijanie niedostępnych utworów, propagowanie awarii i brak modyfikacji wejścia.

### Endpoint przygotowania zbioru

POST /api/playlist-generator/prepare-dataset przyjmuje bezpośrednio plik JSON
z polami version i spotifyTrackIds. Wymaga aktywnej sesji Spotify; middleware
odnawia wygasający token przed wywołaniem serwisu. Token jest odczytywany z sesji,
nie z body. Walidacja ID odbywa się przed odczytem danych z API.

Odpowiedź 200 zawiera PreparedPlaylistDataset: dataset, skippedTracks oraz
incompleteTracks. Może zawierać pusty zbiór, jeżeli żaden utwór nie ma użytecznych
danych. Błędy walidacji, parsera i integracji trafiają do wspólnego middleware;
limit Retry-After jest przekazywany także w nagłówku odpowiedzi. Parser JSON
tego routera nadal ma limit 1 MiB, a pozostałe endpointy 100 KiB.

POST /api/playlist-generator/generate pozostaje osobnym endpointem: przyjmuje
pełny dataset, requirements i preferences, nie wymaga sesji i nie wywołuje API.
Po zmianie kryteriów kolejne kliknięcie generowania wywołuje tylko /generate,
jeżeli zbiór został już przygotowany. Sama edycja formularza nie wywołuje API.
Testy HTTP sprawdzają prawdziwą sesję Express, autoryzację i odświeżanie tokenu,
walidację, limity parsera, przekazanie wyników oraz wspólny format błędów.

### Import i ponowienie w UI

Komponent odczytuje plik i sprawdza ID lokalnie, bez wywołań API. Po poprawnym
imporcie udostępnia formularz kryteriów. Dopiero „Generuj playlistę” wywołuje
prepare-dataset, zachowuje PreparedPlaylistDataset w pamięci i wysyła /generate.
Kolejne kliknięcia korzystają z zachowanego zbioru. Zmiana kryteriów nie odczytuje
pliku ani nie pobiera ponownie metadanych i pomiarów.
Nowy wybór pliku usuwa poprzedni zbiór i wynik; anulowanie wyboru ich nie zmienia.

Awaria API wyświetla komunikat; przycisk generowania pozwala ponowić proces dla
zapamiętanych ID, bez ponownego wyboru pliku. Udane przygotowanie pozostaje
dostępne także po błędzie analizy. Pusty zbiór jest poprawną odpowiedzią, ale blokuje
generowanie. Pominięte ID i brakujące pomiary są pokazane w osobnych listach.
Wymiana pliku lub zniszczenie komponentu anuluje oczekiwanie na odpowiedź HTTP;
nie oznacza to gwarancji zatrzymania pracy już rozpoczętej przez backend.

Testy frontendu sprawdzają żądanie i cookie sesji, walidację importu, ponowienie,
braki danych, komunikaty HTTP, anulowanie oraz ponowne użycie zbioru dla kryteriów.
W testach odpowiedzi API są zastępowane przez HttpTestingController, bez zapytań
do Spotify lub ReccoBeats.

### Widoczny postęp generowania

PlaylistGenerationProgress pojawia się dopiero po kliknięciu generowania i pokazuje:

1. Pobieranie danych — metadane Spotify i cechy audio ReccoBeats w jednym żądaniu przygotowania.
2. Analiza i ranking — sprawdzenie wymagań oraz ocena preferencji przez /generate.
3. Gotowy wynik — ustawiany dopiero po otrzymaniu odpowiedzi generatora.

Licznik 1/3, 2/3 lub 3/3 opisuje etap procesu, nie liczbę utworów ani procent
pozostałego czasu. Etapy zmieniają się po odpowiedziach API, nie według zegara.
Przy zachowanym zbiorze pobieranie jest już ukończone, więc proces zaczyna się od analizy.
Awaria lub pusty zbiór zatrzymują animację bez pokazywania pełnego ukończenia.
Zmiana pliku lub kryteriów usuwa poprzedni postęp i anuluje oczekiwanie na wynik.
Animacja uwzględnia prefers-reduced-motion, a etap jest ogłaszany przez role=status.

## Wewnętrzny zbiór generatora

PlaylistDataset zawiera już metadane i pomiary. Użytkownik nie musi przygotowywać
takiego JSON-a; zbiór jest budowany przez aplikację po odczycie ID.
Przykład z sześcioma fikcyjnymi utworami i syntetycznymi pomiarami:
[playlist-dataset.json](examples/playlist-dataset.json). Pozostaje materiałem testowym
do sprawdzania algorytmu bez API, nie docelowym formatem pliku użytkownika.

```json
{
  "version": 1,
  "tracks": [
    {
      "id": "track-001",
      "name": "Przykładowy utwór",
      "artists": ["Przykładowy artysta"],
      "audioFeatures": {
        "tempo": 128,
        "energy": 0.8,
        "danceability": 0.75,
        "valence": 0.6,
        "acousticness": 0.2,
        "instrumentalness": 0.05,
        "speechiness": 0.04,
        "liveness": null
      }
    }
  ]
}
```

- `version` ma wartość 1 i opisuje wersję formatu, nie wersję aplikacji.
- `tracks` przekazane do generatora zawiera od 1 do 500 utworów. Przygotowanie
  danych może zwrócić pustą tablicę, której nie wysyłamy do generatora.
  `id` jest niepusty i unikalny w zbiorze.
- `name` jest niepustym tekstem, a `artists` niepustą tablicą niepustych nazw.
- Wszystkie osiem pól `audioFeatures` musi istnieć. Wartość null oznacza brak pomiaru.
- `tempo` jest dodatnią, skończoną liczbą BPM albo null.
- Pozostałe siedem cech jest skończoną liczbą od 0 do 1 albo null.
- Liczba 0 jest poprawnym pomiarem cech w skali 0–1, nie oznacza braku danych.
- Zbiór nie zawiera wymagań ani preferencji; użytkownik wybiera je w formularzu.
- Walidator przycina identyfikatory, nazwy utworów i artystów. Duplikaty
  identyfikatorów sprawdza po przycięciu. Dodatkowe pola nie trafiają do wyniku.

Typy domenowe znajdują się w `backend/src/domain/playlist-generator/types.ts`:
`PlaylistAudioFeatures`, `PlaylistTrack` i `PlaylistDataset`. Typy TypeScript nie
walidują odczytanego JSON-a. Zbiór sprawdza funkcja `parsePlaylistGeneratorDataset`
w `backend/src/http/routes/playlist-generator/dataset.validator.ts`, pokryta
testami w sąsiednim pliku. Filtrowanie, ocena i ranking są już dostępne jako funkcje
domenowe, połączone przez generatePlaylist i udostępnione przez endpoint generatora.
Walidatory są podłączone do HTTP. Import ID, formularz i prezentacja wyników
są dostępne w UI; przygotowanie pełnego zbioru opisano wyżej.

Przykład obejmuje utwory o różnej energii, tempo poza zakresem 120–140 i obie jego
granice, pomiar liveness 0,9, wartości zero oraz brakujące pomiary. Pozwoli sprawdzić
filtry i ranking bez kontaktu z API przez gotowy endpoint HTTP.

## Wymagania obowiązkowe i preferencje

Wymagania odpowiadają na pytanie: „Czy utwór może trafić na playlistę?”.
Preferencje odpowiadają na pytanie: „Który z dopuszczonych utworów pasuje bardziej?”.

| Cecha            | Ustawienie                               | Działanie                        |
| ---------------- | ---------------------------------------- | -------------------------------- |
| tempo            | Liczbowy zakres BPM                      | Obowiązkowy filtr, jeśli aktywny |
| speechiness      | Opcjonalna maksymalna wartość            | Obowiązkowy filtr, jeśli aktywny |
| liveness         | Opcjonalna maksymalna wartość            | Obowiązkowy filtr, jeśli aktywny |
| energy           | Niska / średnia / wysoka / bez znaczenia | Preferencja rozmyta              |
| danceability     | Niska / średnia / wysoka / bez znaczenia | Preferencja rozmyta              |
| valence          | Niska / średnia / wysoka / bez znaczenia | Preferencja rozmyta              |
| acousticness     | Niska / średnia / wysoka / bez znaczenia | Preferencja rozmyta              |
| instrumentalness | Niska / średnia / wysoka / bez znaczenia | Preferencja rozmyta              |

- Utwór musi spełnić wszystkie aktywne wymagania. Granice zakresów są włączone.
- Brak pomiaru potrzebnego do obowiązkowego wymagania uniemożliwia jego spełnienie.
- Preferencje określają kolejność dopuszczonych utworów; same ich nie odrzucają.
- „Bez znaczenia” wyłącza wpływ danej preferencji na ranking.
- Bez aktywnych preferencji zachowujemy kolejność źródłową.
- Stopień dopasowania rozmytego nie jest prawdopodobieństwem polubienia utworu.
- `null` oznacza brak pomiaru, a nie wartość zero. Ocena korzysta ze średniej
  dostępnych dopasowań i zachowuje informację o brakujących pomiarach.
- Ścisłe minimum energii, np. 0,7, byłoby dodatkowym wymaganiem liczbowym, a nie
  znaczeniem preferencji „wysoka energia”. Nie należy utożsamiać tych ustawień.

Przykład: wymagane BPM 120–140, preferowana wysoka energia.
Utwór 130 BPM / energia 0,9 może być wyżej niż 125 BPM / energia 0,5.
Oba są dopuszczone. Utwór 100 BPM / energia 0,95 odpada mimo wysokiej energii.

### Model obowiązkowych wymagań

Typ `PlaylistRequirements` w `backend/src/domain/playlist-generator/types.ts`
opisuje warunki filtrowania. Typ `TempoRange` opisuje dwie granice BPM:

```json
{
  "tempoRange": { "min": 120, "max": 140 },
  "maxSpeechiness": 0.33,
  "maxLiveness": null
}
```

W tym przykładzie dopuszczamy BPM 120–140 i speechiness nie większe niż 0,33.
Nie ograniczamy liveness. Wszystkie trzy pola muszą istnieć w znormalizowanym
modelu; null wyłącza warunek. Granice BPM są dodatnie i skończone, a minimum
nie może przekraczać maksimum. Maksima speechiness i liveness należą do zakresu
0–1. Ich granice są włączone; zero jest aktywnym ograniczeniem, nie wyłączeniem.
Przy wszystkich warunkach ustawionych na null wymagania nie odrzucają utworów.

To osobny model, nie część pliku z utworami ani model preferencji rozmytych.
Wymagania sprawdza funkcja `parsePlaylistGeneratorRequirements` w
`backend/src/http/routes/playlist-generator/requirements.validator.ts`, pokryta
testami w sąsiednim pliku. Wymaga obecności wszystkich trzech pól, odrzuca
niepoprawne wartości i zwraca nowy obiekt bez dodatkowych pól wejściowych.
Sam walidator nie ocenia utworów. Jest podłączony do endpointu generatora,
a wymagania użytkownik wybiera w formularzu frontendu.

### Model wyniku filtrowania

W `backend/src/domain/playlist-generator/types.ts` dodano trzy typy opisujące
wynik filtrowania:

- `PlaylistTrackRejectionReason`: cecha (`feature`) i kod przyczyny (`code`).
- `RejectedPlaylistTrack`: utwór (`track`) i niepusta lista przyczyn (`reasons`).
- `PlaylistTrackSelection`: dopuszczone utwory (`acceptedTracks`) i odrzucone
  utwory z przyczynami (`rejectedTracks`), przed wykonaniem rankingu.

Kody przyczyn mają następujące znaczenie:

| Kod                 | Dopuszczalne cechy           | Znaczenie                                     |
| ------------------- | ---------------------------- | --------------------------------------------- |
| missing-measurement | tempo, speechiness, liveness | Brak pomiaru potrzebnego do aktywnego warunku |
| outside-range       | tempo                        | Tempo poniżej minimum lub powyżej maksimum    |
| above-maximum       | speechiness, liveness        | Pomiar większy niż ustawione maksimum         |

Przykładowa przyczyna: `{ "feature": "tempo", "code": "outside-range" }`.
Domena zwraca kod, a interfejs przygotuje komunikat dla użytkownika. Wyłączony
warunek nie tworzy powodu odrzucenia, również przy braku jego pomiaru.
Każdy utwór należy do jednej grupy; obie zachowują kolejność źródłową. Każda
grupa może być pusta. Dla odrzuconego utworu zbieramy wszystkie powody, zamiast
przerywać sprawdzanie po pierwszym niespełnionym wymaganiu.

Funkcja `filterPlaylistTracks` w `backend/src/domain/playlist-generator/filter-tracks.ts`
wykonuje ten podział dla wcześniej zwalidowanych utworów i wymagań. Jej testy
sprawdzają granice, brakujące pomiary, wyłączone warunki, kompletność powodów
odrzucenia i zachowanie kolejności. Funkcja nie modyfikuje wejścia, nie wywołuje
API i zwraca referencje do utworów źródłowych. Generator jest podłączony do
endpointu, a UI udostępnia formularz i pokazuje ranking oraz powody odrzucenia.

### Preferencje rozmyte i ocena pojedynczego utworu

`PlaylistPreferences` zawiera pięć pól: energy, danceability, valence,
acousticness i instrumentalness. Każde ma wartość low, medium, high albo null,
które oznacza „Bez znaczenia”. Wszystkie pola są obecne w modelu domenowym.
Sprawdza je parsePlaylistGeneratorPreferences w
`backend/src/http/routes/playlist-generator/preferences.validator.ts`, pokryty
testami w sąsiednim pliku. Walidator wymaga wszystkich pięciu własnych pól
obiektu i przyjmuje wyłącznie dokładne wartości low, medium, high albo null.
Brak pola, undefined, wartości liczbowe, tablice i inne poziomy są odrzucane.
Nie przycina tekstów ani nie zmienia wielkości liter. Zwraca nowy obiekt bez
dodatkowych pól i nie modyfikuje wejścia. Jest podłączony do endpointu generatora.

Funkcja `calculatePreferenceMatch` w `preference-match.ts` wyznacza dopasowanie
pojedynczego pomiaru do preferowanego poziomu:

- low: dopasowanie 1 do pomiaru 0,25, następnie liniowy spadek do 0 przy 0,5;
- medium: dopasowanie 0 do 0,25, liniowy wzrost do 1 przy 0,5, następnie
  liniowy spadek do 0 przy 0,75; powyżej tej granicy dopasowanie pozostaje 0;
- high: dopasowanie 0 do pomiaru 0,5, następnie liniowy wzrost do 1 przy 0,75
  i dopasowanie 1 dla większych pomiarów.

Progi są przyjętymi parametrami projektu, nie uniwersalnymi definicjami cech
muzycznych. Funkcja działa dla wcześniej zwalidowanych pomiarów w zakresie 0–1.

Funkcja `evaluatePlaylistTrack` w `backend/src/domain/playlist-generator/evaluate-track.ts`
ocenia jeden zwalidowany utwór względem aktywnych preferencji. Zwraca
`PlaylistTrackEvaluation`: utwór, overallMatch i featureMatches.

- Wyłączone preferencje nie tworzą wpisów i nie wpływają na średnią.
- Każda aktywna preferencja tworzy wpis `PlaylistFeatureMatch`: cecha, poziom,
  pomiar i dopasowanie. Brak pomiaru oznacza null zarówno w measurement, jak i match.
- overallMatch jest niezaokrągloną średnią dostępnych dopasowań o jednakowych wagach.
  Dopasowanie 0 jest uwzględniane w średniej; null nie jest zastępowane zerem.
- Bez aktywnych preferencji wynik jest null, a lista ocen pusta.
- Przy braku wszystkich potrzebnych pomiarów wynik jest null, ale lista zachowuje
  aktywne preferencje i informację o brakujących pomiarach.

Przykład: preferowana wysoka energia i taneczność oraz średnia walencja.
Energia 0,7 daje dopasowanie 0,8, taneczność 0,65 daje 0,6, a brak walencji
pozostaje nieoceniony. Średnia wynosi 0,7; oceniono 2 z 3 aktywnych preferencji.
Kompletność wynika z liczby niepustych dopasowań względem długości featureMatches.
Średnie obliczone z różnej liczby pomiarów nie zapewniają jednakowej kompletności;
interfejs powinien pokazywać te braki. rankPlaylistTracks sortuje oceny malejąco
i umieszcza null za ocenami liczbowymi (również za zerem). Przy dokładnie równych
ocenach liczbowych porównuje średnią bliskość dostępnych pomiarów do wybranych poziomów:

- high: bliskość równa pomiarowi;
- low: bliskość równa `1 - pomiar`;
- medium: bliskość równa `1 - 2 * abs(pomiar - 0.5)`.

Każda aktywna preferencja z pomiarem ma równą wagę. Wyłączone preferencje i null
są pomijane, a zero jest pomiarem. Gdy obie oceny są równe, pozostaje kolejność
źródłowa; to samo dotyczy utworów bez oceny. Rozstrzygnięcie remisu nie zmienia
overallMatch ani dopasowań poszczególnych cech. Nie porównujemy procentów
zaokrąglonych przez interfejs. generatePlaylist najpierw filtruje wymagania, a dopiero potem
ocenia i sortuje dopuszczone utwory; odrzucone nie mogą wrócić do rankingu.

Obie funkcje mają testy jednostkowe. Ocena nie zmienia wejścia, nie filtruje ani
nie sortuje utworów i nie wywołuje API. Wynik zachowuje referencję do utworu źródłowego.

## Endpoint generatora

`POST /api/playlist-generator/generate` przyjmuje JSON z trzema wymaganymi polami:
dataset, requirements i preferences. Każde pole sprawdza osobny walidator,
a następnie generatePlaylist filtruje zbiór i porządkuje dopuszczone utwory.
Opis żądania, odpowiedzi i przykład są dostępne w OpenAPI pod `/api-docs`.

- 200: rankedTracks z ocenami i wyjaśnieniami oraz rejectedTracks z powodami.
  Gdy wszystkie utwory są odrzucone, rankedTracks jest pustą tablicą — nadal jest to 200.
- 400: VALIDATION_ERROR dla brakujących lub niepoprawnych danych albo INVALID_JSON
  dla niepoprawnej składni JSON-a.
- 413: PAYLOAD_TOO_LARGE, gdy JSON przekracza 1 MiB (1 048 576 bajtów).
- 500: INTERNAL_SERVER_ERROR dla nieoczekiwanych błędów, bez ujawniania szczegółów.

Parser 1 MiB dla `/api/playlist-generator` działa przed globalnym parserem 100 KiB,
więc pozostałe endpointy zachowują mniejszy limit. Endpoint nie wymaga sesji Spotify,
nie pobiera danych z API, nie odczytuje plików i nie zapisuje playlisty na koncie Spotify.
Testy Supertest korzystają z rzeczywistego createApp i sprawdzają również parsery,
brak body, walidację i wynik generowania. Import ID i formularz są dostępne
w UI; eksport wyniku pozostaje do wdrożenia.

## Wynik i zakres pierwszej wersji

- Przy każdym wyniku pokazujemy pomiary, spełnione wymagania i uzasadnienie rankingu.
- Wynik można zapisać do pliku JSON; nie chodzi o pobieranie nagrań.
- Automatyczne tworzenie playlisty na koncie Spotify nie jest wymaganiem pierwszej wersji.
- `key`, `mode`, `timeSignature` i `loudness` nie są kryteriami pierwszej wersji generatora.
- Progi speechiness i liveness ograniczają pomiary, nie gwarantują braku wokalu
  ani braku wykonania koncertowego.
- Najpierw wdrażamy i testujemy filtrowanie, następnie ranking rozmyty.
