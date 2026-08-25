import { Component, input, output, ChangeDetectionStrategy } from '@angular/core';
import {
  AudioComparisonChartRow,
  AudioComparisonTrackToggle,
} from '../audio-features-comparison.models';

@Component({
  selector: 'app-audio-track-picker',
  imports: [],
  templateUrl: './audio-track-picker.html',
  styleUrl: './audio-track-picker.scss',
  changeDetection: ChangeDetectionStrategy.Eager,
  host: {
    class: 'audio-track-picker-host',
  },
})
export class AudioTrackPicker {
  public readonly rows = input.required<AudioComparisonChartRow[]>();
  public readonly selectedTrackIds = input.required<string[]>();
  public readonly selectionSummary = input.required<string>();

  public readonly selectAll = output<void>();
  public readonly clearSelection = output<void>();
  public readonly trackToggle = output<AudioComparisonTrackToggle>();

  public isTrackSelected(trackId: string): boolean {
    return this.selectedTrackIds().includes(trackId);
  }

  public toggleTrack(trackId: string, event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;

    this.trackToggle.emit({ trackId, checked });
  }
}
