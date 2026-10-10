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
  PlaylistCriteria,
  PlaylistDataset,
} from './playlist-generator.models';
import { PlaylistGeneratorApiService } from './playlist-generator-api.service';
import { parsePlaylistDataset } from './playlist-dataset.parser';
import { PlaylistCriteriaForm } from './playlist-criteria-form/playlist-criteria-form';

@Component({
  selector: 'app-playlist-generator',
  imports: [PlaylistCriteriaForm],
  templateUrl: './playlist-generator.html',
  styleUrl: './playlist-generator.scss',
  changeDetection: ChangeDetectionStrategy.Eager,
})
class PlaylistGenerator {
  private readonly playlistGeneratorApi = inject(PlaylistGeneratorApiService);
  private readonly destroyRef = inject(DestroyRef);
  private generationSubscription: Subscription | null = null;

  protected readonly dataset = signal<PlaylistDataset | null>(null);
  protected readonly fileName = signal<string | null>(null);
  protected readonly isReadingFile = signal(false);
  protected readonly importError = signal<string | null>(null);
  protected readonly criteria = signal<PlaylistCriteria | null>(null);
  protected readonly result = signal<GeneratedPlaylist | null>(null);
  protected readonly isGenerating = signal(false);
  protected readonly generationError = signal<string | null>(null);

  protected readonly canGenerate = computed(
    () =>
      this.dataset() !== null &&
      this.criteria() !== null &&
      !this.isReadingFile() &&
      !this.isGenerating()
  );

  /** Zapisuje kryteria i usuwa wynik, błąd oraz trwające żądanie dla poprzednich ustawień. */
  protected updateCriteria(criteria: PlaylistCriteria | null): void {
    this.clearGeneration();
    this.criteria.set(criteria);
  }

  /**
   * Wysyła wczytany zbiór i poprawne kryteria do generatora backendowego.
   * Pomija wywołanie bez danych, przy niepoprawnym formularzu oraz podczas odczytu lub generowania.
   * Zapisuje ranking i odrzucenia albo komunikat błędu; pusty ranking jest poprawnym wynikiem.
   * Zmiana danych lub kryteriów oraz zniszczenie komponentu anulują oczekiwanie na odpowiedź.
   * Nie tworzy playlisty w Spotify.
   */
  protected generatePlaylist(): void {
    const dataset = this.dataset();
    const criteria = this.criteria();

    if (!dataset || !criteria || this.isReadingFile() || this.isGenerating()) {
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
   * Odczytuje wybrany plik JSON, sprawdza zbiór i zapisuje go w stanie widoku.
   * Anulowanie wyboru nie zmienia stanu; podczas odczytu kolejne importy są
   * pomijane. Rozpoczęcie importu usuwa poprzedni zbiór, nazwę, kryteria i błędy,
   * czyści wynik generowania oraz anuluje jego trwające żądanie.
   * Błędy odczytu, składni JSON-a oraz struktury danych są wyświetlane osobno.
   * Po zakończeniu czyści input, umożliwiając ponowny wybór tego samego pliku.
   * Nie wykonuje zapytań HTTP ani nie generuje playlisty.
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
    this.dataset.set(null);
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

      const json: unknown = JSON.parse(text);
      const dataset = parsePlaylistDataset(json);

      this.dataset.set(dataset);
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

  /** Anuluje żądanie generatora i czyści jego wynik, komunikat oraz stan oczekiwania. */
  private clearGeneration(): void {
    this.generationSubscription?.unsubscribe();
    this.generationSubscription = null;
    this.result.set(null);
    this.generationError.set(null);
    this.isGenerating.set(false);
  }
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
