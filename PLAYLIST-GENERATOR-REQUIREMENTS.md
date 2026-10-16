# Ustalenia generatora playlist

Stan na 16 października 2026 r. Wymagania uzgodniono 8 października,
a trzy źródła danych wdrożono 15 października.
Dokument opisuje działający generator: przygotowanie zbioru, filtrowanie,
ranking, wybór utworów i zapis w Spotify wraz ze wznowieniem nieukończonego zapisu.
Projekt jest pracą inżynierską; rozwiązanie ma być czytelne, testowalne
i bez zbędnych warstw infrastruktury.

## Źródła danych

Użytkownik wybiera jedno z trzech wdrożonych źródeł:

1. Plik JSON zawierający wyłącznie identyfikatory utworów Spotify.
   Użytkownik nie dostarcza nazw, artystów ani pomiarów cech audio.
   Aplikacja uzupełnia dane z API przed uruchomieniem generatora.
2. Zapisane utwory zalogowanego użytkownika Spotify.
3. Playlista Spotify należąca do użytkownika lub przez niego współtworzona.

Wszystkie źródła dostarczają utwory do przygotowania wspólnego PlaylistDataset.
Filtrowanie i ranking działają na tym zbiorze, niezależnie od źródła danych.
Wybór pliku tylko odczytuje i sprawdza ID lokalnie. Metadane i pomiary pobieramy
dopiero po kliknięciu „Generuj playlistę”. Udane przygotowanie zachowujemy w pamięci;
kolejne generowania dla innych kryteriów korzystają z tego samego zbioru, bez ponownego
pobierania danych z API. Zmiana kryteriów nie uruchamia procesu automatycznie.

### Odczyt biblioteki i playlisty Spotify

Oba źródła są przygotowywane stronami do 50 pozycji, najwyżej do pierwszej 500. pozycji. Limit dotyczy pozycji źródłowych, także niedostępnych i powtórzonych,
nie docelowej liczby utworów. Nie doszukujemy zastępstw poza wybranym zbiorem.
Metadane wykorzystujemy bezpośrednio ze stron Spotify, bez osobnego odczytu
każdego utworu. Pomiary pochodzą z ReccoBeats. Wspólna kolejka frontendu
w playlist-spotify-preparation.ts łączy strony, usuwa powtórzone ID i liczy postęp.
Ranking uruchamiamy raz, dopiero po ukończeniu całego przygotowania.

Pole „ID lub link do playlisty” przyjmuje samo ID lub standardowy link
https://open.spotify.com/playlist/ID_PLAYLISTY. Hint: „Podaj ID lub link do playlisty,
której jesteś właścicielem lub współtwórcą.” Wpisywanie i wybór źródła nie wywołują API.
Frontend wyciąga ID, a backend przyjmuje tylko ID, nigdy URL do pobrania.

POST /api/playlist-generator/prepare-playlist wymaga playlist-read-private
i pól playlistId, offset oraz snapshotId. Pierwsza strona ma offset: 0
i snapshotId: null; kolejne przekazują wersję otrzymaną na początku.
Backend sprawdza ją przed i po odczycie strony Spotify. Zmiana wersji kończy
proces błędem 409 PLAYLIST_SOURCE_CHANGED, bez rankingu częściowych danych.
Biblioteka korzysta z POST /api/playlist-generator/prepare-saved-tracks,
z offsetem i uprawnieniem user-library-read. Błąd lub anulowanie odczytu obu
źródeł oznacza ponowne przygotowanie od offsetu 0 po następnym kliknięciu.
Kompletny niepusty zbiór pozostaje w pamięci do kolejnych kryteriów.
Zmiana ID lub źródła usuwa dane, wynik i wybór; nie usuwa nieukończonego zapisu.

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
5. Końcowa weryfikacja przepływu, porządki oraz aktualizacja README i przegląd OpenAPI — przygotowane.

Interfejs przyjmuje plik z samymi ID. Poprzedni format z tracks i audioFeatures
nie jest już formatem importu w UI; pozostaje wewnętrznym modelem generatora.

### Przygotowanie zbioru z ID

Serwis createPlaylistDatasetService w
backend/src/application/playlist-generator/playlist-dataset.service.ts przyjmuje
jawne operacje odczytu: pojedynczego utworu, strony biblioteki, metadanych i strony
playlisty oraz cech audio wskazanych ID. Nie importuje produkcyjnych klientów ani konfiguracji.
Produkcyjne zależności są składane w http/routes/playlist-generator/composition.ts.
Przygotowanie zbioru jest dostępne przez API i uruchamiane przyciskiem generowania w UI.

Metoda prepareDataset przyjmuje zwalidowany PlaylistTrackIdsFile, token Spotify
i opcjonalny kontekst cache metadanych. Router przekazuje ten kontekst z req.sessionID,
nigdy z body. Pobiera metadane po kolei, korzystając z ich cache, a cechy tylko
dla utworów z nazwą i co najmniej jednym wykonawcą.
Zapytania o cechy dzieli na porcje do 40 ID, aby ograniczyć długość
adresu żądania. To ograniczenie wielkości porcji, nie zastępstwo schedulera HTTP
kontrolującego tempo i równoległość. Wyniki łączy po spotifyId, a nie po kolejności
odpowiedzi. Zachowuje identyfikatory i kolejność wejściową.

Wynik PreparedPlaylistDataset zawiera:

- dataset — metadane i osiem pomiarów gotowych do filtrowania i rankingu;
- skippedTracks — pominięte ID z kodem metadata-unavailable (404 lub brak
  wymaganych metadanych) albo audio-features-unavailable (brak dopasowania
  w ReccoBeats, oczekiwany brak pomiarów 404 lub brak wszystkich ośmiu
  użytecznych pomiarów);
- incompleteTracks — zachowane utwory z listą brakujących pomiarów.

Niepoprawny pomiar staje się null, nie zerem. Częściowe braki nie usuwają utworu:
generator nadal rozstrzyga, czy brakuje pomiaru potrzebnego do aktywnego wymagania.
Zero w skali 0–1 pozostaje poprawną wartością. Pominięcie przy pobieraniu danych
jest czymś innym niż odrzucenie przez wymagania użytkownika.

Wszystkie trzy źródła generatora korzystają z trybu errorMode: "strict" serwisu
ReccoBeats, ustawionego we wspólnym composition.ts. Awaria choćby jednego odczytu
przerywa bieżące przygotowanie, również gdy pozostałe pomiary zostały pobrane.
Dotyczy to 429, timeoutu, błędu połączenia, awarii dostawcy i wadliwej odpowiedzi.
Takich awarii nie zapisujemy jako skippedTracks i nie uruchamiamy rankingu
częściowo przygotowanego zbioru. Już rozpoczęte operacje dostawcy mogą się zakończyć.
Zachowujemy oryginalny błąd integracji i Retry-After, gdy jest dostępny;
interfejs nie wyświetla surowej diagnostyki dostawcy ani tokenów.

Brak dopasowania w katalogu oraz oczekiwany brak pomiarów 404 nadal oznaczają
pominięcie, a nie awarię. Jeżeli wszystkie utwory mają takie braki albo nie mają
użytecznych pomiarów, dataset.tracks jest pusty; UI pokazuje informację o brakach
zamiast uruchamiać generator. Pojedyncze null pozostają poprawnymi brakami pomiarów.
Domyślny tryb partial serwisu ReccoBeats nie został zmieniony: może zwrócić
udane odczyty i błędy pojedynczych utworów, ale nie jest trybem przygotowania generatora.
Jeżeli żaden odczyt nie powiedzie się i wystąpi awaria techniczna, partial również
zgłasza wyjątek zamiast przedstawiać awarię jako pusty zbiór.

Testy serwisu używają atrap źródeł, bez zewnętrznych API. Sprawdzają format zbioru,
łączenie po ID, kolejność, porcje do 40 ID, normalizację pomiarów, częściowe braki,
pomijanie niedostępnych utworów, propagowanie awarii i brak modyfikacji wejścia.
Test HTTP całego procesu wykorzystuje rzeczywiste serwisy przygotowania i ReccoBeats,
rzeczywisty generator oraz sesję Express; atrapy zastępują tylko granice dostawców.
Sprawdza przygotowanie, ranking, powody odrzucenia, ponowne użycie zbioru i Retry-After.
Testy produkcyjnego składania zależności sprawdzają strict dla każdego źródła,
odpowiedź HTTP po mieszanym sukcesie i awarii oraz ponowne użycie cache pomiarów.

### Cache i kontrola zapytań do dostawców

Dane są zachowywane na trzech poziomach:

- Frontend przechowuje kompletny zbiór w pamięci komponentu. Zmiana kryteriów
  pozwala wykonać samą analizę. Ukończone partie pliku pozostają dostępne po błędzie
  przygotowania; odświeżenie strony lub jej opuszczenie usuwa ten stan.
- Serwis przygotowania zbioru zachowuje metadane Spotify odczytane po ID przez
  24 godziny, do 1000 wpisów łącznie. Kluczem jest para: sesja backendu i Spotify ID.
  Metadane ze stron biblioteki i playlisty nie wymagają tego cache.
- Serwis ReccoBeats zachowuje znormalizowane pomiary przez 24 godziny od udanego
  odczytu, do 1000 utworów. Kluczem jest Spotify ID, bez danych użytkownika ani tokenów.
  Pomiary są wspólne dla sesji i produkcyjnych odbiorców tej instancji serwisu,
  w tym generatora, dashboardu, profilu i mapy muzycznej.

Wpis pomiarów pomija zarówno wyszukiwanie ReccoBeats, jak i odczyt cech.
Zapytania zbiorcze obejmują tylko ID bez ważnego wpisu. Udane pomiary zapisujemy
od razu, także gdy inny odczyt później przerwie przygotowanie w trybie strict.
Błędy, 404, braki w katalogu i odpowiedzi bez jakiegokolwiek pomiaru nie trafiają
do cache. Częściowe pomiary i zero są poprawne. Cache nie ukrywa awarii odczytu
brakującego utworu w trybie strict.

Oba backendowe cache zwracają kopie danych i usuwają najstarszy wpis po
przekroczeniu limitu. Odczyt wpisu nie przedłuża jego ważności; wygasłe dane
są usuwane podczas kolejnych odczytów. Restart backendu czyści cache.
Nie ma Redis ani zapisu na dysku. Równoczesne chybienia cache nie są łączone
w jedno trwające zapytanie i mogą nadal powodować powtórzone wywołania.

Spotify Web API i ReccoBeats mają osobne schedulery, wspólne dla użytkowników
jednego procesu backendu. Każdy rozpoczyna najwyżej jedno zapytanie na sekundę,
przy maksymalnie pięciu trwających. Są to ostrożne ustawienia aplikacji,
nie potwierdzone limity dostawców ani gwarancja uniknięcia 429.
Timeout pojedynczej próby zaczyna się dopiero po opuszczeniu kolejki.
ReccoBeats ponawia przejściowe błędy 502–504 z backoffem od 1000 ms,
ale nie ponawia 429. Taki błąd pauzuje scheduler; brak lub zerowy Retry-After
nie usuwa minimalnej pauzy wynikającej z backoffu.
Podczas pauzy nowe i oczekujące operacje są odrzucane, a rozpoczęte mogą się zakończyć.
Lokalna odmowa zachowuje pozostały czas pauzy oraz upstreamStatus: null,
ponieważ nie otrzymano nowej odpowiedzi dostawcy.

### Endpoint przygotowania zbioru

POST /api/playlist-generator/prepare-dataset przyjmuje bezpośrednio plik JSON
z polami version i spotifyTrackIds. Wymaga aktywnej sesji Spotify; middleware
odnawia wygasający token przed wywołaniem serwisu. Token jest odczytywany z sesji,
nie z body. Walidacja ID odbywa się przed odczytem danych z API.

Odpowiedź 200 zawiera PreparedPlaylistDataset: dataset, skippedTracks oraz
incompleteTracks. Może zawierać pusty zbiór, jeżeli żaden utwór nie ma użytecznych
danych. Błędy walidacji, parsera i integracji trafiają do wspólnego middleware;
czas Retry-After jest przekazywany także w nagłówku odpowiedzi. Parser JSON
wszystkich tras /api/playlist-generator ma limit 1 MiB, a pozostałych endpointów 100 KiB.

POST /api/playlist-generator/generate pozostaje osobnym endpointem: przyjmuje
pełny dataset, requirements i preferences, nie wymaga sesji i nie wywołuje API.
Po zmianie kryteriów kolejne kliknięcie generowania wywołuje tylko /generate,
jeżeli zbiór został już przygotowany. Sama edycja formularza nie wywołuje API.
Testy HTTP sprawdzają prawdziwą sesję Express, autoryzację i odświeżanie tokenu,
walidację, limity parsera, przekazanie wyników oraz wspólny format błędów.

### Import i ponowienie w UI

Komponent odczytuje plik i sprawdza ID lokalnie, bez wywołań API. Po poprawnym
imporcie udostępnia formularz kryteriów. Dopiero „Generuj playlistę” wywołuje
prepare-dataset w kolejnych partiach do 20 ID, zachowuje ich wyniki i po połączeniu
wszystkich partii wysyła jedno /generate dla całego zbioru.
Kolejne kliknięcia korzystają z zachowanego zbioru. Zmiana kryteriów nie odczytuje
pliku ani nie pobiera ponownie metadanych i pomiarów.
Nowy wybór pliku usuwa poprzedni zbiór i wynik; anulowanie wyboru ich nie zmienia.

Awaria API wyświetla komunikat, a nie informację o pustym zbiorze. Nie wysyłamy
kolejnych partii ani /generate. Przycisk generowania pozwala wznowić proces od
pierwszej nieukończonej partii dla zapamiętanych ID, bez ponownego wyboru pliku.
Ukończone partie pozostają zachowane. Biblioteka i playlista zaczynają natomiast
od offsetu 0, z nową wersją playlisty; poprawne backendowe wpisy cache nadal mogą
ograniczyć liczbę zapytań do dostawców. Udane przygotowanie pozostaje
dostępne także po błędzie analizy. Pusty zbiór jest poprawną odpowiedzią, ale blokuje
generowanie. Pominięte ID i brakujące pomiary są pokazane w osobnych listach.
Wymiana pliku lub zniszczenie komponentu anuluje oczekiwanie na odpowiedź HTTP;
nie oznacza to gwarancji zatrzymania pracy już rozpoczętej przez backend.

Komunikat dla 429 zależy od poprawnego czasu w nagłówku Retry-After:

- dodatnia liczba całkowita sekund: „Ponów pobieranie za 10 s.”, z otrzymanym czasem;
- zero, brak lub niepoprawna wartość: „Przekroczono limit zapytań. Spróbuj później.”.

Nie pokazujemy „za 0 s.”. Komunikat nie jest odliczaniem i nie uruchamia procesu
automatycznie po upływie czasu. Żądania przygotowania są POST i nie są ponawiane
przez interceptor. Ponowienie całego procesu wymaga kliknięcia użytkownika;
ograniczone ponowienia odczytów dostawców pozostają odpowiedzialnością backendu.

Testy frontendu sprawdzają żądanie i cookie sesji, walidację importu, ponowienie,
braki danych, komunikaty HTTP, anulowanie oraz ponowne użycie zbioru dla kryteriów.
Z rzeczywistym interceptorem i kontrolowanym zegarem sprawdzają też błąd 429
po udanej stronie, brak następnych stron i rankingu oraz brak automatycznego
ponowienia mimo upływu czasu Retry-After dla wszystkich trzech źródeł.
W testach odpowiedzi API są zastępowane przez HttpTestingController, bez zapytań
do Spotify lub ReccoBeats.

### Widoczny postęp generowania

PlaylistGenerationProgress pojawia się dopiero po kliknięciu generowania i pokazuje:

1. Pobieranie danych — kolejne partie pliku do 20 ID lub strony Spotify do 50 pozycji,
   z metadanymi i pomiarami audio, uwzględniając backendowe cache.
2. Analiza i ranking — sprawdzenie wymagań oraz ocena preferencji przez /generate.
3. Gotowy wynik — ustawiany dopiero po otrzymaniu odpowiedzi generatora.

Licznik 1/3, 2/3 lub 3/3 opisuje etap procesu, nie liczbę utworów ani procent
pozostałego czasu. Etapy zmieniają się po odpowiedziach API, nie według zegara.
Postęp przygotowania liczy faktycznie przetworzone ID lub pozycje źródła po
zakończeniu każdej partii. Pominięte pozycje także zwiększają ten licznik,
ale nie liczbę przygotowanych utworów. Nie pokazujemy pozornego postępu wewnątrz
oczekującego żądania. Przed pierwszą odpowiedzią Spotify nie znamy jeszcze rozmiaru zbioru.
Przy zachowanym zbiorze pobieranie jest już ukończone, więc proces zaczyna się od analizy.
Awaria lub pusty zbiór zatrzymują animację bez pokazywania pełnego ukończenia.
Zmiana pliku lub kryteriów usuwa poprzedni postęp i anuluje oczekiwanie na wynik.
Animacja uwzględnia prefers-reduced-motion, a etap jest ogłaszany przez role=status.

Nieużywany frontendowy parser pełnego zbioru i jego testy zostały usunięte.
Pozostał parser pliku z ID; backendowy dataset.validator.ts nadal
sprawdza kompletny zbiór przesyłany do /generate. UI nie importuje gotowego zbioru
i nie ma jeszcze trybu offline. Zapisane utwory, playlisty właściciela lub
współtwórcy oraz wybór i zapis wyniku w Spotify są już wdrożone.

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
| tempo            | Zakres BPM albo konkretne BPM            | Obowiązkowy filtr, jeśli aktywny |
| speechiness      | Opcjonalna maksymalna wartość            | Obowiązkowy filtr, jeśli aktywny |
| liveness         | Opcjonalna maksymalna wartość            | Obowiązkowy filtr, jeśli aktywny |
| energy           | Niska / średnia / wysoka / bez znaczenia | Preferencja rozmyta              |
| danceability     | Niska / średnia / wysoka / bez znaczenia | Preferencja rozmyta              |
| valence          | Niska / średnia / wysoka / bez znaczenia | Preferencja rozmyta              |
| acousticness     | Niska / średnia / wysoka / bez znaczenia | Preferencja rozmyta              |
| instrumentalness | Niska / średnia / wysoka / bez znaczenia | Preferencja rozmyta              |

- Utwór musi spełnić wszystkie aktywne wymagania. Granice zakresów są włączone.
- Ograniczenie BPM ma dwa wzajemnie wykluczające się tryby: zakres albo konkretne BPM.
  Zakres używa oryginalnego pomiaru. Konkretne BPM porównuje wynik `Math.round(tempo)`:
  część ułamkowa poniżej 0,5 jest zaokrąglana w dół, a od 0,5 w górę.
  Pomiar 127,947 pasuje do 128 BPM, ale 128,5 już nie. Nie zmieniamy pomiaru w zbiorze.
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
  "targetBpm": null,
  "maxSpeechiness": 0.33,
  "maxLiveness": null
}
```

W tym przykładzie dopuszczamy BPM 120–140 i speechiness nie większe niż 0,33.
Nie ograniczamy liveness. Wszystkie cztery pola muszą istnieć w znormalizowanym
modelu; null wyłącza warunek. Granice BPM są dodatnie i skończone, a minimum
nie może przekraczać maksimum. Maksima speechiness i liveness należą do zakresu
0–1. Ich granice są włączone; zero jest aktywnym ograniczeniem, nie wyłączeniem.
Przy wszystkich warunkach ustawionych na null wymagania nie odrzucają utworów.

Alternatywnie użytkownik może wybrać konkretne BPM:

```json
{
  "tempoRange": null,
  "targetBpm": 128,
  "maxSpeechiness": 0.33,
  "maxLiveness": null
}
```

`targetBpm` musi być dodatnią liczbą całkowitą albo null. Nie zaokrąglamy wyboru
użytkownika — zaokrąglenie dotyczy wyłącznie porównywanego pomiaru utworu.
Walidator odrzuca jednocześnie aktywne `tempoRange` i `targetBpm`.
W formularzu checkbox włącza ograniczenie, a dwusegmentowy przełącznik wybiera tryb.
Pola nieaktywnego trybu zachowują wpisane wartości, ale nie blokują poprawności
formularza i są wysyłane jako null. Wyłączenie checkboxa wyłącza oba ograniczenia.

To osobny model, nie część pliku z utworami ani model preferencji rozmytych.
Wymagania sprawdza funkcja `parsePlaylistGeneratorRequirements` w
`backend/src/http/routes/playlist-generator/requirements.validator.ts`, pokryta
testami w sąsiednim pliku. Wymaga obecności wszystkich czterech pól, odrzuca
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

| Kod                 | Dopuszczalne cechy           | Znaczenie                                        |
| ------------------- | ---------------------------- | ------------------------------------------------ |
| missing-measurement | tempo, speechiness, liveness | Brak pomiaru potrzebnego do aktywnego warunku    |
| outside-range       | tempo                        | Tempo poniżej minimum lub powyżej maksimum       |
| tempo-mismatch      | tempo                        | Tempo po zaokrągleniu różni się od wybranego BPM |
| above-maximum       | speechiness, liveness        | Pomiar większy niż ustawione maksimum            |

Przykładowa przyczyna: `{ "feature": "tempo", "code": "outside-range" }`.
Domena zwraca kod, a interfejs wyświetla odpowiedni komunikat dla użytkownika. Wyłączony
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
w UI; wybór Top N i ręczne checkboxy działają lokalnie, a strona generatora
przechowuje wybrane ID. Zapis na koncie Spotify jest dostępny przez osobny formularz.

## Wybór utworów do zapisu w Spotify

Uzgodnione 12 października 2026 r. Wybór i zapis w Spotify są wdrożone.
W widoku wyników działa formularz Signal Forms z polem N,
przełącznikiem trybu i licznikiem. Checkboxy przy rankedTracks pokazują bieżący wybór:
w top są nieaktywne, a w manual pozwalają edytować zaznaczenia. Zmiana na tryb ręczny
zachowuje bieżący wybór i wyłącza N; powrót do top zastępuje ręczne zaznaczenia
pierwszymi N pozycjami. Osobny formularz nazwy wysyła wybrane ID do zapisu w Spotify.
Frontendowy typ PlaylistSelectionMode w playlist-generator.models.ts opisuje
dwa tryby: top („Top N”) i manual („Ręcznie”). Nie zmienia kontraktu generatora.
W playlist-track-selection.ts są funkcje validateTopTrackCount, selectTopTrackIds
i selectRankedTrackIds. Ostatnia zachowuje kolejność rankingu oraz pomija duplikaty,
nieznane i odrzucone ID, niezależnie od trybu wyboru. Komponent wyników emituje
selectedTrackIdsChange z kopią ID; strona generatora zapisuje je w selectedTrackIds
i porządkuje względem aktualnego rankingu. Stanem zapisu i wznowienia zarządza
PlaylistSaveStore, dostarczany lokalnie przez komponent strony generatora.
Usunięcie wyniku, także na początku ponownego generowania, od razu czyści tę listę.
Testy sprawdzają przekazywanie ID, walidację N, checkboxy, zmiany trybu, pusty wybór,
reset dla nowego wyniku, zmianę lub anulowanie pliku oraz brak dodatkowych żądań HTTP.

### Wspólne zasady

- Wybór odbywa się po wygenerowaniu wyniku, wyłącznie z rankedTracks.
- Utwory z rejectedTracks nie są dostępne do zaznaczenia. Wybór ręczny nie omija
  obowiązkowych wymagań, a pominięte przy pobieraniu utwory nie wracają do wyników.
- Ranking, oceny, pozycje i wyjaśnienia pozostają bez zmian. Zwinięcie całej listy
  nie zmienia wyboru; niezaznaczony utwór nie jest przez to odrzucony przez algorytm.
- Wynik 0% lub brak oceny nie wyklucza wyboru dopuszczonego utworu.
- Lista do zapisu zawiera tylko wybrane ID, zawsze w kolejności rankingu,
  nie w kolejności zaznaczania. Każde ID występuje w niej najwyżej raz.
- Zmiana trybu, limitu lub zaznaczeń nie pobiera danych, nie wywołuje generatora
  i nie tworzy playlisty. Zapis jest osobną czynnością po kliknięciu przycisku.
- Domyślnie aktywny jest „Top N”, z N równym liczbie dopuszczonych utworów.
- Pusty ranking nie daje możliwości wyboru ani zapisu. Dla istniejącego wyniku
  licznik pokazuje np. „Wybrano 50 ze 100”.

### Tryb „Top N”

- Użytkownik podaje liczbę N; zaznaczone są dokładnie pierwsze N pozycji rankingu.
- N musi być skończoną liczbą całkowitą od 1 do liczby dopuszczonych utworów.
- Niepoprawne N wymaga poprawienia i blokuje zapis; nie przycinamy go po cichu.
- W tym trybie checkboxy odzwierciedlają automatyczny wybór i nie służą do ręcznej edycji.
- Przykład: ze 100 wyników N = 50 zaznacza pozycje 1–50; pozycje 51–100
  pozostają widoczne, ale nie trafią do zapisu.

### Tryb „Ręcznie”

- Przejście z „Top N” zachowuje bieżący automatyczny wybór jako punkt wyjścia.
- Użytkownik może zaznaczyć lub odznaczyć dowolny dopuszczony utwór.
- N nie ogranicza wyboru ręcznego i nie jest w nim aktywnym polem formularza.
- Można odznaczyć wszystkie utwory, ale pustego wyboru nie można zapisać w Spotify.
- Powrót do „Top N” zastępuje ręczne zaznaczenia pierwszymi N pozycjami.

### Zmiana wyniku i danych

- Nowy wynik generowania resetuje wybór do domyślnego „Top N” dla nowego rankingu,
  także gdy identyfikatory utworów są takie same, ale zmieniły się oceny lub kolejność.
- Edycja kryteriów usuwa poprzedni wynik i jego wybór. Przygotowany zbiór pozostaje
  w pamięci do kolejnego generowania, zgodnie z obecnym mechanizmem cache.
- Wybór nowego pliku usuwa wynik i zaznaczenia; anulowanie wyboru pliku je zachowuje.
- Zaznaczenia dotyczą wyniku, nie pliku wejściowego. Format version/spotifyTrackIds
  nie zmienia się i nie zapisujemy w nim limitu N, trybu ani checkboxów.

## Prezentacja wyniku

- Nagłówek pokazuje liczbę dopuszczonych i odrzuconych utworów.
- Lista dopuszczonych utworów jest początkowo rozwinięta; można zwinąć ją w całości.
  Wybór Top N lub ręczny pozostaje poza zwijaną listą i nie znika przy jej zwinięciu.
- Lista odrzuconych utworów jest początkowo zwinięta. Po rozwinięciu pokazuje
  wszystkie powody odrzucenia. Przy braku odrzuceń widoczny jest osobny komunikat.
- Pojedyncze karty dopuszczonych utworów pokazują od razu pomiary aktywnych
  preferencji, dopasowania i kompletność danych. Nie mają osobnego rozwijania szczegółów.
- Ogólne dopasowanie jest prezentowane procentowo; null oznacza brak aktywnych
  preferencji albo brak pomiarów i ma osobny komunikat, nie 0%.
- Nad rankingiem nie wyświetlamy długich akapitów o zasadach oceny i remisach.
  Te zasady pozostają opisane w dokumentacji algorytmu.
- Zwijanie, rozwijanie i wybór utworów nie wykonują zapytań API.

## Zapis i wznowienie playlisty w Spotify

Formularz Signal Forms wymaga nazwy od 1 do 100 znaków po przycięciu i co najmniej
jednego wybranego utworu. POST /api/playlist-generator/save przyjmuje name i trackIds:
od 1 do 500 unikalnych, poprawnych Spotify ID w kolejności rankingu.
Backend niezależnie waliduje żądanie; nie odtwarza wcześniejszego rankingu ani kryteriów.
Wymaga sesji z playlist-modify-private i używa wyłącznie tokenu sesji.

Zapis tworzy nową prywatną playlistę i dodaje utwory po kolei, w partiach do 100.
Odpowiedź 201 z id, name, spotifyUrl i trackCount oznacza potwierdzenie wszystkich
partii. Podczas zapisu UI blokuje kryteria, wybór, zmianę źródła, import i kolejne
wysłanie formularza. Nie pobiera metadanych ani pomiarów i nie uruchamia rankingu.

Jeżeli dodawanie zawiedzie po utworzeniu playlisty, odpowiedź zawiera
PLAYLIST_SAVE_INCOMPLETE oraz error.details.progress: id, name, spotifyUrl,
confirmedTrackCount i requestedTrackCount. Licznik obejmuje wyłącznie potwierdzone
partie; niepotwierdzona partia mogła już zostać zapisana u dostawcy.
Backend zachowuje pierwotną listę ID i postęp w sesji. Awaria samego tworzenia
playlisty nie ma postępu, ponieważ dane docelowej playlisty nie są znane.
Timeout lub błąd połączenia nie gwarantuje, że playlista nie powstała.

POST /api/playlist-generator/resume-save przyjmuje tylko playlistId i wymaga
playlist-read-private oraz playlist-modify-private. Odczytuje bieżącą zawartość
playlisty i porównuje jej kolejność z początkiem wyboru zachowanego w sesji.
Dopisuje tylko brakującą końcówkę, nie tworzy nowej playlisty. Jeżeli pełny wybór
już istnieje, zwraca 200 bez kolejnego zapisu. Zmieniona zawartość lub brak stanu
sesji zatrzymują wznowienie błędem 409. Błąd odczytu pozostawia poprzedni stan,
a kolejna awaria zapisu aktualizuje potwierdzony postęp.

Wznowienie wymaga kliknięcia; POST nie jest automatycznie ponawiany.
Zmiana źródła, kryteriów lub wyboru nie zastępuje oczekującego zapisu.
Blokada w instancji serwisu zapobiega równoległym wznowieniom tej samej playlisty,
a kontrola wersji chroni odczyt stron. Zmiana playlisty już po sprawdzeniu zawartości
pozostaje możliwa, więc nie należy edytować jej ręcznie podczas zapisu.
Stan UI nie jest odtwarzany po odświeżeniu strony; restart backendu lub wygaśnięcie
sesji może uniemożliwić wznowienie. Nie ma trwałego systemu zadań ani bazy zapisów.

## Aktualny zakres i ograniczenia

- Przy dopuszczonych utworach pokazujemy dopasowania i pomiary preferencji,
  a przy odrzuconych — powody niespełnienia wymagań.
- Zapis tworzy nową prywatną playlistę na koncie Spotify z wybranymi utworami,
  nie eksportuje wyniku do JSON-a i nie pobiera nagrań. Nie modyfikuje źródłowej playlisty.
- Playlista jest tworzona po osobnym kliknięciu zapisu, nie automatycznie przy
  generowaniu wyniku. Nieukończony zapis można wznowić dla tej samej playlisty.
- `key`, `mode`, `timeSignature` i `loudness` nie są kryteriami pierwszej wersji generatora.
- Progi speechiness i liveness ograniczają pomiary, nie gwarantują braku wokalu
  ani braku wykonania koncertowego.
- Filtrowanie wymagań jest wykonywane przed oceną i rankingiem rozmytym.
- Import pliku z ID wymaga API i sesji Spotify; UI nie ma trybu offline.
  Syntetyczny pełny zbiór służy do testowania czystego /generate bez dostawców.
- Generator nie używa rekomendacji ReccoBeats, scraperów, Last.fm ani Soundcharts.
  Zewnętrzne dane przygotowują zbiór, a filtrowanie i ranking wykonuje własna domena.
