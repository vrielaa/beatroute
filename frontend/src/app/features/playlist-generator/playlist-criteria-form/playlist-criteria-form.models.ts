import type {
  PlaylistPreferenceFeature,
  PlaylistPreferenceLevel,
} from '../playlist-generator.models';

/**
 * Edytowane wartości formularza, przed przekształceniem w kryteria generatora.
 * Checkboxy określają aktywność wymagań. Wyłączenie zachowuje wpisane liczby,
 * ale wynikowe kryteria pomijają je. Pusty tekst w select oznacza „Bez znaczenia”
 * i jest zamieniany na null; natywne select w Signal Forms operują na tekstach.
 *
 * @property tempoEnabled - Czy wybrane ograniczenie BPM jest aktywne.
 * @property tempoMode - range oznacza zakres, a target konkretne BPM; tryb jest stanem formularza.
 * @property tempoMin - Wpisane minimum BPM albo null dla pustego pola.
 * @property tempoMax - Wpisane maksimum BPM albo null dla pustego pola.
 * @property targetBpm - Wpisane konkretne, dodatnie i całkowite BPM albo null dla pustego pola.
 * @property speechinessEnabled - Czy maksimum udziału mowy jest aktywne.
 * @property maxSpeechiness - Wpisane maksimum speechiness albo null dla pustego pola.
 * @property livenessEnabled - Czy maksimum liveness jest aktywne.
 * @property maxLiveness - Wpisane maksimum liveness albo null dla pustego pola.
 * @property preferences - Pięć poziomów preferencji; pusty tekst wyłącza daną preferencję.
 */
type PlaylistCriteriaFormValues = {
  tempoEnabled: boolean;
  tempoMode: 'range' | 'target';
  tempoMin: number | null;
  tempoMax: number | null;
  targetBpm: number | null;
  speechinessEnabled: boolean;
  maxSpeechiness: number | null;
  livenessEnabled: boolean;
  maxLiveness: number | null;
  preferences: Record<PlaylistPreferenceFeature, PlaylistPreferenceLevel | ''>;
};

export type { PlaylistCriteriaFormValues };
