import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { disabled, form, FormField, required, validate } from '@angular/forms/signals';
import type { ValidationError } from '@angular/forms/signals';

const MAX_PLAYLIST_NAME_LENGTH = 100;
const MAX_SELECTED_TRACKS = 500;

/**
 * Zbiera nazwę nowej, prywatnej playlisty i zgłasza zamiar zapisu bieżącego wyboru.
 * Sprawdza nazwę po przycięciu i liczbę wybranych utworów, bez zmiany rankingu.
 * Nie przechowuje ID, nie pobiera danych i nie wywołuje API; zapis obsługuje rodzic.
 */
@Component({
  selector: 'app-playlist-save-form',
  imports: [FormField],
  templateUrl: './playlist-save-form.html',
  styleUrl: './playlist-save-form.scss',
  changeDetection: ChangeDetectionStrategy.Eager,
})
class PlaylistSaveForm {
  /** Liczba aktualnie wybranych utworów; zapis wymaga od 1 do 500. */
  public readonly selectedTrackCount = input.required<number>();

  /** Stan żądania zarządzany przez rodzica; blokuje nazwę i kolejne zgłoszenia zapisu. */
  public readonly isSaving = input(false);

  /** Emituje sprawdzoną, przyciętą nazwę wyłącznie po zatwierdzeniu formularza. */
  public readonly saveRequested = output<string>();

  private readonly formValues = signal({ name: '' });

  protected readonly form = form(this.formValues, (formFields) => {
    required(formFields.name, { message: 'Podaj nazwę playlisty.' });
    validate(formFields.name, ({ value }) => validatePlaylistName(value()));
    disabled(formFields.name, { when: () => this.isSaving() });
  });

  protected readonly canSave = computed(() => {
    const selectedTrackCount = this.selectedTrackCount();
    return (
      !this.isSaving() &&
      Number.isInteger(selectedTrackCount) &&
      selectedTrackCount >= 1 &&
      selectedTrackCount <= MAX_SELECTED_TRACKS &&
      !this.form().invalid()
    );
  });

  /** Pokazuje błąd nazwy po edycji lub próbie zatwierdzenia, nie w pustym nowym formularzu. */
  protected readonly isNameErrorVisible = computed(() => {
    const field = this.form.name();
    return !field.disabled() && field.invalid() && (field.dirty() || field.touched());
  });

  /**
   * Zatrzymuje natywne wysłanie formularza i oznacza pole nazwy jako odwiedzone.
   * Niepoprawna nazwa, pusty lub niedopuszczalny wybór oraz trwający zapis blokują emisję.
   * Zgłasza nazwę bez zewnętrznych spacji, pozostawiając jej wpisaną postać w polu.
   * Samo wpisywanie nazwy i zmiana liczby utworów nie uruchamiają zapisu.
   *
   * @param event - Zdarzenie submit wywołane przyciskiem lub zatwierdzeniem z klawiatury.
   */
  protected requestSave(event: Event): void {
    event.preventDefault();
    this.form.name().markAsTouched();

    if (!this.canSave()) {
      return;
    }

    this.saveRequested.emit(this.formValues().name.trim());
  }
}

/**
 * Sprawdza nazwę po przycięciu, tak jak walidator backendu: nie może składać się
 * z samych białych znaków ani przekraczać 100 znaków. Pusty tekst pomija, ponieważ
 * sprawdza go reguła required. Zewnętrzne spacje nie wliczają się do limitu.
 *
 * @param name - Wpisana wartość pola nazwy.
 * @returns Błąd nazwy albo null, gdy ta reguła nie wykrywa błędu.
 */
function validatePlaylistName(name: string): ValidationError | null {
  if (name === '') {
    return null;
  }

  const trimmedName = name.trim();

  if (trimmedName.length === 0) {
    return { kind: 'playlistName', message: 'Podaj nazwę playlisty.' };
  }

  if (trimmedName.length > MAX_PLAYLIST_NAME_LENGTH) {
    return {
      kind: 'playlistName',
      message: `Nazwa playlisty może mieć maksymalnie ${MAX_PLAYLIST_NAME_LENGTH} znaków.`,
    };
  }

  return null;
}

export { PlaylistSaveForm };
