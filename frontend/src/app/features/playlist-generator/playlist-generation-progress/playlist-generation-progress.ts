import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { PlaylistGenerationStage } from '../playlist-generator.models';

const GENERATION_STAGES: PlaylistGenerationStage[] = ['preparation', 'analysis', 'completed'];
const STAGE_LABELS: Record<PlaylistGenerationStage, string> = {
  preparation: 'Pobieranie danych',
  analysis: 'Analiza i ranking',
  completed: 'Gotowy wynik',
};
const STAGE_DESCRIPTIONS: Record<PlaylistGenerationStage, string> = {
  preparation: 'Pobieram metadane ze Spotify i cechy audio z ReccoBeats.',
  analysis: 'Sprawdzam wymagania i oceniam dopasowanie utworów do Twoich preferencji.',
  completed: 'Analiza zakończona. Poniżej znajdziesz ranking i powody odrzucenia utworów.',
};

@Component({
  selector: 'app-playlist-generation-progress',
  templateUrl: './playlist-generation-progress.html',
  styleUrl: './playlist-generation-progress.scss',
  changeDetection: ChangeDetectionStrategy.Eager,
})
class PlaylistGenerationProgress {
  /** Rzeczywisty etap wskazany przez odpowiedzi API; komponent sam go nie zmienia. */
  public readonly stage = input.required<PlaylistGenerationStage>();
  /** Czy proces nadal trwa; false przed completed oznacza zatrzymanie, nie sukces. */
  public readonly isRunning = input.required<boolean>();

  protected readonly stages = GENERATION_STAGES;
  protected readonly stageLabels = STAGE_LABELS;
  protected readonly currentStep = computed(() => GENERATION_STAGES.indexOf(this.stage()) + 1);
  protected readonly completedSteps = computed(() =>
    this.stage() === 'completed' ? GENERATION_STAGES.length : this.currentStep() - 1
  );
  protected readonly completedPercentage = computed(
    () => (this.completedSteps() / GENERATION_STAGES.length) * 100
  );
  protected readonly isAnimating = computed(() => this.isRunning() && this.stage() !== 'completed');
  protected readonly description = computed(() =>
    this.isAnimating() || this.stage() === 'completed'
      ? STAGE_DESCRIPTIONS[this.stage()]
      : 'Proces nie został ukończony. Sprawdź informacje o brakach danych lub błędzie.'
  );
}

export { PlaylistGenerationProgress };
