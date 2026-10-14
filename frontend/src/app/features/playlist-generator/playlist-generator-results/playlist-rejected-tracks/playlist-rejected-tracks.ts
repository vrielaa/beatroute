import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import type {
  PlaylistTrackRejectionReason,
  RejectedPlaylistTrack,
} from '../../playlist-generator.models';

/**
 * Wyświetla liczbę odrzuconych utworów, a po rozwinięciu sekcji ich nazwy i powody odrzucenia.
 * Niepusta lista jest domyślnie zwinięta; otwieranie i zamykanie obsługuje natywny element details.
 * Dla pustej listy pokazuje komunikat bez elementu do rozwijania.
 * Tłumaczy kody backendu na komunikaty, bez ponownej walidacji, filtrowania i sortowania.
 */
@Component({
  selector: 'app-playlist-rejected-tracks',
  templateUrl: './playlist-rejected-tracks.html',
  styleUrl: './playlist-rejected-tracks.scss',
  changeDetection: ChangeDetectionStrategy.Eager,
})
class PlaylistRejectedTracks {
  /** Odrzucenia w kolejności otrzymanej z backendu; pusta lista oznacza brak odrzuconych utworów. */
  public readonly rejectedTracks = input.required<RejectedPlaylistTrack[]>();

  protected readonly featureLabels: Record<PlaylistTrackRejectionReason['feature'], string> = {
    tempo: 'tempo (BPM)',
    speechiness: 'udział mowy (speechiness)',
    liveness: 'prawdopodobieństwo wykonania na żywo (liveness)',
  };

  /**
   * Wybiera opis odrzucenia według kodu przyczyny i cechy wskazanej przez backend.
   * Nie podaje granic liczbowych, ponieważ powód odrzucenia nie zawiera kryteriów użytkownika.
   *
   * @param reason - Brak pomiaru, niespełnione ograniczenie BPM albo przekroczone maksimum speechiness lub liveness.
   * @returns Komunikat przeznaczony do wyświetlenia w liście powodów odrzucenia.
   */
  protected getRejectionReasonMessage(reason: PlaylistTrackRejectionReason): string {
    switch (reason.code) {
      case 'missing-measurement':
        return `Brak pomiaru cechy „${this.featureLabels[reason.feature]}”.`;
      case 'outside-range':
        return 'Tempo (BPM) jest poza wybranym zakresem.';
      case 'tempo-mismatch':
        return 'Tempo po zaokrągleniu nie odpowiada wybranemu BPM.';
      case 'above-maximum':
        return `Pomiar cechy „${this.featureLabels[reason.feature]}” przekracza ustawione maksimum.`;
    }
  }
}

export { PlaylistRejectedTracks };
