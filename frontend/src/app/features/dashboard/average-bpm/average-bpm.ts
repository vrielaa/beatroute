import { Component, effect, inject, input, signal } from '@angular/core';
import { TopTracksResponse } from '@src/app/core/models/models';
import { SpotifyService } from '@src/app/spotify.service';

@Component({
  selector: 'app-average-bpm',
  imports: [],
  templateUrl: './average-bpm.html',
  styleUrl: './average-bpm.scss',
})
export class AverageBpm {
  private readonly spotifyService = inject(SpotifyService);

  public readonly topTracks = input<TopTracksResponse | null>(null);
  public readonly averageBpm = signal<number | null>(null);

  constructor() {
    effect(() => {
      const tracks = this.topTracks();

      console.log('topTracks changed:', tracks);

      if (!tracks?.items?.length) {
        this.averageBpm.set(null);
        return;
      }

      const trackIds = tracks.items.map((track: any) => track.id);

      this.spotifyService.getTracksAudioFeatures(trackIds).subscribe({
        next: (response) => {
          console.log('features response:', response);
          const totalBpm = response.audio_features?.reduce((sum: number, feature: any) => sum + (feature.tempo || 0), 0) || 0;
          const average = tracks.items.length ? totalBpm / tracks.items.length : 0;
          this.averageBpm.set(average);
        },
        error: (error) => {
          console.error('Błąd pobierania audio features:', error);
          this.averageBpm.set(null);
        },
      });
    });
  }



  svgBpmIconPaths = [
    'M18.3334 10.0001H16.2667C15.9026 9.9993 15.5481 10.1178 15.2577 10.3376C14.9672 10.5573 14.7567 10.8661 14.6584 11.2167L12.7001 18.1834C12.6875 18.2267 12.6611 18.2647 12.6251 18.2917C12.589 18.3188 12.5452 18.3334 12.5001 18.3334C12.455 18.3334 12.4111 18.3188 12.3751 18.2917C12.339 18.2647 12.3127 18.2267 12.3001 18.1834L7.70008 1.81675C7.68746 1.77347 7.66114 1.73546 7.62508 1.70841C7.58902 1.68137 7.54516 1.66675 7.50008 1.66675C7.455 1.66675 7.41114 1.68137 7.37508 1.70841C7.33902 1.73546 7.3127 1.77347 7.30008 1.81675L5.34175 8.78341C5.2438 9.13271 5.03457 9.44051 4.7458 9.66009C4.45704 9.87967 4.10451 9.99904 3.74175 10.0001H1.66675',
  ];


}


