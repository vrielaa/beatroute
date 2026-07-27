import { Component, input, output } from '@angular/core';
import { MusicMapCluster, MusicMapPoint } from '@core/models/models';
import { MusicMapClusterDetail } from '../music-map.models';

@Component({
  selector: 'app-cluster-card',
  templateUrl: './cluster-card.html',
  styleUrl: './cluster-card.scss',
  host: {
    class: 'cluster-card-host',
  },
})
export class ClusterCard {
  public readonly detail = input.required<MusicMapClusterDetail>();
  public readonly isSelected = input(false);
  public readonly clusterColor = input.required<string>();

  public readonly clusterSelect = output<MusicMapCluster>();

  public selectCluster(): void {
    this.clusterSelect.emit(this.detail().cluster);
  }

  public artistsLabel(point: Pick<MusicMapPoint, 'artists'>): string {
    return point.artists.join(', ');
  }

  public clusterTracksCountLabel(cluster: MusicMapCluster): string {
    return cluster.tracksCount === 1 ? '1 utwór' : `${cluster.tracksCount} utworów`;
  }
}
