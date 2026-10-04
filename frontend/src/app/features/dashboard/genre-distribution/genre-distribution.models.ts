import type { ArtistGenreDistributionItem } from '@core/api/lastfm/lastfm.models';

interface GenreChartSegment extends ArtistGenreDistributionItem {
  color: string;
}

export type { GenreChartSegment };
