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
  public readonly artistsGridClasses =
    'grid grid-cols-[repeat(auto-fill,minmax(min(15rem,100%),1fr))] justify-items-center gap-[1.2rem] max-[700px]:grid-cols-[repeat(auto-fill,minmax(min(13rem,100%),1fr))] max-[700px]:gap-[1rem] max-[420px]:grid-cols-2 max-[420px]:gap-[0.8rem] max-[320px]:grid-cols-1';
  private readonly artistCardBaseClasses =
    'relative flex w-fit min-w-[min(13rem,100%)] max-w-[min(28rem,100%)] flex-col items-center gap-[1rem] overflow-hidden rounded-[var(--radius-lg)] border border-transparent bg-[var(--color-surface-secondary)] px-[1.2rem] py-[1.6rem] [transition:transform_var(--transition-base),background-color_var(--transition-base),border-color_var(--transition-base)] motion-reduce:[transition:none] max-[420px]:gap-[0.8rem] max-[420px]:px-[0.8rem] max-[420px]:py-[1.4rem]';
  public readonly artistCardClasses = `${this.artistCardBaseClasses} hover:[transform:translateY(-0.3rem)] hover:border-[var(--color-border)] hover:bg-[var(--color-surface-tertiary)]`;
  public readonly skeletonCardClasses = `${this.artistCardBaseClasses} w-full max-w-none`;
  private readonly artistRankLayoutClasses =
    'absolute left-[1rem] top-[1rem] z-[1] grid h-[2.6rem] min-w-[2.6rem] place-items-center rounded-[var(--radius-pill)] px-[0.6rem] text-[length:var(--text-xs)] font-[var(--font-weight-bold)] shadow-[0_0.4rem_1.2rem_var(--color-shadow)] max-[420px]:left-[0.8rem] max-[420px]:top-[0.8rem]';
  public readonly artistRankClasses = `${this.artistRankLayoutClasses} bg-[var(--color-surface)] text-[var(--color-text-secondary)]`;
  public readonly topArtistRankClasses = `${this.artistRankLayoutClasses} bg-[var(--color-accent)] text-[var(--color-text-on-accent)]`;
  public readonly artistImageClasses =
    'grid h-[clamp(7.2rem,9vw,9.6rem)] w-[clamp(7.2rem,9vw,9.6rem)] place-items-center overflow-hidden rounded-full bg-[linear-gradient(145deg,var(--color-accent),var(--color-info))] text-[length:var(--text-3xl)] font-[var(--font-weight-bold)] text-[var(--color-text-on-accent)] shadow-[0_0.8rem_2rem_var(--color-shadow-strong)] max-[700px]:h-[8rem] max-[700px]:w-[8rem] max-[420px]:h-[7.2rem] max-[420px]:w-[7.2rem]';
  public readonly stateMessageClasses =
    'flex min-h-[18rem] flex-col items-center justify-center gap-[1.2rem] text-center text-[var(--color-text-secondary)]';
  public readonly retryButtonClasses =
    'rounded-[var(--radius-pill)] bg-[var(--color-accent)] px-[1.4rem] py-[0.8rem] text-[length:var(--text-sm)] font-[var(--font-weight-semibold)] text-[var(--color-text-on-accent)] [transition:background-color_var(--transition-fast)] hover:bg-[var(--color-accent-hover)]';

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
