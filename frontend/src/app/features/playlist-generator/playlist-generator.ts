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
import { EMPTY, finalize, of, switchMap, tap } from 'rxjs';
import type { Subscription } from 'rxjs';
import type {
  GeneratedPlaylist,
  PlaylistAudioFeatures,
  PlaylistCriteria,
  PlaylistGenerationStage,
  PlaylistSaveProgress,
  PlaylistTrackIdsFile,
  PreparedPlaylistDataset,
  SavedPlaylist,
} from './playlist-generator.models';
import { PlaylistGeneratorApiService } from './playlist-generator-api.service';
import { parsePlaylistTrackIdsFile } from './playlist-track-ids.parser';
import { selectRankedTrackIds } from './playlist-track-selection';
import { PlaylistCriteriaForm } from './playlist-criteria-form/playlist-criteria-form';
import { PlaylistGeneratorResults } from './playlist-generator-results/playlist-generator-results';
import { PlaylistGenerationProgress } from './playlist-generation-progress/playlist-generation-progress';
import { PlaylistSaveForm } from './playlist-save-form/playlist-save-form';
import {
  getPlaylistSaveErrorMessage,
  readPartialPlaylistSaveProgress,
} from './playlist-save-response';

@Component({
  selector: 'app-playlist-generator',
  imports: [
    PlaylistCriteriaForm,
    PlaylistGeneratorResults,
    PlaylistGenerationProgress,
    PlaylistSaveForm,
  ],
  templateUrl: './playlist-generator.html',
  styleUrl: './playlist-generator.scss',
  changeDetection: ChangeDetectionStrategy.Eager,
})
class PlaylistGenerator {
  private readonly playlistGeneratorApi = inject(PlaylistGeneratorApiService);
  private readonly destroyRef = inject(DestroyRef);
  private generationSubscription: Subscription | null = null;

  protected readonly trackIdsFile = signal<PlaylistTrackIdsFile | null>(null);
  protected readonly preparedDataset = signal<PreparedPlaylistDataset | null>(null);
  protected readonly dataset = computed(() => this.preparedDataset()?.dataset ?? null);
  protected readonly fileName = signal<string | null>(null);
  protected readonly isReadingFile = signal(false);
  protected readonly importError = signal<string | null>(null);
  protected readonly criteria = signal<PlaylistCriteria | null>(null);
  protected readonly result = signal<GeneratedPlaylist | null>(null);
  /** Bieżący wybór do zapisu; tylko dopuszczone ID w kolejności aktualnego rankingu. */
  protected readonly selectedTrackIds = signal<string[]>([]);
  protected readonly isGenerating = signal(false);
  protected readonly generationError = signal<string | null>(null);
  protected readonly generationStage = signal<PlaylistGenerationStage | null>(null);
  protected readonly isSaving = signal(false);
  protected readonly savedPlaylist = signal<SavedPlaylist | null>(null);
  protected readonly partialSaveProgress = signal<PlaylistSaveProgress | null>(null);
  protected readonly saveError = signal<string | null>(null);

  protected readonly canGenerate = computed(
    () =>
      this.trackIdsFile() !== null &&
      (this.dataset() === null || (this.dataset()?.tracks.length ?? 0) > 0) &&
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
   * Zapisuje kryteria i czyści wynik, wybór, błędy oraz lokalne potwierdzenie poprzedniego zapisu.
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
   * Zapisuje kopię bieżącego wyboru dopiero po zgłoszeniu nazwy przez formularz.
   * Blokuje brak wyniku, pusty wybór, niepoprawną nazwę, trwający zapis i ponowienie
   * po otrzymaniu danych istniejącej playlisty. Nie pobiera danych i nie zmienia rankingu.
   * Zachowuje sukces albo bezpieczny komunikat błędu wraz ze sprawdzonym postępem.
   * Podczas zapisu nie pozwala usunąć wyniku ani anulować żądania zmianą ustawień.
   * Zniszczenie widoku kończy oczekiwanie, ale nie cofa operacji rozpoczętej w backendzie.
   *
   * @param name - Nazwa zgłoszona przez formularz; wysyłana po przycięciu.
   */
  protected savePlaylist(name: string): void {
    const playlistName = name.trim();
    const trackIds = [...this.selectedTrackIds()];

    if (
      this.isSaving() ||
      this.isGenerating() ||
      this.isReadingFile() ||
      !this.result() ||
      trackIds.length === 0 ||
      trackIds.length > 500 ||
      !playlistName ||
      playlistName.length > 100 ||
      this.savedPlaylist() ||
      this.partialSaveProgress()
    ) {
      return;
    }

    this.clearSaveResult();
    this.isSaving.set(true);
    this.playlistGeneratorApi
      .savePlaylist({ name: playlistName, trackIds })
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.isSaving.set(false))
      )
      .subscribe({
        next: (saved) => this.savedPlaylist.set(saved),
        error: (error: unknown) => {
          const progress = readPartialPlaylistSaveProgress(error);
          this.partialSaveProgress.set(
            progress?.requestedTrackCount === trackIds.length ? progress : null
          );
          this.saveError.set(getPlaylistSaveErrorMessage(error));
        },
      });
  }

  /** Czyści potwierdzenie po świadomej decyzji o nowym zapisie, bez żądania HTTP i zmian w Spotify. */
  protected startNewSave(): void {
    if (!this.isSaving()) {
      this.clearSaveResult();
    }
  }

  /**
   * Dopiero po kliknięciu przygotowuje dane z ID i analizuje je według kryteriów.
   * Zachowuje przygotowany zbiór do kolejnych generowań bez ponownego pobierania.
   * Pomija wywołanie bez pliku, przy pustym przygotowanym zbiorze, niepoprawnym
   * formularzu oraz podczas odczytu lub trwającego procesu.
   * Etap zmienia dopiero po zakończeniu pobierania lub otrzymaniu wyniku;
   * nie szacuje liczby przetworzonych utworów ani czasu pozostałego do końca.
   * Zapisuje ranking i odrzucenia albo komunikat błędu; pusty ranking jest poprawnym wynikiem.
   * Zmiana danych lub kryteriów oraz zniszczenie komponentu anulują oczekiwanie na odpowiedź.
   * Nie tworzy playlisty w Spotify.
   */
  protected generatePlaylist(): void {
    const file = this.trackIdsFile();
    const criteria = this.criteria();

    if (!file || !criteria || !this.canGenerate()) {
      return;
    }

    this.clearGeneration();
    this.isGenerating.set(true);

    const cachedDataset = this.preparedDataset();
    this.generationStage.set(cachedDataset ? 'analysis' : 'preparation');
    const preparation = cachedDataset
      ? of(cachedDataset)
      : this.playlistGeneratorApi.prepareDataset(file);

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
              ? getPreparationErrorMessage(error)
              : getGenerationErrorMessage(error);
          this.generationError.set(message);
        },
      });
  }

  /**
   * Odczytuje plik z ID i sprawdza go lokalnie, bez wywołań API ani generowania.
   * Anulowanie wyboru nie zmienia stanu; podczas odczytu lub zapisu w Spotify
   * kolejne importy są pomijane. Rozpoczęcie importu usuwa poprzedni zbiór, nazwę, kryteria i błędy,
   * czyści wynik generowania i wybór utworów oraz anuluje jego trwające żądanie.
   * Błędy odczytu, składni JSON-a oraz struktury danych są wyświetlane osobno.
   * Po zakończeniu czyści input, umożliwiając ponowny wybór tego samego pliku.
   * Zastąpienie pliku anuluje poprzedni proces. Po udanym odczycie udostępnia
   * formularz kryteriów; pobieranie danych rozpoczyna dopiero generatePlaylist.
   *
   * @param event - Zdarzenie change pola wyboru pliku; target wskazuje input z files.
   * @returns Zakończenie odczytu i aktualizacji stanu, z błędem zapisanym w importError.
   */
  protected async importDataset(event: Event): Promise<void> {
    const input = event.target;

    if (!(input instanceof HTMLInputElement) || this.isReadingFile() || this.isSaving()) {
      return;
    }

    const file = input.files?.[0];

    if (!file) {
      return;
    }

    this.clearGeneration();
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

  /** Anuluje generowanie i czyści wynik, wybór oraz lokalne komunikaty, także poprzedniego zapisu. */
  private clearGeneration(): void {
    this.generationSubscription?.unsubscribe();
    this.generationSubscription = null;
    this.result.set(null);
    this.selectedTrackIds.set([]);
    this.generationError.set(null);
    this.isGenerating.set(false);
    this.generationStage.set(null);
    this.clearSaveResult();
  }

  /** Usuwa tylko lokalny wynik zapisu; nie usuwa ani nie modyfikuje playlisty w Spotify. */
  private clearSaveResult(): void {
    this.savedPlaylist.set(null);
    this.partialSaveProgress.set(null);
    this.saveError.set(null);
  }
}

/** Wybiera bezpieczny komunikat pobierania; nie wyświetla diagnostyki ani tokenów z odpowiedzi. */
function getPreparationErrorMessage(error: unknown): string {
  if (error instanceof HttpErrorResponse) {
    switch (error.status) {
      case 0:
        return 'Nie udało się połączyć z backendem. Sprawdź połączenie i ponów pobieranie.';
      case 400:
        return 'Nie udało się przygotować zbioru. Sprawdź format pliku i identyfikatory Spotify.';
      case 401:
        return 'Połącz ponownie konto Spotify i ponów pobieranie danych.';
      case 403:
        return 'Spotify odmówiło dostępu do danych. Sprawdź uprawnienia połączonego konta.';
      case 413:
        return 'Plik jest zbyt duży. Wybierz mniejszy plik z maksymalnie 500 identyfikatorami.';
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
function getGenerationErrorMessage(error: unknown): string {
  if (error instanceof HttpErrorResponse) {
    if (error.status === 400) {
      return 'Nie udało się wygenerować playlisty. Sprawdź format zbioru i ustawione kryteria.';
    }

    if (error.status === 413) {
      return 'Przesłany zbiór jest zbyt duży. Wczytaj mniejszy plik i spróbuj ponownie.';
    }
  }

  return 'Nie udało się wygenerować playlisty. Spróbuj ponownie.';
}

export { PlaylistGenerator };
