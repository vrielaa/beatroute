import { Component, computed, input } from '@angular/core';
import { AudioFeatures, TimeRange, TopTrack } from '@src/app/core/models/models';
import { Icon } from '@shared/components/icon/icon';

type TrackAudioFeatureRow = {
  label: string;
  value: string;
};

@Component({
  selector: 'app-most-listened-tracks',
  imports: [Icon],
  templateUrl: './most-listened-tracks.html',
  host: {
    class: 'col-span-full flex w-full min-w-[0] flex-col gap-[2rem] max-[420px]:gap-[1.4rem]',
  },
})
export class MostListenedTracks {
  private readonly keyNames = ['C', 'C#/Db', 'D', 'D#/Eb', 'E', 'F', 'F#/Gb', 'G', 'G#/Ab', 'A', 'A#/Bb', 'B'];

  public readonly tracks = input<TopTrack[]>([]);
  public readonly audioFeatures = input<AudioFeatures[]>([]);
  public readonly timeRange = input<TimeRange>('short_term');
  public readonly isLoading = input(false);
  public readonly trackRowClasses =
    'grid list-none grid-cols-[2.8rem_minmax(0,1.2fr)_minmax(0,0.9fr)_1.6rem] items-center gap-[1rem] px-[1rem] py-[1rem] max-[640px]:grid-cols-[2.4rem_minmax(0,1fr)_1.6rem] max-[640px]:gap-[0.8rem]';
  public readonly expandableTrackRowClasses = `${this.trackRowClasses} cursor-pointer [&::-webkit-details-marker]:hidden`;

  public readonly audioFeaturesByTrackId = computed(() => {
    const featuresByTrackId = new Map<string, AudioFeatures>();

    for (const features of this.audioFeatures()) {
      if (features.spotifyId) {
        featuresByTrackId.set(features.spotifyId, features);
      }
    }

    return featuresByTrackId;
  });

  public readonly periodLabel = computed(() => {
    const labels: Record<TimeRange, string> = {
      short_term: 'ostatniego miesiąca',
      medium_term: 'ostatnich 6 miesięcy',
      long_term: 'ostatniego roku',
    };

    return labels[this.timeRange()];
  });

  public artistNames(track: TopTrack): string {
    return track.artists.map((artist) => artist.name).join(', ');
  }

  public audioFeaturesFor(track: TopTrack): AudioFeatures | null {
    return this.audioFeaturesByTrackId().get(track.id) ?? null;
  }

  public hasAudioFeatures(track: TopTrack): boolean {
    const features = this.audioFeaturesFor(track);

    return Boolean(features && !features.error);
  }

  public audioFeatureRows(track: TopTrack): TrackAudioFeatureRow[] {
    const features = this.audioFeaturesFor(track);

    if (!features || features.error) {
      return [];
    }

    return [
      { label: 'BPM', value: this.formatNumber(features.tempo, 0, ' BPM') },
      { label: 'Energia', value: this.formatNumber(features.energy, 2) },
      { label: 'Taneczność', value: this.formatNumber(features.danceability, 2) },
      { label: 'Nastrój', value: this.formatNumber(features.valence, 2) },
      { label: 'Akustyczność', value: this.formatNumber(features.acousticness, 2) },
      { label: 'Instrumentalność', value: this.formatNumber(features.instrumentalness, 2) },
      { label: 'Live', value: this.formatNumber(features.liveness, 2) },
      { label: 'Mowa', value: this.formatNumber(features.speechiness, 2) },
      { label: 'Głośność', value: this.formatNumber(features.loudness, 1, ' dB') },
      { label: 'Tonacja', value: this.formatKey(features.key) },
      { label: 'Tryb', value: this.formatMode(features.mode) },
      { label: 'Metrum', value: this.formatTimeSignature(features.timeSignature) },
    ];
  }

  private formatNumber(value: number | null | undefined, decimals: number, unit = ''): string {
    return typeof value === 'number' ? `${value.toFixed(decimals)}${unit}` : 'Brak danych';
  }

  private formatKey(value: number | null | undefined): string {
    if (typeof value !== 'number' || value < 0) {
      return 'Brak danych';
    }

    return this.keyNames[value] ?? 'Brak danych';
  }

  private formatMode(value: number | null | undefined): string {
    if (value === 1) return 'Durowy';
    if (value === 0) return 'Molowy';

    return 'Brak danych';
  }

  private formatTimeSignature(value: number | null | undefined): string {
    return typeof value === 'number' ? `${value}/4` : 'Brak danych';
  }
}
