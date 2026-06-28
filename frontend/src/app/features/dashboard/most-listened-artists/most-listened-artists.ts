import {
  Component,
  ElementRef,
  computed,
  effect,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { TimeRange, TopArtist } from '@src/app/core/models/models';
import { Icon } from '@shared/components/icon/icon';

@Component({
  selector: 'app-most-listened-artists',
  imports: [Icon],
  templateUrl: './most-listened-artists.html',
  host: {
    class: 'col-span-full flex w-full min-w-[0] flex-col gap-[2rem] max-[420px]:gap-[1.4rem]',
  },
})
export class MostListenedArtists {
  private readonly skeletonGrid = viewChild<ElementRef<HTMLOListElement>>('skeletonGrid');
  private readonly skeletonCount = signal(1);

  public readonly timeRange = input<TimeRange>('short_term');
  public readonly artists = input<TopArtist[]>([]);
  public readonly artistGenres = input<Record<string, string[]>>({});
  public readonly isLoading = input(true);
  public readonly hasError = input(false);
  public readonly retryRequested = output<void>();
  public readonly skeletonItems = computed(() =>
    Array.from({ length: this.skeletonCount() }, (_, index) => index)
  );

  public readonly periodLabel = computed(() => {
    const labels: Record<TimeRange, string> = {
      short_term: 'ostatniego miesiąca',
      medium_term: 'ostatnich 6 miesięcy',
      long_term: 'ostatniego roku',
    };

    return labels[this.timeRange()];
  });

  constructor() {
    effect((onCleanup) => {
      const grid = this.skeletonGrid();

      if (!this.isLoading() || !grid) return;

      const element = grid.nativeElement;
      const observer = new ResizeObserver(() => this.updateSkeletonCount(element));

      observer.observe(element);
      this.updateSkeletonCount(element);

      onCleanup(() => observer.disconnect());
    });
  }

  public retry(): void {
    this.retryRequested.emit();
  }

  public artistInitial(artist: TopArtist): string {
    return artist.name.charAt(0).toUpperCase();
  }

  public artistGenresFor(artist: TopArtist): string[] {
    return this.artistGenres()[this.normalizeArtistName(artist.name)] ?? [];
  }

  private normalizeArtistName(artistName: string): string {
    return artistName.trim().toLocaleLowerCase();
  }

  private updateSkeletonCount(grid: HTMLOListElement): void {
    const columns = getComputedStyle(grid).gridTemplateColumns.split(/\s+/).filter(Boolean).length;
    const nextCount = Math.max(columns, 1);

    if (nextCount !== this.skeletonCount()) {
      this.skeletonCount.set(nextCount);
    }
  }
}
