import { Component, input, ChangeDetectionStrategy } from '@angular/core';
import { MusicMapResponse } from '@core/models/models';

@Component({
  selector: 'app-music-map-methodology',
  templateUrl: './music-map-methodology.html',
  styleUrl: './music-map-methodology.scss',
  changeDetection: ChangeDetectionStrategy.Eager,
  host: {
    class: 'music-map-method-card card',
  },
})
class MusicMapMethodology {
  public readonly musicMap = input.required<MusicMapResponse>();
}

export { MusicMapMethodology };
