import { Component, input } from '@angular/core';

@Component({
  selector: 'app-genre-distribution-donut',
  imports: [],
  templateUrl: './genre-distribution-donut.html',
  host: {
    class: 'genre-distribution-donut-host',
  },
})
export class GenreDistributionDonut {
  public readonly matchedArtists = input.required<number>();
  public readonly chartAriaLabel = input.required<string>();
  public readonly chartBackground = input.required<string>();
}
