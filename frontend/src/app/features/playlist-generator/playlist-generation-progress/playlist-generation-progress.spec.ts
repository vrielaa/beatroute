import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { PlaylistGenerationProgress } from './playlist-generation-progress';
import type {
  PlaylistGenerationStage,
  PlaylistPreparationProgress,
} from '../playlist-generator.models';

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
    expect(progressbar.getAttribute('aria-valuenow')).toBe(stage === 'preparation' ? '0' : '100');
    expect(progressbar.getAttribute('aria-valuemin')).toBe('0');
    expect(progressbar.getAttribute('aria-valuemax')).toBe('100');
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
    ).toBe('100');
  });

  it('shows completion without a loading animation', () => {
    setProgress('completed', false);

    expect(getText()).toContain('Wynik jest gotowy');
    expect(getText()).not.toContain('W toku');
    expect(getText()).not.toContain('Przerwano');
    expect(fixture.nativeElement.querySelector('.is-running')).toBeNull();
    expect(fixture.nativeElement.querySelector('.progress-fill').style.width).toBe('100%');
  });

  it('shows actual completed batches separately from prepared tracks and omissions', () => {
    setProgress('preparation', true, {
      processedTracks: 20,
      totalTracks: 100,
      preparedTracks: 18,
      skippedTracks: 2,
      completedBatches: 1,
      totalBatches: 5,
    });

    expect(getText()).toMatch(/Przetworzono 20 (?:ze|\/) 100 — ukończone partie: 1 (?:z|\/) 5\./);
    expect(getText()).toContain('Przygotowano 18, pominięto 2.');
    expect(getText()).toContain('Pobieranie partii 2 z 5.');
    expect(fixture.nativeElement.querySelector('.progress-fill').style.width).toBe('20%');
    const bar = fixture.nativeElement.querySelector('[role="progressbar"]');
    expect(bar.getAttribute('aria-valuenow')).toBe('20');
    expect(bar.getAttribute('aria-valuetext')).toContain('Przygotowano 18, pominięto 2.');
  });

  it('retains partial progress after interruption without marking the generator as complete', () => {
    setProgress('preparation', false, {
      processedTracks: 40,
      totalTracks: 45,
      preparedTracks: 38,
      skippedTracks: 2,
      completedBatches: 2,
      totalBatches: 3,
    });

    expect(getText()).toMatch(/Przetworzono 40 (?:ze|\/) 45/);
    expect(getText()).toContain('Proces zatrzymany');
    expect(getText()).not.toContain('Pobieranie partii');
    expect(getText()).not.toContain('Wynik jest gotowy');
    expect(fixture.nativeElement.querySelector('.is-running')).toBeNull();
    expect(fixture.nativeElement.querySelectorAll('.is-complete')).toHaveLength(0);
  });

  it('distinguishes completed data preparation from pending analysis', () => {
    setProgress('analysis', true);

    expect(fixture.nativeElement.querySelector('.progress-fill').style.width).toBe('100%');
    expect(getText()).toContain('Analiza i ranking');
    expect(getText()).not.toContain('Wynik jest gotowy');
    expect(getText()).not.toContain('Pobieranie partii');
    expect(fixture.nativeElement.querySelectorAll('.is-complete')).toHaveLength(1);
  });

  it('shows waiting for the first library response without inventing totals or percentages', () => {
    setProgress('preparation', true);
    fixture.componentRef.setInput('source', 'saved-tracks');
    fixture.componentRef.setInput('preparationProgress', null);
    fixture.detectChanges();

    expect(getText()).toContain('Pobieranie zapisanych utworów…');
    expect(getText()).toContain('Etap 1/3');
    expect(getText()).not.toContain('Przetworzono');
    expect(getText()).not.toContain('0 ze 0');
    expect(fixture.nativeElement.querySelector('[role="progressbar"]')).toBeNull();
    expect(fixture.nativeElement.querySelector('.is-running')).not.toBeNull();
  });

  it('does not keep animating when the first library request failed', () => {
    setProgress('preparation', false);
    fixture.componentRef.setInput('preparationProgress', null);
    fixture.detectChanges();

    expect(getText()).toContain('Nie pobrano jeszcze danych.');
    expect(getText()).toContain('Proces zatrzymany');
    expect(fixture.nativeElement.querySelector('.is-running')).toBeNull();
    expect(fixture.nativeElement.querySelector('[role="progressbar"]')).toBeNull();
  });

  it('handles zero known positions without dividing by zero', () => {
    setProgress('preparation', false, {
      processedTracks: 0,
      totalTracks: 0,
      preparedTracks: 0,
      skippedTracks: 0,
      completedBatches: 1,
      totalBatches: 1,
    });

    expect(getText()).toContain('Brak pozycji do przygotowania.');
    expect(getText()).not.toMatch(/NaN|Infinity|0 ze 0/);
    expect(fixture.nativeElement.querySelector('[role="progressbar"]')).toBeNull();
  });

  function setProgress(
    stage: PlaylistGenerationStage,
    isRunning: boolean,
    progress?: PlaylistPreparationProgress
  ): void {
    fixture.componentRef.setInput('stage', stage);
    fixture.componentRef.setInput('isRunning', isRunning);
    fixture.componentRef.setInput(
      'preparationProgress',
      progress ?? {
        processedTracks: stage === 'preparation' ? 0 : 100,
        totalTracks: 100,
        preparedTracks: stage === 'preparation' ? 0 : 100,
        skippedTracks: 0,
        completedBatches: stage === 'preparation' ? 0 : 5,
        totalBatches: 5,
      }
    );
    fixture.detectChanges();
  }

  function getText(): string {
    return fixture.nativeElement.textContent.replace(/\s+/g, ' ').trim();
  }
});
