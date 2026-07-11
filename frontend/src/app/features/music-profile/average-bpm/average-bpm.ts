import { Component, input } from '@angular/core';
import { audioFeatureTooltip } from '@shared/audio-features/audio-feature-info';
import { Icon } from '@shared/components/icon/icon';
import { Tooltip } from '@shared/components/tooltip/tooltip';

@Component({
  selector: 'app-average-bpm',
  imports: [Icon, Tooltip],
  templateUrl: './average-bpm.html',
  styleUrl: './average-bpm.scss',
  host: {
    class: 'average-bpm-card-content',
  },
})
export class AverageBpm {
  public readonly averageBpm = input<number | null>(null);
  public readonly isLoading = input(false);
  public readonly tempoTooltip = audioFeatureTooltip('tempo');
}
