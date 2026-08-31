import {
  Component,
  computed,
  effect,
  inject,
  signal,
  ChangeDetectionStrategy,
} from '@angular/core';
import { MusicMapCluster, MusicMapResponse } from '@core/models/models';
import { SpotifyService } from '@core/services/spotify.service';
import { AnalysisFiltersStore } from '@core/stores/analysis-filters.store';
import { Subscription } from 'rxjs';
import { ClusterControl } from './cluster-control/cluster-control';
import { ClusterDetails } from './cluster-details/cluster-details';
import { MusicMapChart } from './music-map-chart/music-map-chart';
import { MusicMapMethodology } from './music-map-methodology/music-map-methodology';
import { MusicMapClusterDetail } from './music-map.models';
import {
  MUSIC_MAP_CLUSTER_LIMITS,
  buildMusicMapClusterDetails,
  clampMusicMapClusterCount,
  getMaxMusicMapClusterCount,
} from './music-map.utils';

@Component({
  selector: 'app-music-map',
  imports: [ClusterControl, MusicMapChart, ClusterDetails, MusicMapMethodology],
  templateUrl: './music-map.html',
  styleUrl: './music-map.scss',
  changeDetection: ChangeDetectionStrategy.Eager,
  host: {
    class: 'music-map-page',
  },
})
class MusicMap {
  private readonly analysisFiltersStore = inject(AnalysisFiltersStore);
  private readonly spotifyService = inject(SpotifyService);

  public readonly minClusterCount = MUSIC_MAP_CLUSTER_LIMITS.min;
  public readonly selectedTimeRange = this.analysisFiltersStore.selectedTimeRange;
  public readonly selectedTracksRange = this.analysisFiltersStore.selectedTracksRange;

  public readonly musicMap = signal<MusicMapResponse | null>(null);
  public readonly isLoading = signal(true);
  public readonly errorMessage = signal<string | null>(null);
  public readonly selectedClusterId = signal<number | null>(null);
  public readonly selectedClusterCount = signal<number>(MUSIC_MAP_CLUSTER_LIMITS.default);

  public readonly maxClusterCount = computed(() => {
    const tracksCount = this.musicMap()?.tracksWithAudioFeaturesCount ?? this.selectedTracksRange();

    return getMaxMusicMapClusterCount(tracksCount);
  });

  public readonly clusterDetails = computed<MusicMapClusterDetail[]>(() =>
    buildMusicMapClusterDetails(this.musicMap())
  );

  constructor() {
    effect((onCleanup) => {
      const subscription = this.loadMusicMap();

      onCleanup(() => subscription.unsubscribe());
    });
  }

  public loadMusicMap(): Subscription {
    this.isLoading.set(true);
    this.errorMessage.set(null);

    return this.spotifyService
      .getMusicMap(
        this.selectedTimeRange(),
        this.selectedTracksRange(),
        this.selectedClusterCount()
      )
      .subscribe({
        next: (musicMap) => {
          this.musicMap.set(musicMap);
          this.selectedClusterCount.set(
            clampMusicMapClusterCount(musicMap.selectedClusterCount, MUSIC_MAP_CLUSTER_LIMITS.max)
          );
          this.selectedClusterId.set(null);
          this.isLoading.set(false);
        },
        error: (error) => {
          console.error('Błąd pobierania mapy muzycznej:', error);
          this.musicMap.set(null);
          this.selectedClusterId.set(null);
          this.errorMessage.set('Nie udało się pobrać mapy muzycznej.');
          this.isLoading.set(false);
        },
      });
  }

  public updateClusterCount(nextClusterCount: number): void {
    if (!Number.isInteger(nextClusterCount)) {
      return;
    }

    this.selectedClusterCount.set(
      clampMusicMapClusterCount(nextClusterCount, this.maxClusterCount())
    );
  }

  public selectCluster(cluster: MusicMapCluster): void {
    this.selectedClusterId.set(this.selectedClusterId() === cluster.id ? null : cluster.id);
  }
}

export { MusicMap };
