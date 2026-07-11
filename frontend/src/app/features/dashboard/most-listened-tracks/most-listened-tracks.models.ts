import { AudioFeatureInfoKey } from '@shared/audio-features/audio-feature-info';
import { TooltipContent } from '@shared/tooltip/tooltip-content';

export type TrackAudioFeatureRow = {
  key: AudioFeatureInfoKey;
  label: string;
  value: string;
  tooltip: TooltipContent;
};
