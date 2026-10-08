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
- `tracks` jest tablicą utworów. `id` jest niepusty i unikalny w zbiorze.
- `name` jest niepustym tekstem, a `artists` niepustą tablicą niepustych nazw.
- Wszystkie osiem pól `audioFeatures` musi istnieć. Wartość null oznacza brak pomiaru.
- `tempo` jest dodatnią, skończoną liczbą BPM albo null.
- Pozostałe siedem cech jest skończoną liczbą od 0 do 1 albo null.
- Liczba 0 jest poprawnym pomiarem cech w skali 0–1, nie oznacza braku danych.
- Plik nie zawiera wymagań ani preferencji; użytkownik wybiera je w formularzu.

Typy domenowe znajdują się w `backend/src/domain/playlist-generator/types.ts`:
`PlaylistAudioFeatures`, `PlaylistTrack` i `PlaylistDataset`. Typy TypeScript nie
walidują odczytanego JSON-a. Walidator, limity rozmiaru/liczby utworów, import,
filtrowanie i ranking pozostają kolejnymi etapami implementacji.

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

## Wynik i zakres pierwszej wersji

- Przy każdym wyniku pokazujemy pomiary, spełnione wymagania i uzasadnienie rankingu.
- Wynik można zapisać do pliku JSON; nie chodzi o pobieranie nagrań.
- Automatyczne tworzenie playlisty na koncie Spotify nie jest wymaganiem pierwszej wersji.
- `key`, `mode`, `timeSignature` i `loudness` nie są kryteriami pierwszej wersji generatora.
- Progi speechiness i liveness ograniczają pomiary, nie gwarantują braku wokalu
  ani braku wykonania koncertowego.
- Najpierw wdrażamy i testujemy filtrowanie, następnie ranking rozmyty.
