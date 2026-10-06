import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import type { TimeRange } from '@core/api/spotify/spotify.models';
import { AnalysisFiltersStore } from '@core/stores/analysis-filters.store';
import { Subscription, switchMap } from 'rxjs';
import { ClusterControl } from './cluster-control/cluster-control';
import { ClusterDetails } from './cluster-details/cluster-details';
import { MusicMapChart } from './music-map-chart/music-map-chart';
import { MusicMapMethodology } from './music-map-methodology/music-map-methodology';
import { MusicMapApiService } from './music-map-api.service';
import type {
  MusicMapCluster,
  MusicMapClusterDetail,
  MusicMapDataset,
  MusicMapResponse,
} from './music-map.models';
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
  private readonly musicMapApi = inject(MusicMapApiService);
  private readonly destroyRef = inject(DestroyRef);

  private datasetSubscription: Subscription | null = null;
  private clusterAnalysisSubscription: Subscription | null = null;

  public readonly selectedTimeRange = this.analysisFiltersStore.selectedTimeRange;
  public readonly selectedTracksRange = this.analysisFiltersStore.selectedTracksRange;
  public readonly minClusterCount = MUSIC_MAP_CLUSTER_LIMITS.min;

  public readonly dataset = signal<MusicMapDataset | null>(null);
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
    this.destroyRef.onDestroy(() => this.cancelActiveRequests());

    effect((onCleanup) => {
      const timeRange = this.selectedTimeRange();
      const tracksRange = this.selectedTracksRange();
      const clusterCount = untracked(() => this.selectedClusterCount());
      const subscription = this.loadDatasetAndAnalyze(timeRange, tracksRange, clusterCount);

      onCleanup(() => subscription.unsubscribe());
    });
  }

  public retryLoading(): void {
    this.loadDatasetAndAnalyze(
      this.selectedTimeRange(),
      this.selectedTracksRange(),
      this.selectedClusterCount()
    );
  }

  public updateClusterCount(clusterCount: number): void {
    if (!Number.isInteger(clusterCount)) {
      return;
    }

    const dataset = this.dataset();

    if (!dataset) {
      return;
    }

    const selectedClusterCount = clampMusicMapClusterCount(clusterCount, this.maxClusterCount());

    this.selectedClusterCount.set(selectedClusterCount);
    this.analyzeDataset(dataset, selectedClusterCount);
  }

  public selectCluster(cluster: MusicMapCluster): void {
    this.selectedClusterId.set(this.selectedClusterId() === cluster.id ? null : cluster.id);
  }

  private loadDatasetAndAnalyze(
    timeRange: TimeRange,
    tracksRange: number,
    clusterCount: number
  ): Subscription {
    this.cancelActiveRequests();
    this.startLoading();

    this.datasetSubscription = this.musicMapApi
      .getMusicMapDataset(timeRange, tracksRange)
      .pipe(
        switchMap((dataset) => {
          this.dataset.set(dataset);

          return this.musicMapApi.analyzeMusicMap(dataset, clusterCount);
        })
      )
      .subscribe({
        next: (musicMap) => this.applyMusicMap(musicMap),
        error: (error) => this.handleDatasetLoadingError(error),
      });

    return this.datasetSubscription;
  }

  private analyzeDataset(dataset: MusicMapDataset, clusterCount: number): void {
    this.clusterAnalysisSubscription?.unsubscribe();
    this.startLoading();

    this.clusterAnalysisSubscription = this.musicMapApi
      .analyzeMusicMap(dataset, clusterCount)
      .subscribe({
        next: (musicMap) => this.applyMusicMap(musicMap),
        error: (error) => this.handleDatasetAnalysisError(error),
      });
  }

  private startLoading(): void {
    this.isLoading.set(true);
    this.errorMessage.set(null);
  }

  private applyMusicMap(musicMap: MusicMapResponse): void {
    this.musicMap.set(musicMap);
    this.selectedClusterCount.set(
      clampMusicMapClusterCount(musicMap.selectedClusterCount, MUSIC_MAP_CLUSTER_LIMITS.max)
    );
    this.selectedClusterId.set(null);
    this.isLoading.set(false);
  }

  private handleDatasetLoadingError(error: unknown): void {
    console.error('Błąd pobierania danych mapy muzycznej:', error);
    this.dataset.set(null);
    this.musicMap.set(null);
    this.selectedClusterId.set(null);
    this.errorMessage.set('Nie udało się pobrać mapy muzycznej.');
    this.isLoading.set(false);
  }

  private handleDatasetAnalysisError(error: unknown): void {
    console.error('Błąd analizy mapy muzycznej:', error);
    this.errorMessage.set('Nie udało się przeanalizować mapy muzycznej.');
    this.isLoading.set(false);
  }

  private cancelActiveRequests(): void {
    this.datasetSubscription?.unsubscribe();
    this.clusterAnalysisSubscription?.unsubscribe();
  }
}

export { MusicMap };
