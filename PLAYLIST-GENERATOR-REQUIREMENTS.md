# Ustalenia generatora playlist

Uzgodnione 8 października 2026 r. Dokument opisuje wymagania do implementacji,
nie funkcjonalność już dostępną w aplikacji. Projekt jest pracą inżynierską;
rozwiązanie ma być czytelne, testowalne i bez zbędnych warstw infrastruktury.

## Źródła danych

Docelowo użytkownik wybiera jedno z trzech źródeł:

1. Plik JSON zawierający metadane utworów i pomiary cech audio. Ten wariant
   nie wymaga pobierania danych z zewnętrznych API.
2. Zapisane utwory zalogowanego użytkownika Spotify.
3. Playlista Spotify należąca do użytkownika lub przez niego współtworzona.

Najpierw powstaje kompletny wariant plikowy, następnie źródła Spotify.
Wszystkie źródła korzystają z tego samego algorytmu generatora.

## Format pliku wejściowego

Plik jest zapisany jako JSON w kodowaniu UTF-8. Przykład z sześcioma fikcyjnymi
utworami i syntetycznymi pomiarami: [playlist-dataset.json](examples/playlist-dataset.json).
Przykład nie zawiera danych pobranych z żadnego dostawcy.

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
- `tracks` jest tablicą od 1 do 500 utworów. `id` jest niepusty i unikalny w zbiorze.
- `name` jest niepustym tekstem, a `artists` niepustą tablicą niepustych nazw.
- Wszystkie osiem pól `audioFeatures` musi istnieć. Wartość null oznacza brak pomiaru.
- `tempo` jest dodatnią, skończoną liczbą BPM albo null.
- Pozostałe siedem cech jest skończoną liczbą od 0 do 1 albo null.
- Liczba 0 jest poprawnym pomiarem cech w skali 0–1, nie oznacza braku danych.
- Plik nie zawiera wymagań ani preferencji; użytkownik wybiera je w formularzu.
- Walidator przycina identyfikatory, nazwy utworów i artystów. Duplikaty
  identyfikatorów sprawdza po przycięciu. Dodatkowe pola nie trafiają do wyniku.

Typy domenowe znajdują się w `backend/src/domain/playlist-generator/types.ts`:
`PlaylistAudioFeatures`, `PlaylistTrack` i `PlaylistDataset`. Typy TypeScript nie
walidują odczytanego JSON-a. Zbiór sprawdza funkcja `parsePlaylistGeneratorDataset`
w `backend/src/http/routes/playlist-generator/dataset.validator.ts`, pokryta
testami w sąsiednim pliku. Filtrowanie, ocena i ranking są już dostępne jako funkcje
domenowe, połączone przez generatePlaylist i udostępnione przez endpoint generatora.
Walidatory są podłączone do HTTP; import i formularz frontendu pozostają kolejnymi etapami.

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
ale formularz frontendu nie jest jeszcze zaimplementowany.

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
endpointu; formularz pozostaje kolejnym etapem.

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
interfejs powinien pokazywać te braki. rankPlaylistTracks sortuje oceny malejąco,
umieszcza null za ocenami liczbowymi (również za zerem), a przy remisach zachowuje
kolejność źródłową. generatePlaylist najpierw filtruje wymagania, a dopiero potem
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
brak body, walidację i wynik generowania. Import, formularz i eksport wyniku w UI
nie są jeszcze zaimplementowane.

## Wynik i zakres pierwszej wersji

- Przy każdym wyniku pokazujemy pomiary, spełnione wymagania i uzasadnienie rankingu.
- Wynik można zapisać do pliku JSON; nie chodzi o pobieranie nagrań.
- Automatyczne tworzenie playlisty na koncie Spotify nie jest wymaganiem pierwszej wersji.
- `key`, `mode`, `timeSignature` i `loudness` nie są kryteriami pierwszej wersji generatora.
- Progi speechiness i liveness ograniczają pomiary, nie gwarantują braku wokalu
  ani braku wykonania koncertowego.
- Najpierw wdrażamy i testujemy filtrowanie, następnie ranking rozmyty.
