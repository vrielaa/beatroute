import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  linkedSignal,
  output,
} from '@angular/core';

@Component({
  selector: 'app-cluster-control',
  templateUrl: './cluster-control.html',
  styleUrl: './cluster-control.scss',
  changeDetection: ChangeDetectionStrategy.Eager,
  host: {
    class: 'cluster-control-card card',
  },
})
export class ClusterControl {
  public readonly minClusterCount = input.required<number>();
  public readonly maxClusterCount = input.required<number>();
  public readonly selectedClusterCount = input.required<number>();
  public readonly isLoading = input(false);

  public readonly displayedClusterCount = linkedSignal(() => this.selectedClusterCount());

  public readonly hasOnlyOneAvailableValue = computed(
    () => this.minClusterCount() === this.maxClusterCount()
  );

  public readonly clusterCountChange = output<number>();

  public previewClusterCount(clusterCount: number): void {
    this.displayedClusterCount.set(clusterCount);
  }

  public selectClusterCount(clusterCount: number): void {
    this.displayedClusterCount.set(clusterCount);
    this.clusterCountChange.emit(clusterCount);
  }
}
