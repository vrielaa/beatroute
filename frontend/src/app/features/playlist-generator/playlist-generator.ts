import { Component, ChangeDetectionStrategy } from '@angular/core';

@Component({
  selector: 'app-playlist-generator',
  imports: [],
  templateUrl: './playlist-generator.html',
  styleUrl: './playlist-generator.scss',
  changeDetection: ChangeDetectionStrategy.Eager,
  host: {
    class: 'placeholder-page',
  },
})
export class PlaylistGenerator {}
