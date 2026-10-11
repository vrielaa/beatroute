import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import type { GeneratedPlaylist } from '../playlist-generator.models';
import { PlaylistRankedTrack } from './playlist-ranked-track/playlist-ranked-track';
import { PlaylistRejectedTracks } from './playlist-rejected-tracks/playlist-rejected-tracks';

/**
 * Łączy podsumowanie liczby utworów, ranking dopuszczonych utworów i listę odrzuceń.
 * Zachowuje kolejność i oceny otrzymane z backendu; nie filtruje, nie sortuje,
 * nie wykonuje obliczeń dopasowania ani zapytań HTTP.
 */
@Component({
  selector: 'app-playlist-generator-results',
  imports: [PlaylistRankedTrack, PlaylistRejectedTracks],
  templateUrl: './playlist-generator-results.html',
  styleUrl: './playlist-generator-results.scss',
  changeDetection: ChangeDetectionStrategy.Eager,
})
class PlaylistGeneratorResults {
  /** Wynik generowania; pusty ranking jest poprawnym wynikiem, nie błędem pobierania. */
  public readonly result = input.required<GeneratedPlaylist>();
}

export { PlaylistGeneratorResults };
