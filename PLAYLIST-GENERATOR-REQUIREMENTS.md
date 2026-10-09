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
testami w sąsiednim pliku. Limit rozmiaru żądania dla generatora, import,
filtrowanie i ranking pozostają kolejnymi etapami implementacji; walidator nie
jest jeszcze podłączony do endpointu ani ekranu importu.

Przykład obejmuje utwory o różnej energii, tempo poza zakresem 120–140 i obie jego
granice, pomiar liveness 0,9, wartości zero oraz brakujące pomiary. Pozwoli sprawdzić
filtry i ranking bez kontaktu z API, gdy te elementy zostaną zaimplementowane.

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
- `null` oznacza brak pomiaru, a nie wartość zero. Zasady rankingu przy brakujących
  pomiarach preferencji oraz parametry funkcji przynależności wymagają doprecyzowania.
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
Wymagania sprawdza funkcja `parsePlaylistRequirements` w
`backend/src/http/routes/playlist-generator/requirements.validator.ts`, pokryta
testami w sąsiednim pliku. Wymaga obecności wszystkich trzech pól, odrzuca
niepoprawne wartości i zwraca nowy obiekt bez dodatkowych pól wejściowych.
Filtrowanie pozostaje kolejnym krokiem implementacji; sam walidator nie ocenia
utworów i nie jest jeszcze podłączony do endpointu ani formularza.

## Wynik i zakres pierwszej wersji

- Przy każdym wyniku pokazujemy pomiary, spełnione wymagania i uzasadnienie rankingu.
- Wynik można zapisać do pliku JSON; nie chodzi o pobieranie nagrań.
- Automatyczne tworzenie playlisty na koncie Spotify nie jest wymaganiem pierwszej wersji.
- `key`, `mode`, `timeSignature` i `loudness` nie są kryteriami pierwszej wersji generatora.
- Progi speechiness i liveness ograniczają pomiary, nie gwarantują braku wokalu
  ani braku wykonania koncertowego.
- Najpierw wdrażamy i testujemy filtrowanie, następnie ranking rozmyty.
