import { Component, computed, input, output } from '@angular/core';
import { TimeRange, TopArtist } from '@src/app/core/models/models';
import { Icon } from '@shared/components/icon/icon';

@Component({
  selector: 'app-most-listened-artists',
  imports: [Icon],
  templateUrl: './most-listened-artists.html',
  styleUrl: './most-listened-artists.scss',
})
export class MostListenedArtists {
  public readonly timeRange = input<TimeRange>('short_term');
  public readonly artists = input<TopArtist[]>([]);
  public readonly isLoading = input(true);
  public readonly hasError = input(false);
  public readonly retryRequested = output<void>();

  public readonly periodLabel = computed(() => {
    const labels: Record<TimeRange, string> = {
      short_term: 'ostatniego miesiąca',
      medium_term: 'ostatnich 6 miesięcy',
      long_term: 'ostatniego roku',
    };

    return labels[this.timeRange()];
  });

  public retry(): void {
    this.retryRequested.emit();
  }

  public artistInitial(artist: TopArtist): string {
    return artist.name.charAt(0).toUpperCase();
  }
}
