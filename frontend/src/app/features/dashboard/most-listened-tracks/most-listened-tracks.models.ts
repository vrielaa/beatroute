import { AudioFeatureInfoKey } from '@shared/audio-features/audio-feature-info';
import { TooltipContent } from '@shared/tooltip/tooltip-content';

type TrackAudioFeatureRow = {
  key: AudioFeatureInfoKey;
  label: string;
  value: string;
  tooltip: TooltipContent;
};

export type { TrackAudioFeatureRow };
