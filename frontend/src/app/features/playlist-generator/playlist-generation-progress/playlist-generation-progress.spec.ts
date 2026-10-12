import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { PlaylistGenerationProgress } from './playlist-generation-progress';
import type { PlaylistGenerationStage } from '../playlist-generator.models';

describe('PlaylistGenerationProgress', () => {
  let fixture: ComponentFixture<PlaylistGenerationProgress>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PlaylistGenerationProgress],
    }).compileComponents();
    fixture = TestBed.createComponent(PlaylistGenerationProgress);
  });

  it.each<{ stage: PlaylistGenerationStage; step: number; completed: number; label: string }>([
    { stage: 'preparation', step: 1, completed: 0, label: 'Pobieranie danych' },
    { stage: 'analysis', step: 2, completed: 1, label: 'Analiza i ranking' },
    { stage: 'completed', step: 3, completed: 3, label: 'Gotowy wynik' },
  ])('shows the actual $stage step and completed count', ({ stage, step, completed, label }) => {
    setProgress(stage, stage !== 'completed');

    expect(getText()).toContain(`Etap ${step}/3`);
    expect(getText()).toContain(label);
    const progressbar = fixture.nativeElement.querySelector('[role="progressbar"]');
    expect(progressbar.getAttribute('aria-valuenow')).toBe(String(completed));
    expect(progressbar.getAttribute('aria-valuemin')).toBe('0');
    expect(progressbar.getAttribute('aria-valuemax')).toBe('3');
    expect(fixture.nativeElement.querySelectorAll('.is-complete')).toHaveLength(completed);
  });

  it('announces the current stage and only highlights the active step', () => {
    setProgress('preparation', true);

    const announcement = fixture.nativeElement.querySelector('[role="status"]');
    expect(announcement.getAttribute('aria-live')).toBe('polite');
    expect(announcement.textContent).toContain('metadane ze Spotify i cechy audio z ReccoBeats');
    expect(fixture.nativeElement.querySelectorAll('[aria-current="step"]')).toHaveLength(1);
    expect(getText()).toContain('W toku');
    expect(getText()).toContain('Oczekuje');
  });

  it('does not mark an interrupted request as complete or keep animating', () => {
    setProgress('analysis', false);

    expect(getText()).toContain('Proces zatrzymany');
    expect(getText()).toContain('Przerwano');
    expect(getText()).not.toContain('W toku');
    expect(fixture.nativeElement.querySelector('.is-running')).toBeNull();
    expect(fixture.nativeElement.querySelectorAll('.is-complete')).toHaveLength(1);
    expect(
      fixture.nativeElement.querySelector('[role="progressbar"]').getAttribute('aria-valuenow')
    ).toBe('1');
  });

  it('shows completion without a loading animation', () => {
    setProgress('completed', false);

    expect(getText()).toContain('Wynik jest gotowy');
    expect(getText()).not.toContain('W toku');
    expect(getText()).not.toContain('Przerwano');
    expect(fixture.nativeElement.querySelector('.is-running')).toBeNull();
    expect(fixture.nativeElement.querySelector('.progress-fill').style.width).toBe('100%');
  });

  function setProgress(stage: PlaylistGenerationStage, isRunning: boolean): void {
    fixture.componentRef.setInput('stage', stage);
    fixture.componentRef.setInput('isRunning', isRunning);
    fixture.detectChanges();
  }

  function getText(): string {
    return fixture.nativeElement.textContent.replace(/\s+/g, ' ').trim();
  }
});
