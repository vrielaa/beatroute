import { Component, ChangeDetectionStrategy, signal } from '@angular/core';
import type { PlaylistDataset } from './playlist-generator.models';
import { parsePlaylistDataset } from './playlist-dataset.parser';

@Component({
  selector: 'app-playlist-generator',
  imports: [],
  templateUrl: './playlist-generator.html',
  styleUrl: './playlist-generator.scss',
  changeDetection: ChangeDetectionStrategy.Eager,
})
class PlaylistGenerator {
  protected readonly dataset = signal<PlaylistDataset | null>(null);
  protected readonly fileName = signal<string | null>(null);
  protected readonly isReadingFile = signal(false);
  protected readonly importError = signal<string | null>(null);

  /**
   * Odczytuje wybrany plik JSON, sprawdza zbiór i zapisuje go w stanie widoku.
   * Anulowanie wyboru nie zmienia stanu; podczas odczytu kolejne importy są
   * pomijane. Rozpoczęcie importu usuwa poprzedni zbiór, nazwę i błąd.
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

    this.dataset.set(null);
    this.fileName.set(null);
    this.importError.set(null);
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
}

export { PlaylistGenerator };
