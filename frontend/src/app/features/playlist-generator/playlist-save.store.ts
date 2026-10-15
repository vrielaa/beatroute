import { DestroyRef, Injectable, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { finalize } from 'rxjs';
import { PlaylistGeneratorApiService } from './playlist-generator-api.service';
import type {
  PlaylistSaveProgress,
  PlaylistToSave,
  SavedPlaylist,
} from './playlist-generator.models';
import {
  getPlaylistSaveErrorMessage,
  getPlaylistResumeErrorMessage,
  isPlaylistResumptionBlocked,
  readPartialPlaylistSaveProgress,
} from './playlist-save-response';

/**
 * Przechowuje stan zapisu i wznowienia playlisty dla jednej strony generatora.
 * Nie zna źródła danych, kryteriów ani rankingu; przyjmuje gotowy wybór utworów.
 * Komponent udostępnia własną instancję przez providers, bez stanu globalnego.
 * Zniszczenie instancji kończy lokalne oczekiwanie, ale nie cofa zapisu w Spotify.
 */
@Injectable()
class PlaylistSaveStore {
  private readonly api = inject(PlaylistGeneratorApiService);
  private readonly destroyRef = inject(DestroyRef);

  private readonly saving = signal(false);
  private readonly saved = signal<SavedPlaylist | null>(null);
  private readonly partialProgress = signal<PlaylistSaveProgress | null>(null);
  private readonly errorMessage = signal<string | null>(null);
  private readonly resumptionBlocked = signal(false);

  public readonly isSaving = this.saving.asReadonly();
  public readonly savedPlaylist = this.saved.asReadonly();
  public readonly partialSaveProgress = this.partialProgress.asReadonly();
  public readonly saveError = this.errorMessage.asReadonly();
  public readonly isResumptionBlocked = this.resumptionBlocked.asReadonly();

  /**
   * Zapisuje kopię wyboru i nazwę po przycięciu, bez ponownego generowania playlisty.
   * Nie uruchamia równoległego zapisu ani kolejnego po sukcesie lub częściowej awarii.
   * Przyjmuje nazwę od 1 do 100 znaków i od 1 do 500 ID; backend niezależnie je waliduje.
   * Błąd zachowuje jako komunikat, a poprawny postęp częściowy tylko dla żądanej liczby utworów.
   * Nie ponawia żądania automatycznie.
   *
   * @param playlist - Nazwa oraz ID wybrane przez stronę, w kolejności zapisu.
   */
  public savePlaylist(playlist: PlaylistToSave): void {
    const name = playlist.name.trim();
    const trackIds = [...playlist.trackIds];

    if (
      this.saving() ||
      this.saved() ||
      this.partialProgress() ||
      !name ||
      name.length > 100 ||
      trackIds.length === 0 ||
      trackIds.length > 500
    ) {
      return;
    }

    this.clearSaveResult();
    this.saving.set(true);
    this.api
      .savePlaylist({ name, trackIds })
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.saving.set(false))
      )
      .subscribe({
        next: (saved) => this.saved.set(saved),
        error: (error: unknown) => {
          const progress = readPartialPlaylistSaveProgress(error);
          this.partialProgress.set(
            progress?.requestedTrackCount === trackIds.length ? progress : null
          );
          this.errorMessage.set(getPlaylistSaveErrorMessage(error));
        },
      });
  }

  /**
   * Wznawia wyłącznie zapis wskazany przez zachowany postęp, bez nowego wyboru utworów.
   * Po sukcesie usuwa postęp i zachowuje potwierdzenie. Po błędzie pozostawia postęp
   * lub aktualizuje go, jeśli odpowiedź dotyczy tej samej playlisty i liczby utworów.
   * Konflikt zawartości lub brak stanu sesji blokuje wznowienie do decyzji o nowym zapisie.
   * Pomija wywołanie bez postępu, podczas innego zapisu albo po zablokowaniu wznowienia.
   */
  public resumePlaylist(): void {
    const progress = this.partialProgress();

    if (!progress || this.saving() || this.resumptionBlocked()) {
      return;
    }

    this.errorMessage.set(null);
    this.saving.set(true);
    this.api
      .resumePlaylist(progress)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.saving.set(false))
      )
      .subscribe({
        next: (saved) => {
          this.clearSaveResult();
          this.saved.set(saved);
        },
        error: (error: unknown) => {
          const updatedProgress = readPartialPlaylistSaveProgress(error);

          if (
            updatedProgress?.id === progress.id &&
            updatedProgress.requestedTrackCount === progress.requestedTrackCount
          ) {
            this.partialProgress.set(updatedProgress);
          }

          this.errorMessage.set(getPlaylistResumeErrorMessage(error));
          this.resumptionBlocked.set(isPlaylistResumptionBlocked(error));
        },
      });
  }

  /**
   * Czyści sukces albo błąd zakończonej próby przy zmianie danych lub kryteriów.
   * Nie usuwa częściowego postępu, jego komunikatu ani blokady wznowienia.
   * Podczas trwającego zapisu nie zmienia stanu i nie anuluje żądania.
   */
  public clearCompletedSave(): void {
    if (!this.saving() && !this.partialProgress()) {
      this.clearSaveResult();
    }
  }

  /**
   * Po świadomej decyzji usuwa lokalne potwierdzenie lub częściowy postęp i blokadę.
   * Nie wywołuje API i nie zmienia playlisty w Spotify. Trwający zapis blokuje czyszczenie.
   */
  public startNewSave(): void {
    if (!this.saving()) {
      this.clearSaveResult();
    }
  }

  /** Usuwa lokalny wynik bez zmiany flagi trwającego żądania ani operacji w Spotify. */
  private clearSaveResult(): void {
    this.saved.set(null);
    this.partialProgress.set(null);
    this.errorMessage.set(null);
    this.resumptionBlocked.set(false);
  }
}

export { PlaylistSaveStore };
