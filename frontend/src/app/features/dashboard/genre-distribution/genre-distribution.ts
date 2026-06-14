import { Component, computed, input } from '@angular/core';
import {
  ArtistGenreDistributionItem,
  ArtistGenreDistributionResponse,
  TimeRange,
} from '@src/app/core/models/models';
import { Icon } from '@shared/components/icon/icon';

interface GenreChartSegment extends ArtistGenreDistributionItem {
  color: string;
}

@Component({
  selector: 'app-genre-distribution',
  imports: [Icon],
  templateUrl: './genre-distribution.html',
  styleUrl: './genre-distribution.scss',
})
export class GenreDistribution {
  private readonly colors = ['#7c5cff', '#3478f6', '#1f9d62', '#e7a93f', '#e05f8a', '#8c98aa'];

  public readonly distribution = input<ArtistGenreDistributionResponse | null>(null);
  public readonly timeRange = input<TimeRange>('short_term');
  public readonly isLoading = input(true);
  public readonly hasError = input(false);

  public readonly periodLabel = computed(() => {
    const labels: Record<TimeRange, string> = {
      short_term: 'ostatniego miesiąca',
      medium_term: 'ostatnich 6 miesięcy',
      long_term: 'ostatniego roku',
    };

    return labels[this.timeRange()];
  });

  public readonly segments = computed<GenreChartSegment[]>(() => {
    const distribution = this.distribution();

    if (!distribution?.matchedArtists) return [];

    const visibleGenres = distribution.genres.slice(0, 5);
    const remainingGenres = distribution.genres.slice(5);
    const chartGenres: ArtistGenreDistributionItem[] = [...visibleGenres];

    if (remainingGenres.length) {
      const count = remainingGenres.reduce((sum, genre) => sum + genre.count, 0);

      chartGenres.push({
        name: 'Inne',
        count,
        percentage: (count / distribution.matchedArtists) * 100,
        artists: remainingGenres.flatMap((genre) => genre.artists),
      });
    }

    return chartGenres.map((genre, index) => ({
      ...genre,
      percentage: Number(((genre.count / distribution.matchedArtists) * 100).toFixed(1)),
      color: this.colors[index],
    }));
  });

  public readonly chartBackground = computed(() => {
    const distribution = this.distribution();
    const segments = this.segments();

    if (!distribution?.matchedArtists || !segments.length) {
      return 'var(--color-surface-tertiary)';
    }

    let start = 0;
    const stops = segments.map((segment, index) => {
      const end =
        index === segments.length - 1
          ? 100
          : start + (segment.count / distribution.matchedArtists) * 100;
      const stop = `${segment.color} ${start}% ${end}%`;
      start = end;
      return stop;
    });

    return `conic-gradient(${stops.join(', ')})`;
  });

  public readonly chartAriaLabel = computed(() => {
    const segments = this.segments();

    if (!segments.length) return 'Brak danych o gatunkach';

    return segments.map((segment) => `${segment.name}: ${segment.percentage}%`).join(', ');
  });
}
