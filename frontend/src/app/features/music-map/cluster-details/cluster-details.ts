import { Component, input, output, ChangeDetectionStrategy } from '@angular/core';
import { MusicMapCluster } from '@core/models/models';
import { ClusterCard } from '../cluster-card/cluster-card';
import { MUSIC_MAP_CLUSTER_COLORS, MusicMapClusterDetail } from '../music-map.models';

@Component({
  selector: 'app-cluster-details',
  imports: [ClusterCard],
  templateUrl: './cluster-details.html',
  styleUrl: './cluster-details.scss',
  changeDetection: ChangeDetectionStrategy.Eager,
  host: {
    class: 'cluster-details-card card',
  },
})
export class ClusterDetails {
  public readonly clusterDetails = input.required<MusicMapClusterDetail[]>();
  public readonly selectedClusterId = input<number | null>(null);

  public readonly clusterSelect = output<MusicMapCluster>();

  public clusterColor(clusterId: number): string {
    return MUSIC_MAP_CLUSTER_COLORS[Math.abs(clusterId) % MUSIC_MAP_CLUSTER_COLORS.length];
  }

  public selectCluster(cluster: MusicMapCluster): void {
    this.clusterSelect.emit(cluster);
  }
}
