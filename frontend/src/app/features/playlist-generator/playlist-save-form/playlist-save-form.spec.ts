import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PlaylistSaveForm } from './playlist-save-form';

describe('PlaylistSaveForm', () => {
  let fixture: ComponentFixture<PlaylistSaveForm>;
  let saveRequested: ReturnType<typeof vi.fn<(name: string) => void>>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [PlaylistSaveForm] }).compileComponents();
    fixture = TestBed.createComponent(PlaylistSaveForm);
    fixture.componentRef.setInput('selectedTrackCount', 3);
    saveRequested = vi.fn();
    fixture.componentInstance.saveRequested.subscribe(saveRequested);
    fixture.detectChanges();
  });

  it('starts with an empty name, a disabled save button and no visible validation error', () => {
    expect(getNameInput().value).toBe('');
    expect(getNameInput().required).toBe(true);
    expect(getNameInput().disabled).toBe(false);
    expect(getSaveButton().disabled).toBe(true);
    expect(getSaveButton().textContent?.trim()).toBe('Zapisz w Spotify');
    expect(fixture.nativeElement.querySelector('[role="alert"]')).toBeNull();
    expect(getNameInput().getAttribute('aria-invalid')).toBe('false');
    expect(getNameInput().getAttribute('aria-describedby')).toBe('playlist-save-name-hint');
    expect(fixture.nativeElement.textContent).toContain('Od 1 do 100 znaków');
    expect(fixture.nativeElement.textContent).toContain('Wybrano utworów: 3.');
    expect(getForm().getAttribute('aria-busy')).toBe('false');
    expect(saveRequested).not.toHaveBeenCalled();
  });

  it('does not request a save when the name or selection count changes', () => {
    setName('Na siłownię');
    fixture.componentRef.setInput('selectedTrackCount', 2);
    fixture.detectChanges();

    expect(getSaveButton().disabled).toBe(false);
    expect(fixture.nativeElement.textContent).toContain('Wybrano utworów: 2.');
    expect(saveRequested).not.toHaveBeenCalled();
  });

  it('emits only the trimmed name once after clicking save', () => {
    setName('  Na siłownię  ');

    getSaveButton().click();
    fixture.detectChanges();

    expect(saveRequested).toHaveBeenCalledExactlyOnceWith('Na siłownię');
    expect(getNameInput().value).toBe('  Na siłownię  ');
  });

  it('handles form submission from the keyboard without native navigation', () => {
    setName('Jesienne wieczory');

    const event = submitForm();

    expect(event.defaultPrevented).toBe(true);
    expect(saveRequested).toHaveBeenCalledExactlyOnceWith('Jesienne wieczory');
  });

  it.each([1, 100])('accepts a name of %i characters after trimming', (length) => {
    const name = 'x'.repeat(length);
    setName(`  ${name}  `);

    expect(getSaveButton().disabled).toBe(false);
    submitForm();

    expect(saveRequested).toHaveBeenCalledExactlyOnceWith(name);
    expect(fixture.nativeElement.querySelector('[role="alert"]')).toBeNull();
  });

  it('keeps internal spaces, Polish characters and punctuation in the submitted name', () => {
    setName('  Jesień — chill & jazz 🎵  ');

    submitForm();

    expect(saveRequested).toHaveBeenCalledExactlyOnceWith('Jesień — chill & jazz 🎵');
  });

  it('shows the required-name error after leaving the empty field', () => {
    getNameInput().dispatchEvent(new Event('blur'));
    fixture.detectChanges();

    expect(getErrorText()).toBe('Podaj nazwę playlisty.');
    expect(getNameInput().getAttribute('aria-invalid')).toBe('true');
    expect(getNameInput().getAttribute('aria-describedby')).toContain('playlist-save-name-error');
    expect(saveRequested).not.toHaveBeenCalled();
  });

  it('rejects a name containing only spaces', () => {
    setName('   ');

    expect(getErrorText()).toBe('Podaj nazwę playlisty.');
    expect(getSaveButton().disabled).toBe(true);
    submitForm();

    expect(saveRequested).not.toHaveBeenCalled();
  });

  it('rejects more than 100 characters without truncating the input', () => {
    const name = 'x'.repeat(101);
    setName(name);

    expect(getNameInput().value).toBe(name);
    expect(getErrorText()).toBe('Nazwa playlisty może mieć maksymalnie 100 znaków.');
    expect(getSaveButton().disabled).toBe(true);
    submitForm();

    expect(saveRequested).not.toHaveBeenCalled();
  });

  it('marks an empty field as touched on a forced submit without emitting a name', () => {
    submitForm();

    expect(getErrorText()).toBe('Podaj nazwę playlisty.');
    expect(fixture.nativeElement.querySelectorAll('[role="alert"]')).toHaveLength(1);
    expect(saveRequested).not.toHaveBeenCalled();
  });

  it('removes the validation error after correcting the name', () => {
    setName(' '.repeat(3));
    expect(getSaveButton().disabled).toBe(true);

    setName('Na spacer');

    expect(fixture.nativeElement.querySelector('[role="alert"]')).toBeNull();
    expect(getNameInput().getAttribute('aria-invalid')).toBe('false');
    expect(getNameInput().getAttribute('aria-describedby')).toBe('playlist-save-name-hint');
    expect(getSaveButton().disabled).toBe(false);
    submitForm();
    expect(saveRequested).toHaveBeenCalledExactlyOnceWith('Na spacer');
  });

  it.each([0, -1, 1.5, 501, Number.NaN, Number.POSITIVE_INFINITY])(
    'does not request a save for an invalid selected count: %s',
    (selectedTrackCount) => {
      setName('Playlist');
      fixture.componentRef.setInput('selectedTrackCount', selectedTrackCount);
      fixture.detectChanges();

      expect(getSaveButton().disabled).toBe(true);
      submitForm();

      expect(saveRequested).not.toHaveBeenCalled();
    }
  );

  it('explains the empty selection and restores saving without clearing the name', () => {
    setName('Na trening');
    fixture.componentRef.setInput('selectedTrackCount', 0);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Wybierz co najmniej jeden utwór');
    expect(getSaveButton().disabled).toBe(true);

    fixture.componentRef.setInput('selectedTrackCount', 2);
    fixture.detectChanges();

    expect(getNameInput().value).toBe('Na trening');
    expect(getSaveButton().disabled).toBe(false);
    expect(fixture.nativeElement.textContent).not.toContain('Wybierz co najmniej jeden utwór');
    expect(saveRequested).not.toHaveBeenCalled();
  });

  it('allows saving exactly 500 selected tracks', () => {
    setName('Cały wybór');
    fixture.componentRef.setInput('selectedTrackCount', 500);
    fixture.detectChanges();

    expect(getSaveButton().disabled).toBe(false);
    submitForm();

    expect(saveRequested).toHaveBeenCalledExactlyOnceWith('Cały wybór');
  });

  it('locks the field and further submissions while the parent reports a pending save', () => {
    setName('Na trening');
    submitForm();
    fixture.componentRef.setInput('isSaving', true);
    fixture.detectChanges();

    expect(getNameInput().disabled).toBe(true);
    expect(getSaveButton().disabled).toBe(true);
    expect(getSaveButton().textContent?.trim()).toBe('Zapisywanie playlisty…');
    expect(getForm().getAttribute('aria-busy')).toBe('true');
    submitForm();

    expect(saveRequested).toHaveBeenCalledExactlyOnceWith('Na trening');
  });

  it('preserves the name and resumes validation when the parent finishes saving', () => {
    setName('Playlist');
    fixture.componentRef.setInput('isSaving', true);
    fixture.detectChanges();

    fixture.componentRef.setInput('isSaving', false);
    fixture.detectChanges();

    expect(getNameInput().value).toBe('Playlist');
    expect(getNameInput().disabled).toBe(false);
    expect(getSaveButton().disabled).toBe(false);
    expect(getForm().getAttribute('aria-busy')).toBe('false');
    expect(saveRequested).not.toHaveBeenCalled();

    setName('');
    expect(getSaveButton().disabled).toBe(true);
  });

  function getNameInput(): HTMLInputElement {
    const element = fixture.nativeElement.querySelector('#playlist-save-name');
    if (!(element instanceof HTMLInputElement)) {
      throw new Error('Nie znaleziono pola nazwy playlisty');
    }
    return element;
  }

  function getSaveButton(): HTMLButtonElement {
    const element = fixture.nativeElement.querySelector('#playlist-save');
    if (!(element instanceof HTMLButtonElement)) {
      throw new Error('Nie znaleziono przycisku zapisu playlisty');
    }
    return element;
  }

  function getForm(): HTMLFormElement {
    const element = fixture.nativeElement.querySelector('form');
    if (!(element instanceof HTMLFormElement)) {
      throw new Error('Nie znaleziono formularza zapisu playlisty');
    }
    return element;
  }

  function setName(name: string): void {
    const input = getNameInput();
    input.value = name;
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  }

  function submitForm(): Event {
    const event = new Event('submit', { bubbles: true, cancelable: true });
    getForm().dispatchEvent(event);
    fixture.detectChanges();
    return event;
  }

  function getErrorText(): string {
    const element = fixture.nativeElement.querySelector('[role="alert"]');
    if (!(element instanceof HTMLElement)) {
      throw new Error('Nie znaleziono komunikatu błędu nazwy playlisty');
    }
    return element.textContent?.trim() ?? '';
  }
});
