import { Component, input, output, ChangeDetectionStrategy } from '@angular/core';
import { Tooltip } from '@shared/components/tooltip/tooltip';
import {
  AudioComparisonFeature,
  AudioComparisonFeatureKey,
  AudioComparisonFeatureToggle,
} from '../audio-features-comparison.models';

@Component({
  selector: 'app-audio-feature-controls',
  imports: [Tooltip],
  templateUrl: './audio-feature-controls.html',
  styleUrl: './audio-feature-controls.scss',
  changeDetection: ChangeDetectionStrategy.Eager,
  host: {
    class: 'audio-feature-controls-host',
  },
})
export class AudioFeatureControls {
  public readonly features = input.required<AudioComparisonFeature[]>();
  public readonly selectedFeatureKeys = input.required<AudioComparisonFeatureKey[]>();
  public readonly isSelectAllChecked = input(false);

  public readonly selectAllToggle = output<void>();
  public readonly clearSelection = output<void>();
  public readonly featureToggle = output<AudioComparisonFeatureToggle>();

  public isFeatureSelected(featureKey: AudioComparisonFeatureKey): boolean {
    return this.selectedFeatureKeys().includes(featureKey);
  }

  public toggleSelectAll(event: Event): void {
    event.preventDefault();
    this.selectAllToggle.emit();
  }

  public toggleFeature(featureKey: AudioComparisonFeatureKey, event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;

    this.featureToggle.emit({ featureKey, checked });
  }
}
