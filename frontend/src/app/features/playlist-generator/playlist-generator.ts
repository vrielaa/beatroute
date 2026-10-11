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
import { finalize } from 'rxjs';
import type { Subscription } from 'rxjs';
import type {
  GeneratedPlaylist,
  PlaylistAudioFeatures,
  PlaylistCriteria,
  PlaylistTrackIdsFile,
  PreparedPlaylistDataset,
} from './playlist-generator.models';
import { PlaylistGeneratorApiService } from './playlist-generator-api.service';
import { parsePlaylistTrackIdsFile } from './playlist-track-ids.parser';
import { PlaylistCriteriaForm } from './playlist-criteria-form/playlist-criteria-form';
import { PlaylistGeneratorResults } from './playlist-generator-results/playlist-generator-results';

@Component({
  selector: 'app-playlist-generator',
  imports: [PlaylistCriteriaForm, PlaylistGeneratorResults],
  templateUrl: './playlist-generator.html',
  styleUrl: './playlist-generator.scss',
  changeDetection: ChangeDetectionStrategy.Eager,
})
class PlaylistGenerator {
  private readonly playlistGeneratorApi = inject(PlaylistGeneratorApiService);
  private readonly destroyRef = inject(DestroyRef);
  private generationSubscription: Subscription | null = null;
  private preparationSubscription: Subscription | null = null;
  private readonly trackIdsFile = signal<PlaylistTrackIdsFile | null>(null);

  protected readonly preparedDataset = signal<PreparedPlaylistDataset | null>(null);
  protected readonly dataset = computed(() => this.preparedDataset()?.dataset ?? null);
  protected readonly fileName = signal<string | null>(null);
  protected readonly isReadingFile = signal(false);
  protected readonly isPreparingDataset = signal(false);
  protected readonly importError = signal<string | null>(null);
  protected readonly criteria = signal<PlaylistCriteria | null>(null);
  protected readonly result = signal<GeneratedPlaylist | null>(null);
  protected readonly isGenerating = signal(false);
  protected readonly generationError = signal<string | null>(null);

  protected readonly canGenerate = computed(
    () =>
      (this.dataset()?.tracks.length ?? 0) > 0 &&
      this.criteria() !== null &&
      !this.isReadingFile() &&
      !this.isPreparingDataset() &&
      !this.isGenerating()
  );

  protected readonly canRetryPreparation = computed(
    () =>
      this.trackIdsFile() !== null &&
      this.importError() !== null &&
      !this.isReadingFile() &&
      !this.isPreparingDataset()
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

  /** Zapisuje kryteria i usuwa wynik, błąd oraz trwające żądanie dla poprzednich ustawień. */
  protected updateCriteria(criteria: PlaylistCriteria | null): void {
    this.clearGeneration();
    this.criteria.set(criteria);
  }

  /**
   * Wysyła wczytany zbiór i poprawne kryteria do generatora backendowego.
   * Pomija wywołanie bez utworów, przy niepoprawnym formularzu oraz podczas odczytu,
   * przygotowania danych lub generowania.
   * Zapisuje ranking i odrzucenia albo komunikat błędu; pusty ranking jest poprawnym wynikiem.
   * Zmiana danych lub kryteriów oraz zniszczenie komponentu anulują oczekiwanie na odpowiedź.
   * Nie tworzy playlisty w Spotify.
   */
  protected generatePlaylist(): void {
    const dataset = this.dataset();
    const criteria = this.criteria();

    if (!dataset || !criteria || !this.canGenerate()) {
      return;
    }

    this.clearGeneration();
    this.isGenerating.set(true);

    this.generationSubscription = this.playlistGeneratorApi
      .generatePlaylist({
        dataset,
        requirements: criteria.requirements,
        preferences: criteria.preferences,
      })
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.isGenerating.set(false))
      )
      .subscribe({
        next: (result) => this.result.set(result),
        error: (error: unknown) => this.generationError.set(getGenerationErrorMessage(error)),
      });
  }

  /**
   * Odczytuje plik z ID, sprawdza go i rozpoczyna jednorazowe przygotowanie danych przez API.
   * Anulowanie wyboru nie zmienia stanu; podczas odczytu kolejne importy są
   * pomijane. Rozpoczęcie importu usuwa poprzedni zbiór, nazwę, kryteria i błędy,
   * czyści wynik generowania oraz anuluje jego trwające żądanie.
   * Błędy odczytu, składni JSON-a oraz struktury danych są wyświetlane osobno.
   * Po zakończeniu czyści input, umożliwiając ponowny wybór tego samego pliku.
   * Zastąpienie pliku anuluje poprzednie przygotowanie. Zniszczenie komponentu
   * podczas odczytu nie uruchamia później zapytania. Nie generuje playlisty.
   *
   * @param event - Zdarzenie change pola wyboru pliku; target wskazuje input z files.
   * @returns Zakończenie odczytu i aktualizacji stanu, z błędem zapisanym w importError.
   */
  protected async importDataset(event: Event): Promise<void> {
    const input = event.target;

    if (!(input instanceof HTMLInputElement) || this.isReadingFile()) {
      return;
    }

    const file = input.files?.[0];

    if (!file) {
      return;
    }

    this.clearGeneration();
    this.preparationSubscription?.unsubscribe();
    this.preparationSubscription = null;
    this.isPreparingDataset.set(false);
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

    this.prepareDataset();
  }

  /** Ponawia pobieranie dla zapamiętanych ID, bez ponownego odczytu pliku. */
  protected retryPreparation(): void {
    if (this.canRetryPreparation()) {
      this.prepareDataset();
    }
  }

  /**
   * Uzupełnia zapamiętane ID o metadane i pomiary; zapisuje odpowiedź do dalszego użycia.
   * Błąd nie udaje pustego wyniku. Zachowuje plik i jego nazwę do ponowienia pobierania.
   * Oczekiwanie kończy się także przy podmianie pliku lub zniszczeniu komponentu.
   */
  private prepareDataset(): void {
    const file = this.trackIdsFile();

    if (!file || this.destroyRef.destroyed || this.isReadingFile() || this.isPreparingDataset()) {
      return;
    }

    this.clearGeneration();
    this.preparedDataset.set(null);
    this.criteria.set(null);
    this.importError.set(null);
    this.isPreparingDataset.set(true);

    this.preparationSubscription = this.playlistGeneratorApi
      .prepareDataset(file)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.isPreparingDataset.set(false))
      )
      .subscribe({
        next: (prepared) => this.preparedDataset.set(prepared),
        error: (error: unknown) => this.importError.set(getPreparationErrorMessage(error)),
      });
  }

  /** Anuluje żądanie generatora i czyści jego wynik, komunikat oraz stan oczekiwania. */
  private clearGeneration(): void {
    this.generationSubscription?.unsubscribe();
    this.generationSubscription = null;
    this.result.set(null);
    this.generationError.set(null);
    this.isGenerating.set(false);
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
