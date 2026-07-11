import { Component, input } from '@angular/core';

@Component({
  selector: 'app-genre-distribution-donut',
  imports: [],
  templateUrl: './genre-distribution-donut.html',
  host: {
    class: 'grid min-w-[0]',
  },
})
export class GenreDistributionDonut {
  public readonly matchedArtists = input.required<number>();
  public readonly chartAriaLabel = input.required<string>();
  public readonly chartBackground = input.required<string>();
}
