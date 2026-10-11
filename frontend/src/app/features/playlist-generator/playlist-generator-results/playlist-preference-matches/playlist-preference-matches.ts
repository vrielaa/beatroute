import { PercentPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type {
  PlaylistFeatureMatch,
  PlaylistPreferenceFeature,
  PlaylistPreferenceLevel,
} from '../../playlist-generator.models';

/** Wyświetla oceny aktywnych preferencji otrzymane z backendu, bez ich ponownego obliczania. */
@Component({
  selector: 'app-playlist-preference-matches',
  imports: [PercentPipe],
  templateUrl: './playlist-preference-matches.html',
  styleUrl: './playlist-preference-matches.scss',
  changeDetection: ChangeDetectionStrategy.Eager,
})
class PlaylistPreferenceMatches {
  /** Aktywne preferencje wraz z pomiarami i ocenami; pusta lista oznacza brak preferencji. */
  public readonly featureMatches = input.required<PlaylistFeatureMatch[]>();

  /** Liczba dostępnych pomiarów; pomiar równy zero również jest dostępny. */
  protected readonly availableMeasurementsCount = computed(
    () => this.featureMatches().filter((featureMatch) => featureMatch.measurement !== null).length
  );

  /** Informuje, czy co najmniej jedna aktywna preferencja nie ma pomiaru. */
  protected readonly hasMissingMeasurements = computed(
    () => this.availableMeasurementsCount() < this.featureMatches().length
  );

  protected readonly featureLabels: Record<PlaylistPreferenceFeature, string> = {
    energy: 'Energia',
    danceability: 'Taneczność',
    valence: 'Pozytywność brzmienia (walencja)',
    acousticness: 'Akustyczność',
    instrumentalness: 'Instrumentalność',
  };

  protected readonly levelLabels: Record<PlaylistPreferenceLevel, string> = {
    low: 'Niski',
    medium: 'Średni',
    high: 'Wysoki',
  };
}

export { PlaylistPreferenceMatches };
