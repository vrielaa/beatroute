import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  input,
  linkedSignal,
  output,
} from '@angular/core';
import {
  disabled,
  form,
  FormField,
  MAX,
  MAX_NUMBER,
  metadata,
  MIN,
  MIN_NUMBER,
  validate,
} from '@angular/forms/signals';
import type {
  GeneratedPlaylist,
  PlaylistSelectionFormValues,
  PlaylistSelectionMode,
} from '../playlist-generator.models';
import {
  selectRankedTrackIds,
  selectTopTrackIds,
  validateTopTrackCount,
} from '../playlist-track-selection';
import { PlaylistRankedTrack } from './playlist-ranked-track/playlist-ranked-track';
import { PlaylistRejectedTracks } from './playlist-rejected-tracks/playlist-rejected-tracks';

/**
 * Łączy podsumowanie liczby utworów, ranking dopuszczonych utworów i listę odrzuceń.
 * Udostępnia wybór pierwszych N pozycji oraz ręczne zaznaczanie dopuszczonych utworów.
 * Zachowuje pełny ranking, kolejność, oceny i odrzucenia otrzymane z backendu;
 * nie wykonuje obliczeń dopasowania, zapytań HTTP ani zapisu w Spotify.
 */
@Component({
  selector: 'app-playlist-generator-results',
  imports: [FormField, PlaylistRankedTrack, PlaylistRejectedTracks],
  templateUrl: './playlist-generator-results.html',
  styleUrl: './playlist-generator-results.scss',
  changeDetection: ChangeDetectionStrategy.Eager,
})
class PlaylistGeneratorResults {
  /** Wynik generowania; pusty ranking jest poprawnym wynikiem, nie błędem pobierania. */
  public readonly result = input.required<GeneratedPlaylist>();

  /** Emituje kopię wybranych ID w kolejności rankingu; pusty wybór lub błędne N daje []. */
  public readonly selectedTrackIdsChange = output<string[]>();

  /** Każdy nowy wynik przywraca tryb top i limit równy całej długości rankingu. */
  private readonly formValues = linkedSignal({
    source: this.result,
    computation: (result): PlaylistSelectionFormValues => ({
      mode: 'top',
      topTrackCount: result.rankedTracks.length,
    }),
  });

  /** Ręczne zaznaczenia, resetowane przy nowym wyniku i przejęte z top przy zmianie trybu. */
  private readonly manualTrackIds = linkedSignal<GeneratedPlaylist, string[]>({
    source: this.result,
    computation: () => [],
  });

  /** Wspólny walidator sprawdza N, a metadane ustawiają granice natywnego pola number. */
  protected readonly form = form(this.formValues, (formFields) => {
    metadata(formFields.topTrackCount, MIN_NUMBER, () => 1);
    metadata(formFields.topTrackCount, MIN, () => MIN_NUMBER);
    metadata(formFields.topTrackCount, MAX_NUMBER, () => this.result().rankedTracks.length);
    metadata(formFields.topTrackCount, MAX, () => MAX_NUMBER);
    disabled(formFields.topTrackCount, {
      when: ({ valueOf }) =>
        valueOf(formFields.mode) === 'manual' || this.result().rankedTracks.length === 0,
    });
    validate(formFields.topTrackCount, ({ value }) => {
      const message = validateTopTrackCount(value(), this.result().rankedTracks.length);
      return message === null ? null : { kind: 'topTrackCount', message };
    });
  });

  /** Wybrane ID w kolejności rankingu; niepoprawne N daje pusty wybór, nie przycięty limit. */
  protected readonly selectedTrackIds = computed(() => {
    if (this.result().rankedTracks.length === 0) {
      return [];
    }

    const { mode, topTrackCount } = this.formValues();

    if (mode === 'manual') {
      return selectRankedTrackIds(this.result(), this.manualTrackIds());
    }

    if (topTrackCount === null || this.form.topTrackCount().invalid()) {
      return [];
    }

    return selectTopTrackIds(this.result(), topTrackCount);
  });

  /** Pokazuje błąd aktywnego limitu po edycji lub opuszczeniu pola. */
  protected readonly isTrackCountErrorVisible = computed(() => {
    const field = this.form.topTrackCount();
    return !field.disabled() && field.invalid() && (field.dirty() || field.touched());
  });

  constructor() {
    effect(() => this.selectedTrackIdsChange.emit([...this.selectedTrackIds()]));
  }

  /**
   * Zmienia tryb bez ponownego generowania, zachowując N w formularzu.
   * Przejście do manual kopiuje bieżący wybór, a powrót do top ponownie używa N.
   * Ponowne kliknięcie aktywnego trybu nie zmienia zaznaczeń.
   */
  protected changeSelectionMode(mode: PlaylistSelectionMode): void {
    if (this.formValues().mode === mode) {
      return;
    }

    if (mode === 'manual') {
      this.manualTrackIds.set(this.selectedTrackIds());
    }

    this.form.mode().value.set(mode);
  }

  /**
   * Aktualizuje ręczny wybór na podstawie stanu checkboxa przy dopuszczonym utworze.
   * Ignoruje zmiany w trybie top oraz ID spoza aktualnego rankingu.
   * Powtórne zaznaczenie nie dodaje duplikatu; odznaczenie nie usuwa utworu z rankingu.
   *
   * @param trackId - Identyfikator utworu z rankedTracks, niezależny od value w DOM.
   * @param isSelected - Stan checked odczytany z checkboxa w szablonie.
   */
  protected changeTrackSelection(trackId: string, isSelected: boolean): void {
    const isAcceptedTrack = this.result().rankedTracks.some(
      (evaluation) => evaluation.track.id === trackId
    );

    if (this.formValues().mode !== 'manual' || !isAcceptedTrack) {
      return;
    }

    this.manualTrackIds.update((trackIds) => {
      const selectedIds = new Set(trackIds);

      if (isSelected) {
        selectedIds.add(trackId);
      } else {
        selectedIds.delete(trackId);
      }

      return [...selectedIds];
    });
  }
}

export { PlaylistGeneratorResults };
