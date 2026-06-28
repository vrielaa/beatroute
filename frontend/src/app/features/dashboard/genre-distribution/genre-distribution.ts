import { Component, computed, input } from '@angular/core';
import {
  ArtistGenreDistributionItem,
  ArtistGenreDistributionSubgenreItem,
  ArtistGenreDistributionResponse,
  TimeRange,
} from '@src/app/core/models/models';
import { Icon } from '@shared/components/icon/icon';
import { DASHBOARD_FULL_WIDTH_SECTION_HOST_CLASS } from '../dashboard-host-classes';

interface GenreChartSegment extends ArtistGenreDistributionItem {
  color: string;
}

@Component({
  selector: 'app-genre-distribution',
  imports: [Icon],
  templateUrl: './genre-distribution.html',
  host: {
    class: DASHBOARD_FULL_WIDTH_SECTION_HOST_CLASS,
  },
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

    const totalGenreMatches = this.totalGenreMatches(distribution);
    const visibleGenres = distribution.genres.slice(0, 5);
    const remainingGenres = distribution.genres.slice(5);
    const chartGenres: ArtistGenreDistributionItem[] = [...visibleGenres];

    if (remainingGenres.length) {
      const count = remainingGenres.reduce((sum, genre) => sum + genre.count, 0);

      chartGenres.push({
        name: 'Inne',
        count,
        percentage: totalGenreMatches ? (count / totalGenreMatches) * 100 : 0,
        artists: remainingGenres.flatMap((genre) => genre.artists),
        subgenres: this.buildOtherGenreSubgenres(remainingGenres, count),
      });
    }

    return chartGenres.map((genre, index) => ({
      ...genre,
      percentage: Number(((genre.count / totalGenreMatches) * 100).toFixed(1)),
      color: this.colors[index],
    }));
  });

  public readonly chartBackground = computed(() => {
    const distribution = this.distribution();
    const segments = this.segments();

    if (!distribution?.matchedArtists || !segments.length) {
      return 'var(--color-surface-tertiary)';
    }

    const totalGenreMatches = this.totalGenreMatches(distribution);
    let start = 0;
    const stops = segments.map((segment, index) => {
      const end =
        index === segments.length - 1 ? 100 : start + (segment.count / totalGenreMatches) * 100;
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

  public hasExpandableSubgenres(segment: GenreChartSegment): boolean {
    return segment.subgenres.some(
      (subgenre) =>
        this.normalizeGenreLabel(subgenre.name) !== this.normalizeGenreLabel(segment.name)
    );
  }

  private buildOtherGenreSubgenres(
    genres: ArtistGenreDistributionItem[],
    totalCount: number
  ): ArtistGenreDistributionSubgenreItem[] {
    return genres.map((genre) => ({
      name: genre.name,
      count: genre.count,
      percentage: totalCount ? Number(((genre.count / totalCount) * 100).toFixed(1)) : 0,
      artists: genre.artists,
    }));
  }

  private normalizeGenreLabel(genre: string): string {
    return genre.toLocaleLowerCase().replace(/\s+/g, ' ').trim();
  }

  private totalGenreMatches(distribution: ArtistGenreDistributionResponse): number {
    return (
      distribution.totalGenreMatches ||
      distribution.genres.reduce((sum, genre) => sum + genre.count, 0)
    );
  }
}
