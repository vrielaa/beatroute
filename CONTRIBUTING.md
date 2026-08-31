# Konwencje kodu

## Eksporty modułów

Deklaracje funkcji, klas, stałych i typów nie używają słowa `export`. Publiczne
API modułu znajduje się w jednej sekcji na końcu pliku:

```ts
function createExample() {}

type ExampleOptions = {};

export { createExample };
export type { ExampleOptions };
```

Eksport domyślny również należy do końcowej sekcji:

```ts
class ExampleComponent {}

export default ExampleComponent;
```

Taki układ oddziela implementację od publicznego API i pozwala szybko sprawdzić,
które elementy pliku są dostępne dla pozostałych modułów. Polecenie
`npm run lint` sprawdza tę konwencję w kodzie frontendu i backendu. Hook
`pre-commit` uruchamia ESLint dla przygotowanych do commita plików.

## Typy TypeScript

### Jedno źródło odpowiedzialności

Typ powinien opisywać pojęcie należące do konkretnej warstwy aplikacji:

- typy odpowiedzi z zewnętrznego API znajdują się przy danej integracji i mają
  nazwę zakończoną na `ApiResponse`, np. `SpotifyTrackApiResponse`;
- typy wejścia HTTP znajdują się przy walidatorze lub trasie i kończą się na
  `Query`, `RequestBody` albo `RouteParams`;
- typy domenowe nie zawierają nazw dostawców ani frameworków, jeżeli nie jest to
  częścią opisywanego pojęcia;
- typy zależności opisują dostępną operację, np. `SpotifyTopTracksReader`, a nie
  funkcję, która akurat z niej korzysta;
- typ używany wyłącznie wewnątrz jednego pliku pozostaje w tym pliku i nie jest
  eksportowany.

Nie tworzymy jednego globalnego pliku ze wszystkimi typami. Współdzielone typy
jednej funkcjonalności trafiają do pliku `<feature>.types.ts` albo `types.ts` w
katalogu tej funkcjonalności. Nazwy `.models.ts` są zarezerwowane dla modeli
posiadających implementację wykonywaną w runtime; plik zawierający wyłącznie
typy powinien mieć nazwę `.types.ts`.

### Nazwy opisują dane, a nie funkcję

Nazwa typu powinna mówić, czym jest wartość. Nie powinna powstawać przez
dopisanie `Input`, `Data` lub `Result` do nazwy funkcji, jeżeli istnieje
precyzyjniejsza nazwa domenowa.

```ts
// Nieprecyzyjne
type BuildMusicMapResultData = {};
type PartitionTrackRowsResult = {};

// Precyzyjne
type MusicMapDataset = {};
type MusicMapTrackPartition = {
  analyzableTracks: AnalyzableMusicMapTrack[];
  skippedTracks: SkippedMusicMapTrack[];
};
```

Nazwy zmiennych przechowujących element są w liczbie pojedynczej, a kolekcji w
liczbie mnogiej, np. `track` oraz `tracks`. Nie dodajemy zbędnych końcówek
`List` lub `Array`. Nie używamy również prefiksów `I` ani `T`, takich jak
`ITheme` lub `TThemeId`.

### `type` i `interface`

Domyślnie używamy `type`. `interface` pozostaje tylko tam, gdzie jest potrzebne
rozszerzanie deklaracji biblioteki, np. przy typowaniu sesji Express. Dzięki temu
obiekty, unie, mapowania i typy warunkowe korzystają z jednej składni.

### Granice danych

- dane pochodzące z `req`, zmiennych środowiskowych i zewnętrznych API mogą być
  typu `unknown`, dopóki nie zostaną sprawdzone;
- po walidacji logika aplikacji otrzymuje konkretny typ i nie sprawdza ponownie
  tego samego kontraktu;
- `undefined` oznacza brak pola w niepełnych danych wejściowych;
- `null` oznacza jawny brak wartości w znormalizowanym modelu aplikacji;
- nie używamy `any` ani połączenia `null | undefined` bez uzasadnienia kontraktem
  zewnętrznym.

Różne stany tej samej wartości zapisujemy jako unię rozłączną z jawnym polem
`status` lub `kind`:

```ts
type TrackPreparation =
  | { status: "analyzable"; track: AnalyzableTrack }
  | { status: "skipped"; track: MusicMapSkippedTrack };
```

### Sygnatury funkcji

Eksportowane funkcje, fabryki, gatewaye i serwisy mają jawnie określony typ
zwracany. Dla funkcji lokalnych pozwalamy TypeScriptowi wywnioskować prosty typ,
jeżeli nie utrudnia to zrozumienia kodu.

Fabryka przyjmuje tylko zależności, których rzeczywiście używa. Zamiast całego
gatewaya można przekazać wąski kontrakt opisujący wymaganą operację. `Pick` jest
dopuszczalny lokalnie, ale współdzielona zależność powinna otrzymać nazwę
opisującą jej możliwości.
