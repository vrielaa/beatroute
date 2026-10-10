import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PlaylistCriteriaForm } from './playlist-criteria-form';
import type { PlaylistCriteria, PlaylistPreferenceFeature } from '../playlist-generator.models';

describe('PlaylistCriteriaForm', () => {
  let fixture: ComponentFixture<PlaylistCriteriaForm>;
  let criteriaChange: ReturnType<typeof vi.fn<(criteria: PlaylistCriteria | null) => void>>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [PlaylistCriteriaForm] }).compileComponents();
    fixture = TestBed.createComponent(PlaylistCriteriaForm);
    criteriaChange = vi.fn();
    fixture.componentInstance.criteriaChange.subscribe(criteriaChange);
    fixture.detectChanges();
  });

  it('starts with requirement inputs hidden and all preferences set to null', () => {
    expect(criteriaChange).toHaveBeenCalledExactlyOnceWith(createDefaultCriteria());
    expect(fixture.nativeElement.querySelector('input[type="number"]')).toBeNull();
    expect(fixture.nativeElement.querySelectorAll('input[type="checkbox"]')).toHaveLength(3);
    expect(fixture.nativeElement.querySelectorAll('select')).toHaveLength(5);
    expect(getText()).toContain('Ustawienia są poprawne.');
  });

  it.each([
    { feature: 'tempo', inputNames: ['tempo-min', 'tempo-max'] },
    { feature: 'speechiness', inputNames: ['max-speechiness'] },
    { feature: 'liveness', inputNames: ['max-liveness'] },
  ])('shows only the $feature inputs when its checkbox is checked', ({ feature, inputNames }) => {
    setEnabled(feature, true);

    expect(fixture.nativeElement.querySelectorAll('input[type="number"]')).toHaveLength(
      inputNames.length
    );
    for (const name of inputNames) {
      expect(getNumber(name).disabled).toBe(false);
    }

    setEnabled(feature, false);

    expect(fixture.nativeElement.querySelector('input[type="number"]')).toBeNull();
    expect(criteriaChange).toHaveBeenLastCalledWith(createDefaultCriteria());
  });

  it('explains the difference between hard requirements and ranking preferences', () => {
    expect(getText()).toContain('Utwór musi spełnić wszystkie włączone wymagania');
    expect(getText()).toContain('Brak potrzebnego pomiaru również powoduje odrzucenie');
    expect(getText()).toContain('Preferencje nie odrzucają utworów');
  });

  it('requires both boundaries when the BPM requirement is enabled', () => {
    setEnabled('tempo', true);

    expect(getNumber('tempo-min').disabled).toBe(false);
    expect(getNumber('tempo-max').disabled).toBe(false);
    expect(criteriaChange).toHaveBeenLastCalledWith(null);

    setNumber('tempo-min', '120');

    expect(criteriaChange).toHaveBeenLastCalledWith(null);

    setNumber('tempo-max', '140');

    expect(criteriaChange).toHaveBeenLastCalledWith({
      ...createDefaultCriteria(),
      requirements: { tempoRange: { min: 120, max: 140 }, maxSpeechiness: null, maxLiveness: null },
    });
  });

  it('accepts equal BPM boundaries and fractional tempo values', () => {
    setEnabled('tempo', true);
    setNumber('tempo-min', '128.5');
    setNumber('tempo-max', '128.5');

    expect(criteriaChange).toHaveBeenLastCalledWith({
      ...createDefaultCriteria(),
      requirements: {
        tempoRange: { min: 128.5, max: 128.5 },
        maxSpeechiness: null,
        maxLiveness: null,
      },
    });
  });

  it.each([
    { min: '0', max: '140' },
    { min: '-1', max: '140' },
    { min: '120', max: '0' },
    { min: '120', max: '-1' },
    { min: '', max: '140' },
    { min: '120', max: '' },
    { min: '1e309', max: '140' },
  ])('rejects invalid BPM boundaries: $min–$max', ({ min, max }) => {
    setEnabled('tempo', true);
    setNumber('tempo-min', min);
    setNumber('tempo-max', max);

    expect(criteriaChange).toHaveBeenLastCalledWith(null);
    expect(getText()).toContain('Popraw lub uzupełnij aktywne kryteria');
    expect(fixture.nativeElement.querySelector('[role="alert"]')).not.toBeNull();
  });

  it('reports reversed BPM boundaries and accepts them after correction', () => {
    setEnabled('tempo', true);
    setNumber('tempo-min', '140');
    setNumber('tempo-max', '120');

    expect(criteriaChange).toHaveBeenLastCalledWith(null);
    expect(getText()).toContain('Minimum BPM nie może być większe niż maksimum BPM');

    setNumber('tempo-max', '160');

    expect(criteriaChange).toHaveBeenLastCalledWith({
      ...createDefaultCriteria(),
      requirements: { tempoRange: { min: 140, max: 160 }, maxSpeechiness: null, maxLiveness: null },
    });
    expect(getText()).not.toContain('Minimum BPM nie może być większe niż maksimum BPM');
  });

  it('excludes invalid BPM values and removes their errors after disabling the requirement', () => {
    setEnabled('tempo', true);
    setNumber('tempo-min', '140');
    setNumber('tempo-max', '120');
    setEnabled('tempo', false);

    expect(criteriaChange).toHaveBeenLastCalledWith(createDefaultCriteria());
    expect(fixture.nativeElement.querySelector('#playlist-tempo-min')).toBeNull();
    expect(fixture.nativeElement.querySelector('#playlist-tempo-max')).toBeNull();
    expect(fixture.nativeElement.querySelector('[role="alert"]')).toBeNull();
  });

  it('restores both BPM boundaries after hiding and showing the inputs', () => {
    setEnabled('tempo', true);
    setNumber('tempo-min', '120');
    setNumber('tempo-max', '140');
    setEnabled('tempo', false);

    expect(criteriaChange).toHaveBeenLastCalledWith(createDefaultCriteria());

    setEnabled('tempo', true);

    expect(getNumber('tempo-min').value).toBe('120');
    expect(getNumber('tempo-max').value).toBe('140');
    expect(criteriaChange).toHaveBeenLastCalledWith({
      ...createDefaultCriteria(),
      requirements: { tempoRange: { min: 120, max: 140 }, maxSpeechiness: null, maxLiveness: null },
    });
  });

  describe.each(['speechiness', 'liveness'])('%s maximum', (feature) => {
    const inputName = `max-${feature}`;
    const property = feature === 'speechiness' ? 'maxSpeechiness' : 'maxLiveness';

    it('requires a number only when the requirement is enabled', () => {
      setEnabled(feature, true);

      expect(getNumber(inputName).disabled).toBe(false);
      expect(criteriaChange).toHaveBeenLastCalledWith(null);

      setEnabled(feature, false);

      expect(criteriaChange).toHaveBeenLastCalledWith(createDefaultCriteria());
      expect(fixture.nativeElement.querySelector(`#playlist-${inputName}`)).toBeNull();
    });

    it.each(['0', '0.33', '1'])('accepts %s without treating zero as disabled', (value) => {
      setEnabled(feature, true);
      setNumber(inputName, value);

      expect(criteriaChange).toHaveBeenLastCalledWith({
        ...createDefaultCriteria(),
        requirements: { ...createDefaultCriteria().requirements, [property]: Number(value) },
      });
    });

    it.each(['', '-0.1', '1.1', '1e309'])('rejects invalid maximum %s', (value) => {
      setEnabled(feature, true);
      setNumber(inputName, value);

      expect(criteriaChange).toHaveBeenLastCalledWith(null);
      expect(getText()).toContain(`Podaj skończoną liczbę od 0 do 1 dla ${feature}`);
    });

    it('sends null when disabled but restores the edited number when enabled again', () => {
      setEnabled(feature, true);
      setNumber(inputName, '0.33');
      setEnabled(feature, false);

      expect(fixture.nativeElement.querySelector(`#playlist-${inputName}`)).toBeNull();
      expect(criteriaChange).toHaveBeenLastCalledWith(createDefaultCriteria());

      setEnabled(feature, true);

      expect(getNumber(inputName).value).toBe('0.33');
      expect(criteriaChange).toHaveBeenLastCalledWith({
        ...createDefaultCriteria(),
        requirements: { ...createDefaultCriteria().requirements, [property]: 0.33 },
      });
    });
  });

  const features: PlaylistPreferenceFeature[] = [
    'energy',
    'danceability',
    'valence',
    'acousticness',
    'instrumentalness',
  ];

  describe.each(features)('%s preference', (feature) => {
    it.each([
      { label: 'Niska', level: 'low' },
      { label: 'Średnia', level: 'medium' },
      { label: 'Wysoka', level: 'high' },
      { label: 'Bez znaczenia', level: null },
    ])('maps $label to $level', ({ label, level }) => {
      setPreference(feature, label);

      expect(criteriaChange).toHaveBeenLastCalledWith({
        ...createDefaultCriteria(),
        preferences: { ...createDefaultCriteria().preferences, [feature]: level },
      });
    });
  });

  it('preserves chosen preferences while validating requirements and sends all fields', () => {
    setPreference('energy', 'Wysoka');
    setPreference('valence', 'Średnia');
    setEnabled('tempo', true);

    expect(criteriaChange).toHaveBeenLastCalledWith(null);

    setNumber('tempo-min', '120');
    setNumber('tempo-max', '140');
    setEnabled('speechiness', true);
    setNumber('max-speechiness', '0');
    setEnabled('liveness', true);
    setNumber('max-liveness', '1');

    expect(criteriaChange).toHaveBeenLastCalledWith({
      requirements: { tempoRange: { min: 120, max: 140 }, maxSpeechiness: 0, maxLiveness: 1 },
      preferences: {
        energy: 'high',
        danceability: null,
        valence: 'medium',
        acousticness: null,
        instrumentalness: null,
      },
    });
  });

  it('can turn an active preference back off without removing other choices', () => {
    setPreference('energy', 'Wysoka');
    setPreference('danceability', 'Niska');
    setPreference('energy', 'Bez znaczenia');

    expect(criteriaChange).toHaveBeenLastCalledWith({
      ...createDefaultCriteria(),
      preferences: { ...createDefaultCriteria().preferences, danceability: 'low' },
    });
  });

  function getText(): string {
    return fixture.nativeElement.textContent.replace(/\s+/g, ' ').trim();
  }

  function getNumber(name: string): HTMLInputElement {
    const element = fixture.nativeElement.querySelector(`#playlist-${name}`);

    if (!(element instanceof HTMLInputElement) || element.type !== 'number') {
      throw new Error(`Nie znaleziono pola liczbowego: playlist-${name}`);
    }

    return element;
  }

  function setNumber(name: string, value: string): void {
    const input = getNumber(name);
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();
  }

  function setEnabled(feature: string, enabled: boolean): void {
    const input: HTMLInputElement = fixture.nativeElement.querySelector(
      `#playlist-${feature}-enabled`
    );
    input.checked = enabled;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();
  }

  function setPreference(feature: PlaylistPreferenceFeature, label: string): void {
    const select: HTMLSelectElement = fixture.nativeElement.querySelector(
      `#playlist-preference-${feature}`
    );
    const option = Array.from(select.options).find((option) => option.textContent === label);

    if (!option) {
      throw new Error(`Missing preference option: ${label}`);
    }

    select.value = option.value;
    select.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();
  }
});

function createDefaultCriteria(): PlaylistCriteria {
  return {
    requirements: { tempoRange: null, maxSpeechiness: null, maxLiveness: null },
    preferences: {
      energy: null,
      danceability: null,
      valence: null,
      acousticness: null,
      instrumentalness: null,
    },
  };
}
