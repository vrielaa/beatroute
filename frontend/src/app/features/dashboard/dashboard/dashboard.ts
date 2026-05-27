import { Component, effect, inject, signal } from '@angular/core';
import { PeriodSelector } from '../period-selector/period-selector';
import { TimeRange } from '@src/app/core/models/models';
import { SpotifyService } from '@src/app/spotify.service';
import { AverageBpm } from '../average-bpm/average-bpm';
import { NgClass } from '../../../../../node_modules/@angular/common/types/_common_module-chunk';
import { TopTracksResponse } from '@src/app/core/models/models';

@Component({
  selector: 'app-dashboard',
  imports: [PeriodSelector, AverageBpm],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.scss',
})
export class Dashboard {
  private readonly spotifyService = inject(SpotifyService);
  public readonly selectedRange = signal<TimeRange>('short_term');
  public readonly topTracks = signal<TopTracksResponse | null>(null);

  trackNumber = signal<number>(0);

  constructor() {
    effect(() => {
      this.loadTopTracks(this.selectedRange());
    });
  }

  public changeRange(range: TimeRange): void {
    this.selectedRange.set(range);
  }

  private loadTopTracks(range: TimeRange): void {
    this.spotifyService.getTopTracks(range).subscribe((response) => {
      this.topTracks.set(response);
    });
  }
}
