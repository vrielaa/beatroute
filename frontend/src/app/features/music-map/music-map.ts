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
import { MusicMapClusterDetail, MusicMapClusterMetric } from './music-map.models';

const DEFAULT_CLUSTER_COUNT = 4;
const MIN_CLUSTER_COUNT = 2;
const MAX_CLUSTER_COUNT = 8;

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
export class MusicMap {
  private readonly analysisFiltersStore = inject(AnalysisFiltersStore);
  private readonly spotifyService = inject(SpotifyService);

  public readonly minClusterCount = MIN_CLUSTER_COUNT;
  public readonly selectedTimeRange = this.analysisFiltersStore.selectedTimeRange;
  public readonly selectedTracksRange = this.analysisFiltersStore.selectedTracksRange;

  public readonly musicMap = signal<MusicMapResponse | null>(null);
  public readonly isLoading = signal(true);
  public readonly errorMessage = signal<string | null>(null);
  public readonly selectedClusterId = signal<number | null>(null);
  public readonly selectedClusterCount = signal(DEFAULT_CLUSTER_COUNT);

  public readonly maxClusterCount = computed(() => {
    const tracksCount = this.musicMap()?.tracksWithAudioFeaturesCount ?? this.selectedTracksRange();

    return Math.max(MIN_CLUSTER_COUNT, Math.min(MAX_CLUSTER_COUNT, tracksCount - 1));
  });

  public readonly clusterDetails = computed<MusicMapClusterDetail[]>(() => {
    const musicMap = this.musicMap();

    if (!musicMap) {
      return [];
    }

    return musicMap.clusters.map((cluster) => ({
      cluster,
      points: musicMap.points.filter((point) => point.cluster === cluster.id),
      metrics: this.clusterMetrics(cluster),
    }));
  });

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
            Math.min(Math.max(musicMap.selectedClusterCount, MIN_CLUSTER_COUNT), MAX_CLUSTER_COUNT)
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
      Math.min(Math.max(nextClusterCount, MIN_CLUSTER_COUNT), this.maxClusterCount())
    );
  }

  public selectCluster(cluster: MusicMapCluster): void {
    this.selectedClusterId.set(this.selectedClusterId() === cluster.id ? null : cluster.id);
  }

  private clusterMetrics(cluster: MusicMapCluster): MusicMapClusterMetric[] {
    const features = cluster.averageAudioFeatures;

    return [
      { label: 'Śr. energia', value: this.formatPercentage(features['energy']) },
      { label: 'Śr. taneczność', value: this.formatPercentage(features['danceability']) },
      { label: 'Śr. nastrój', value: this.formatPercentage(features['valence']) },
      { label: 'Śr. tempo', value: this.formatBpm(features['tempo']) },
    ];
  }

  private formatPercentage(value: number | undefined): string {
    return typeof value === 'number' ? `${Math.round(value * 100)}%` : 'Brak danych';
  }

  private formatBpm(value: number | undefined): string {
    return typeof value === 'number' ? `${Math.round(value)} BPM` : 'Brak danych';
  }
}
