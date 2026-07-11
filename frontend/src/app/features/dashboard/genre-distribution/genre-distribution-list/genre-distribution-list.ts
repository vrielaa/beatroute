import { Component, input } from '@angular/core';
import { ArtistGenreDistributionResponse } from '@core/models/models';
import { GenreChartSegment } from '../genre-distribution.models';

@Component({
  selector: 'app-genre-distribution-list',
  imports: [],
  templateUrl: './genre-distribution-list.html',
  styleUrl: './genre-distribution-list.scss',
  host: {
    class: 'genre-distribution-list-host',
  },
})
export class GenreDistributionList {
  public readonly segments = input.required<GenreChartSegment[]>();
  public readonly distribution = input.required<ArtistGenreDistributionResponse>();

  public hasExpandableSubgenres(segment: GenreChartSegment): boolean {
    return segment.subgenres.some(
      (subgenre) =>
        this.normalizeGenreLabel(subgenre.name) !== this.normalizeGenreLabel(segment.name)
    );
  }

  private normalizeGenreLabel(genre: string): string {
    return genre.toLocaleLowerCase().replace(/\s+/g, ' ').trim();
  }
}
