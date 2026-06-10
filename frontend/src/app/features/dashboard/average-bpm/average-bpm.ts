import { Component, input } from '@angular/core';
import { Icon } from '@shared/components/icon/icon';

@Component({
  selector: 'app-average-bpm',
  imports: [Icon],
  templateUrl: './average-bpm.html',
  styleUrl: './average-bpm.scss',
})
export class AverageBpm {
  public readonly averageBpm = input<number | null>(null);
  public readonly isLoading = input(false);
}
