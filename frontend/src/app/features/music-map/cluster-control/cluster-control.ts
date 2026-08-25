import { Component, input, output, ChangeDetectionStrategy } from '@angular/core';

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

  public readonly clusterCountChange = output<number>();

  public updateClusterCount(event: Event): void {
    const inputElement = event.target as HTMLInputElement;
    const nextClusterCount = Number(inputElement.value);

    if (Number.isInteger(nextClusterCount)) {
      this.clusterCountChange.emit(nextClusterCount);
    }
  }
}
