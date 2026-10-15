import { HttpErrorResponse } from '@angular/common/http';
import {
  Component,
  ChangeDetectionStrategy,
  computed,
  DestroyRef,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { concatMap, EMPTY, finalize, from, of, reduce, switchMap, tap } from 'rxjs';
import type { Observable, Subscription } from 'rxjs';
import type {
  GeneratedPlaylist,
  PlaylistAudioFeatures,
  PlaylistCriteria,
  PlaylistDataSource,
  PlaylistGenerationStage,
  PlaylistPreparationProgress,
  PlaylistTrackIdsFile,
  PreparedPlaylistDataset,
} from './playlist-generator.models';
import { PlaylistGeneratorApiService } from './playlist-generator-api.service';
import {
  getPlaylistPreparationProgress,
  mergePreparedPlaylistDatasets,
  splitPlaylistTrackIds,
} from './data-preparation/playlist-dataset-batches';
import { parsePlaylistTrackIdsFile } from './data-preparation/playlist-track-ids.parser';
import { prepareSavedTracksDataset } from './data-preparation/playlist-saved-tracks-preparation';
import { selectRankedTrackIds } from './playlist-track-selection';
import { PlaylistCriteriaForm } from './playlist-criteria-form/playlist-criteria-form';
import { PlaylistGeneratorResults } from './playlist-generator-results/playlist-generator-results';
import { PlaylistGenerationProgress } from './playlist-generation-progress/playlist-generation-progress';
import { PlaylistSaveForm } from './playlist-save-form/playlist-save-form';
import { PlaylistSaveStore } from './playlist-save.store';

@Component({
  selector: 'app-playlist-generator',
  imports: [
    PlaylistCriteriaForm,
    PlaylistGeneratorResults,
    PlaylistGenerationProgress,
    PlaylistSaveForm,
  ],
  providers: [PlaylistSaveStore],
  templateUrl: './playlist-generator.html',
  styleUrl: './playlist-generator.scss',
  changeDetection: ChangeDetectionStrategy.Eager,
})
class PlaylistGenerator {
  private readonly playlistGeneratorApi = inject(PlaylistGeneratorApiService);
  private readonly playlistSaveStore = inject(PlaylistSaveStore);
  private readonly destroyRef = inject(DestroyRef);
  private generationSubscription: Subscription | null = null;

  protected readonly dataSource = signal<PlaylistDataSource>('file');
  protected readonly trackIdsFile = signal<PlaylistTrackIdsFile | null>(null);
  protected readonly fileName = signal<string | null>(null);
  protected readonly isReadingFile = signal(false);
  protected readonly importError = signal<string | null>(null);

  /** Zakończone partie bieżącego pliku; pozostają dostępne po błędzie lub anulowaniu. */
  private readonly preparedBatches = signal<PreparedPlaylistDataset[]>([]);
  private readonly savedTracksProgress = signal<PlaylistPreparationProgress | null>(null);
  protected readonly preparedDataset = signal<PreparedPlaylistDataset | null>(null);

  protected readonly criteria = signal<PlaylistCriteria | null>(null);
  protected readonly result = signal<GeneratedPlaylist | null>(null);
  protected readonly isGenerating = signal(false);
  protected readonly generationError = signal<string | null>(null);
  protected readonly generationStage = signal<PlaylistGenerationStage | null>(null);
  protected readonly generationCancelled = signal(false);

  /** Bieżący wybór do zapisu; tylko dopuszczone ID w kolejności aktualnego rankingu. */
  protected readonly selectedTrackIds = signal<string[]>([]);

  protected readonly isSaving = this.playlistSaveStore.isSaving;
  protected readonly savedPlaylist = this.playlistSaveStore.savedPlaylist;
  protected readonly partialSaveProgress = this.playlistSaveStore.partialSaveProgress;
  protected readonly saveError = this.playlistSaveStore.saveError;
  protected readonly isResumptionBlocked = this.playlistSaveStore.isResumptionBlocked;

  /** Klucz formularza zmienia się tylko po zmianie źródła lub pliku, nie po pobraniu danych. */
  protected readonly criteriaSource = computed(() =>
    this.dataSource() === 'saved-tracks' ? 'saved-tracks' : this.trackIdsFile()
  );
  protected readonly dataset = computed(() => this.preparedDataset()?.dataset ?? null);
  protected readonly preparationProgress = computed<PlaylistPreparationProgress | null>(() => {
    if (this.dataSource() === 'saved-tracks') {
      return this.savedTracksProgress();
    }

    const file = this.trackIdsFile();
    return file ? getPlaylistPreparationProgress(file, this.preparedBatches()) : null;
  });
  protected readonly canGenerate = computed(
    () =>
      (this.dataSource() === 'saved-tracks' || this.trackIdsFile() !== null) &&
      (this.dataSource() === 'saved-tracks' ||
        this.dataset() === null ||
        (this.dataset()?.tracks.length ?? 0) > 0) &&
      this.criteria() !== null &&
      !this.isReadingFile() &&
      !this.isGenerating() &&
      !this.isSaving()
  );

  protected readonly featureLabels: Record<keyof PlaylistAudioFeatures, string> = {
    tempo: 'Tempo (BPM)',
    energy: 'Energia',
    danceability: 'Taneczność',
    valence: 'Pozytywność brzmienia (walencja)',
    acousticness: 'Akustyczność',
    instrumentalness: 'Instrumentalność',
    speechiness: 'Udział mowy',
    liveness: 'Wykonanie na żywo',
  };

  /**
   * Zmienia źródło bez pobierania danych. Czyści przygotowanie, wynik, wybór i kryteria,
   * ale zachowuje wczytany plik do powrotu oraz nieukończony zapis do wznowienia.
   * Ignoruje zmianę podczas generowania, zapisu lub odczytu pliku.
   */
  protected changeDataSource(source: PlaylistDataSource): void {
    if (
      source === this.dataSource() ||
      this.isGenerating() ||
      this.isSaving() ||
      this.isReadingFile()
    ) {
      return;
    }

    this.clearGeneration();
    this.preparedBatches.set([]);
    this.preparedDataset.set(null);
    this.savedTracksProgress.set(null);
    this.importError.set(null);
    this.criteria.set(null);
    this.dataSource.set(source);
  }

  /**
   * Odczytuje plik z ID i sprawdza go lokalnie, bez wywołań API ani generowania.
   * Anulowanie wyboru nie zmienia stanu; podczas odczytu lub zapisu w Spotify
   * kolejne importy są pomijane. Rozpoczęcie importu usuwa ukończone partie,
   * poprzedni zbiór, nazwę, kryteria i błędy,
   * czyści wynik generowania i wybór utworów oraz anuluje jego trwające żądanie.
   * Błędy odczytu, składni JSON-a oraz struktury danych są wyświetlane osobno.
   * Po zakończeniu czyści input, umożliwiając ponowny wybór tego samego pliku.
   * Zastąpienie pliku anuluje poprzedni proces. Po udanym odczycie udostępnia
   * formularz kryteriów; pobieranie danych rozpoczyna dopiero generatePlaylist.
   * Nieukończony zapis playlisty pozostaje dostępny do wznowienia po zmianie pliku.
   *
   * @param event - Zdarzenie change pola wyboru pliku; target wskazuje input z files.
   * @returns Zakończenie odczytu i aktualizacji stanu, z błędem zapisanym w importError.
   */
  protected async importDataset(event: Event): Promise<void> {
    const input = event.target;

    if (
      !(input instanceof HTMLInputElement) ||
      this.dataSource() !== 'file' ||
      this.isReadingFile() ||
      this.isSaving()
    ) {
      return;
    }

    const file = input.files?.[0];

    if (!file) {
      return;
    }

    this.clearGeneration();
    this.preparedBatches.set([]);
    this.preparedDataset.set(null);
    this.trackIdsFile.set(null);
    this.fileName.set(null);
    this.importError.set(null);
    this.criteria.set(null);
    this.isReadingFile.set(true);

    try {
      let text: string;

      try {
        text = await file.text();
      } catch {
        throw new Error('Nie udało się odczytać pliku');
      }

      if (this.destroyRef.destroyed) {
        return;
      }

      const json: unknown = JSON.parse(text);
      const trackIdsFile = parsePlaylistTrackIdsFile(json);

      this.trackIdsFile.set(trackIdsFile);
      this.fileName.set(file.name);
    } catch (error) {
      if (error instanceof SyntaxError) {
        this.importError.set('Plik nie zawiera poprawnego JSON-a');
      } else if (error instanceof Error) {
        this.importError.set(error.message);
      } else {
        this.importError.set('Nie udało się zaimportować zbioru');
      }
    } finally {
      this.isReadingFile.set(false);
      input.value = '';
    }
  }

  /**
   * Zapisuje kryteria i czyści wynik, wybór oraz zakończony wynik poprzedniego zapisu.
   * Zachowuje nieukończony zapis niezależnie od zmian kryteriów i bieżącego wyboru.
   * Ignoruje zmiany podczas zapisu w Spotify, aby zachować jego wynik i żądanie.
   */
  protected updateCriteria(criteria: PlaylistCriteria | null): void {
    if (this.isSaving()) {
      return;
    }

    this.clearGeneration();
    this.criteria.set(criteria);
  }

  /**
   * Dopiero po kliknięciu przygotowuje wybrane źródło i analizuje je według kryteriów.
   * Zachowuje przygotowany zbiór do kolejnych generowań bez ponownego pobierania.
   * Pobiera partie po 20 ID kolejno i zachowuje każdą zakończoną odpowiedź.
   * Ponowienie zaczyna od pierwszej niezakończonej partii. Po przygotowaniu
   * całego pliku raz uruchamia filtrowanie i ranking połączonego zbioru.
   * Zapisane utwory pobiera kolejno od offsetu 0, najwyżej do 500 pozycji, korzystając
   * z nextOffset. Przerwane przygotowanie biblioteki zaczyna od początku.
   * Kompletny niepusty zbiór obu źródeł wykorzystuje ponownie po zmianie kryteriów.
   * Pusta biblioteka lub brak użytecznych pomiarów nie uruchamia rankingu;
   * kolejne kliknięcie pozwala ponownie pobrać zapisane utwory.
   * Pomija wywołanie bez źródła, przy pustym zbiorze pliku, niepoprawnym formularzu
   * oraz podczas odczytu lub trwającego procesu.
   * Etap zmienia dopiero po zakończeniu pobierania lub otrzymaniu wyniku;
   * liczy wyłącznie ID z zakończonych partii, bez szacowania czasu.
   * Zapisuje ranking i odrzucenia albo komunikat błędu; pusty ranking jest poprawnym wynikiem.
   * Zmiana danych lub kryteriów oraz zniszczenie komponentu anulują oczekiwanie na odpowiedź.
   * Nie tworzy playlisty w Spotify.
   */
  protected generatePlaylist(): void {
    const criteria = this.criteria();

    if (!criteria || !this.canGenerate()) {
      return;
    }

    this.clearGeneration();
    this.isGenerating.set(true);

    const prepared = this.preparedDataset();
    const cachedDataset = prepared?.dataset.tracks.length ? prepared : null;
    this.generationStage.set(cachedDataset ? 'analysis' : 'preparation');
    const preparation = cachedDataset ? of(cachedDataset) : this.prepareSelectedSource();

    this.generationSubscription = preparation
      .pipe(
        tap((prepared) => this.preparedDataset.set(prepared)),
        switchMap((prepared) => {
          if (prepared.dataset.tracks.length === 0) {
            return EMPTY;
          }

          this.generationStage.set('analysis');
          return this.playlistGeneratorApi.generatePlaylist({
            dataset: prepared.dataset,
            requirements: criteria.requirements,
            preferences: criteria.preferences,
          });
        }),
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.isGenerating.set(false))
      )
      .subscribe({
        next: (result) => {
          this.result.set(result);
          this.generationStage.set('completed');
        },
        error: (error: unknown) => {
          const message =
            this.generationStage() === 'preparation'
              ? getPreparationErrorMessage(error, this.dataSource())
              : getGenerationErrorMessage(error, this.dataSource());
          this.generationError.set(message);
        },
      });
  }

  /**
   * Kończy oczekiwanie na bieżącą odpowiedź i nie wysyła kolejnych partii.
   * Zachowuje ukończone partie pliku i kryteria do wznowienia kolejnym kliknięciem.
   * Przerwane pobieranie biblioteki zacznie od zera; kompletny zbiór pozostaje dostępny.
   * Nie gwarantuje zatrzymania pracy już rozpoczętej przez backend lub dostawców.
   */
  protected cancelGeneration(): void {
    if (!this.isGenerating()) {
      return;
    }

    this.generationSubscription?.unsubscribe();
    this.generationSubscription = null;
    this.generationCancelled.set(true);
  }

  /**
   * Przyjmuje wybór z komponentu wyników, bez generowania ani zapytań HTTP.
   * Pomija nieznane i odrzucone ID, usuwa duplikaty oraz zachowuje kolejność rankingu.
   * Bez aktualnego wyniku zachowuje pusty wybór, nie dane z usuniętego widoku.
   *
   * @param trackIds - Zaznaczone ID; pusta tablica oznacza brak wyboru lub niepoprawne N.
   */
  protected updateSelectedTrackIds(trackIds: string[]): void {
    if (this.isSaving()) {
      return;
    }

    const result = this.result();
    this.selectedTrackIds.set(result ? selectRankedTrackIds(result, trackIds) : []);
  }

  /**
   * Przekazuje bieżący wybór do store'a dopiero po zgłoszeniu nazwy przez formularz.
   * Wymaga wyniku i braku trwającego generowania lub odczytu pliku.
   * Store sprawdza dane zapisu, blokuje ponowne wywołania i obsługuje odpowiedź.
   *
   * @param name - Nazwa zgłoszona przez formularz; wysyłana po przycięciu.
   */
  protected savePlaylist(name: string): void {
    if (!this.result() || this.isGenerating() || this.isReadingFile()) {
      return;
    }

    this.playlistSaveStore.savePlaylist({ name, trackIds: this.selectedTrackIds() });
  }

  /**
   * Zleca wznowienie zachowanego zapisu, jeśli strona nie generuje ani nie czyta pliku.
   * Nie przekazuje bieżącego wyboru; store korzysta z postępu pierwotnego zapisu.
   */
  protected resumePlaylist(): void {
    if (this.isGenerating() || this.isReadingFile()) {
      return;
    }

    this.playlistSaveStore.resumePlaylist();
  }

  /** Czyści potwierdzenie po świadomej decyzji o nowym zapisie, bez żądania HTTP i zmian w Spotify. */
  protected startNewSave(): void {
    if (!this.isGenerating() && !this.isReadingFile()) {
      this.playlistSaveStore.startNewSave();
    }
  }

  /** Przygotowuje bieżące źródło; postęp biblioteki jest nieznany do pierwszej odpowiedzi. */
  private prepareSelectedSource(): Observable<PreparedPlaylistDataset> {
    if (this.dataSource() === 'saved-tracks') {
      this.preparedDataset.set(null);
      this.savedTracksProgress.set(null);
      return prepareSavedTracksDataset(
        (offset) => this.playlistGeneratorApi.prepareSavedTracksPage(offset),
        (progress) => this.savedTracksProgress.set(progress)
      );
    }

    return this.prepareRemainingBatches(this.trackIdsFile()!);
  }

  /**
   * Przygotowuje niezakończone partie bieżącego pliku, najwyżej jedną naraz.
   * Zapisuje odpowiedzi dopiero po sukcesie; błąd przerywa kolejkę bez utraty
   * wcześniejszych partii. Zwraca jeden połączony zbiór po zakończeniu kolejki.
   *
   * @param file - Bieżący sprawdzony plik; zapisane partie należą wyłącznie do niego.
   * @returns Cały przygotowany zbiór dopiero po zakończeniu pozostałych partii.
   */
  private prepareRemainingBatches(file: PlaylistTrackIdsFile): Observable<PreparedPlaylistDataset> {
    const completedBatches = this.preparedBatches();
    const remainingBatches = splitPlaylistTrackIds(file).slice(completedBatches.length);
    const initialDataset = completedBatches.reduce(mergePreparedPlaylistDatasets, {
      dataset: { version: 1, tracks: [] },
      skippedTracks: [],
      incompleteTracks: [],
    });

    return from(remainingBatches).pipe(
      concatMap((batch) =>
        this.playlistGeneratorApi
          .prepareDataset(batch)
          .pipe(tap((prepared) => this.preparedBatches.update((batches) => [...batches, prepared])))
      ),
      reduce(mergePreparedPlaylistDatasets, initialDataset)
    );
  }

  /** Anuluje generowanie i czyści wynik; nie usuwa nieukończonego zapisu do wznowienia. */
  private clearGeneration(): void {
    this.generationSubscription?.unsubscribe();
    this.generationSubscription = null;
    this.result.set(null);
    this.selectedTrackIds.set([]);
    this.generationError.set(null);
    this.isGenerating.set(false);
    this.generationStage.set(null);
    this.generationCancelled.set(false);
    this.playlistSaveStore.clearCompletedSave();
  }
}

/** Wybiera bezpieczny komunikat pobierania; nie wyświetla diagnostyki ani tokenów z odpowiedzi. */
function getPreparationErrorMessage(error: unknown, source: PlaylistDataSource): string {
  if (error instanceof HttpErrorResponse) {
    switch (error.status) {
      case 0:
        return 'Nie udało się połączyć z backendem. Sprawdź połączenie i ponów pobieranie.';
      case 400:
        return source === 'saved-tracks'
          ? 'Nie udało się przygotować zapisanych utworów. Spróbuj ponownie.'
          : 'Nie udało się przygotować zbioru. Sprawdź format pliku i identyfikatory Spotify.';
      case 401:
        return 'Połącz ponownie konto Spotify i ponów pobieranie danych.';
      case 403:
        return source === 'saved-tracks'
          ? 'Połącz ponownie Spotify i zezwól na odczyt zapisanych utworów.'
          : 'Spotify odmówiło dostępu do danych. Sprawdź uprawnienia połączonego konta.';
      case 413:
        return source === 'saved-tracks'
          ? 'Nie udało się przygotować zapisanych utworów. Spróbuj ponownie.'
          : 'Plik jest zbyt duży. Wybierz mniejszy plik z maksymalnie 500 identyfikatorami.';
      case 429: {
        const header = error.headers.get('Retry-After')?.trim();
        const seconds = header ? Number(header) : null;
        return seconds !== null && Number.isInteger(seconds) && seconds >= 0
          ? `Przekroczono limit zapytań. Ponów pobieranie za ${seconds} s.`
          : 'Przekroczono limit zapytań. Ponów pobieranie później.';
      }
      case 502:
      case 503:
        return 'Nie udało się pobrać danych ze Spotify lub ReccoBeats. Spróbuj ponownie później.';
      case 504:
        return 'Pobieranie danych trwało zbyt długo. Ponów pobieranie.';
    }
  }

  return 'Nie udało się przygotować zbioru. Ponów pobieranie danych.';
}

/** Wybiera komunikat dla błędu HTTP lub połączenia, bez ujawniania technicznej treści odpowiedzi. */
function getGenerationErrorMessage(error: unknown, source: PlaylistDataSource): string {
  if (error instanceof HttpErrorResponse) {
    if (error.status === 400) {
      return 'Nie udało się wygenerować playlisty. Sprawdź format zbioru i ustawione kryteria.';
    }

    if (error.status === 413) {
      return source === 'saved-tracks'
        ? 'Przesłany zbiór jest zbyt duży. Spróbuj ponownie z mniejszym zbiorem utworów.'
        : 'Przesłany zbiór jest zbyt duży. Wczytaj mniejszy plik i spróbuj ponownie.';
    }
  }

  return 'Nie udało się wygenerować playlisty. Spróbuj ponownie.';
}

export { PlaylistGenerator };
