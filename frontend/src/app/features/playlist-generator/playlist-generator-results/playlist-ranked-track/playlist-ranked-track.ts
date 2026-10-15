import { PercentPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { PlaylistTrackEvaluation } from '../../playlist-generator.models';
import { PlaylistPreferenceMatches } from '../playlist-preference-matches/playlist-preference-matches';

/**
 * Wyświetla jeden dopuszczony utwór, jego pozycję i oceny otrzymane z backendu.
 * Nazwa, artyści, oceny i kompletność pomiarów są wyświetlane bez zwijania szczegółów.
 * Nie zarządza zaznaczeniem utworu, które należy do komponentu wyników.
 * Nie oblicza dopasowania, nie filtruje utworów ani nie ustala kolejności rankingu.
 */
@Component({
  selector: 'app-playlist-ranked-track',
  imports: [PercentPipe, PlaylistPreferenceMatches],
  templateUrl: './playlist-ranked-track.html',
  styleUrl: './playlist-ranked-track.scss',
  changeDetection: ChangeDetectionStrategy.Eager,
})
class PlaylistRankedTrack {
  /** Dopuszczony utwór z ogólną oceną i szczegółami aktywnych preferencji. */
  public readonly evaluation = input.required<PlaylistTrackEvaluation>();

  /** Pozycja nadana przez widok rankingu, liczona od 1; nie jest indeksem tablicy. */
  public readonly position = input.required<number>();

  protected readonly artistNames = computed(() => this.evaluation().track.artists.join(', '));
}

export { PlaylistRankedTrack };
