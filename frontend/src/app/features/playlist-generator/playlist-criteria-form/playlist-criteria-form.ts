import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  output,
  signal,
} from '@angular/core';
import { disabled, form, FormField, max, min, required, validate } from '@angular/forms/signals';
import type { FieldTree, SchemaPathTree, ValidationError } from '@angular/forms/signals';
import type {
  PlaylistCriteria,
  PlaylistPreferenceFeature,
  PlaylistPreferenceLevel,
} from '../playlist-generator.models';
import type { PlaylistCriteriaFormValues } from './playlist-criteria-form.models';

const PREFERENCE_FEATURES: PlaylistPreferenceFeature[] = [
  'energy',
  'danceability',
  'valence',
  'acousticness',
  'instrumentalness',
];

@Component({
  selector: 'app-playlist-criteria-form',
  imports: [FormField],
  templateUrl: './playlist-criteria-form.html',
  styleUrl: './playlist-criteria-form.scss',
  changeDetection: ChangeDetectionStrategy.Eager,
})
class PlaylistCriteriaForm {
  /** Emituje sprawdzone kryteria albo null, gdy formularz wymaga poprawienia. */
  public readonly criteriaChange = output<PlaylistCriteria | null>();

  protected readonly preferenceFeatures = PREFERENCE_FEATURES;

  private readonly formValues = signal<PlaylistCriteriaFormValues>({
    tempoEnabled: false,
    tempoMin: null,
    tempoMax: null,
    speechinessEnabled: false,
    maxSpeechiness: null,
    livenessEnabled: false,
    maxLiveness: null,
    preferences: {
      energy: '',
      danceability: '',
      valence: '',
      acousticness: '',
      instrumentalness: '',
    },
  });

  protected readonly form = form(this.formValues, (formFields) => {
    configureTempoFields(formFields);
    configureSpeechinessField(formFields);
    configureLivenessField(formFields);
    configurePreferenceFields(formFields);
  });

  protected readonly preferenceLabels: Record<PlaylistPreferenceFeature, string> = {
    energy: 'Energia',
    danceability: 'Taneczność',
    valence: 'Pozytywność brzmienia (walencja)',
    acousticness: 'Akustyczność',
    instrumentalness: 'Instrumentalność',
  };

  /** Poprawne kryteria albo null; nie zawiera nieaktywnych liczb ani pustych tekstów selectów. */
  private readonly criteria = computed<PlaylistCriteria | null>(() => {
    if (this.form().invalid()) {
      return null;
    }

    return buildPlaylistCriteria(this.formValues());
  });

  constructor() {
    effect(() => this.criteriaChange.emit(this.criteria()));
  }

  /** Pokazuje błąd aktywnego pola po edycji albo opuszczeniu go. */
  protected isFieldErrorVisible(field: FieldTree<number | null>): boolean {
    const state = field();
    return !state.disabled() && state.invalid() && (state.dirty() || state.touched());
  }
}

/** Włącza pola BPM wraz z checkboxem i sprawdza dodatnie, uporządkowane granice zakresu. */
function configureTempoFields(formFields: SchemaPathTree<PlaylistCriteriaFormValues>): void {
  for (const field of [formFields.tempoMin, formFields.tempoMax]) {
    disabled(field, { when: ({ valueOf }) => !valueOf(formFields.tempoEnabled) });
    required(field, { message: 'Podaj dodatnią, skończoną liczbę dla BPM.' });
    validate(field, ({ value }) => validatePositiveTempo(value()));
  }

  validate(formFields.tempoMax, ({ value, valueOf }) =>
    validateTempoRangeOrder(valueOf(formFields.tempoMin), value())
  );
}

/** Włącza maksimum speechiness wraz z checkboxem i wymaga skończonej liczby od 0 do 1. */
function configureSpeechinessField(formFields: SchemaPathTree<PlaylistCriteriaFormValues>): void {
  const field = formFields.maxSpeechiness;
  const message = 'Podaj skończoną liczbę od 0 do 1 dla speechiness.';

  disabled(field, { when: ({ valueOf }) => !valueOf(formFields.speechinessEnabled) });
  required(field, { message });
  min(field, 0, { message });
  max(field, 1, { message });
  validate(field, ({ value }) => validateFiniteMeasurement(value()));
}

/** Włącza maksimum liveness wraz z checkboxem i wymaga skończonej liczby od 0 do 1. */
function configureLivenessField(formFields: SchemaPathTree<PlaylistCriteriaFormValues>): void {
  const field = formFields.maxLiveness;
  const message = 'Podaj skończoną liczbę od 0 do 1 dla liveness.';

  disabled(field, { when: ({ valueOf }) => !valueOf(formFields.livenessEnabled) });
  required(field, { message });
  min(field, 0, { message });
  max(field, 1, { message });
  validate(field, ({ value }) => validateFiniteMeasurement(value()));
}

/** Ogranicza pięć preferencji do poziomów low, medium, high albo pustego wyboru. */
function configurePreferenceFields(formFields: SchemaPathTree<PlaylistCriteriaFormValues>): void {
  for (const feature of PREFERENCE_FEATURES) {
    validate(formFields.preferences[feature], ({ value }) => validatePreferenceLevel(value()));
  }
}

/** Buduje kryteria po walidacji formularza; nieaktywne wymagania i puste preferencje zamienia na null. */
function buildPlaylistCriteria(values: PlaylistCriteriaFormValues): PlaylistCriteria {
  const tempoRange =
    values.tempoEnabled && values.tempoMin !== null && values.tempoMax !== null
      ? { min: values.tempoMin, max: values.tempoMax }
      : null;

  return {
    requirements: {
      tempoRange,
      maxSpeechiness: values.speechinessEnabled ? values.maxSpeechiness : null,
      maxLiveness: values.livenessEnabled ? values.maxLiveness : null,
    },
    preferences: {
      energy: values.preferences.energy || null,
      danceability: values.preferences.danceability || null,
      valence: values.preferences.valence || null,
      acousticness: values.preferences.acousticness || null,
      instrumentalness: values.preferences.instrumentalness || null,
    },
  };
}

/** Sprawdza dodatni pomiar BPM; pustą wartość obsługuje reguła required. */
function validatePositiveTempo(value: number | null): ValidationError | null {
  if (value === null || (Number.isFinite(value) && value > 0)) {
    return null;
  }
  return { kind: 'positiveNumber', message: 'Podaj dodatnią, skończoną liczbę dla BPM.' };
}

/** Sprawdza skończoność pomiaru; null obsługuje required, a zakres reguły min i max. */
function validateFiniteMeasurement(value: number | null): ValidationError | null {
  return value === null || Number.isFinite(value)
    ? null
    : { kind: 'finiteNumber', message: 'Pomiar musi być liczbą skończoną.' };
}

/**
 * Sprawdza kolejność dodatnich, skończonych granic zakresu BPM; równe wartości są dozwolone.
 * Puste, nieskończone i niedodatnie wartości pomija, ponieważ zgłaszają je reguły required
 * oraz validatePositiveTempo. Zwrócone null oznacza brak błędu kolejności, a nie potwierdzenie
 * poprawności całego zakresu.
 *
 * @param min - Wpisana dolna granica BPM albo null dla pustego pola.
 * @param max - Wpisana górna granica BPM albo null dla pustego pola.
 * @returns Błąd, gdy poprawne liczbowo minimum przewyższa maksimum; w pozostałych przypadkach null.
 */
function validateTempoRangeOrder(min: number | null, max: number | null): ValidationError | null {
  if (
    min === null ||
    max === null ||
    !Number.isFinite(min) ||
    !Number.isFinite(max) ||
    min <= 0 ||
    max <= 0
  ) {
    return null;
  }
  return min <= max
    ? null
    : {
        kind: 'tempoOrder',
        message: 'Minimum BPM nie może być większe niż maksimum BPM.',
      };
}

/** Sprawdza poziom preferencji; pusty tekst oznacza wybór „Bez znaczenia”. */
function validatePreferenceLevel(value: PlaylistPreferenceLevel | ''): ValidationError | null {
  if (value === '' || value === 'low' || value === 'medium' || value === 'high') {
    return null;
  }

  return { kind: 'preferenceLevel', message: 'Wybierz poziom preferencji z listy.' };
}

export { PlaylistCriteriaForm };
