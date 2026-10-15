import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { PlaylistSourceForm } from './playlist-source-form';

const playlistId = '2DsAx0MIcI0oyB8AV8ndn2';

describe('PlaylistSourceForm', () => {
  it('starts without a visible error and explains the source ownership and ID', () => {
    const { fixture, input, emit } = setup();
    expect(input.value).toBe('');
    expect(input.required).toBe(true);
    expect(fixture.nativeElement.querySelector('[role="alert"]')).toBeNull();
    expect(fixture.nativeElement.textContent).toContain('właścicielem lub współtwórcą');
    expect(fixture.nativeElement.textContent).toContain(
      'https://open.spotify.com/playlist/ID_PLAYLISTY'
    );
    expect(emit).toHaveBeenCalledExactlyOnceWith(null);
  });

  it.each([
    playlistId,
    ` ${playlistId} `,
    `https://open.spotify.com/playlist/${playlistId}`,
    `https://open.spotify.com/playlist/${playlistId}/?si=shared#fragment`,
    `https://open.spotify.com/intl-pl/playlist/${playlistId}?si=shared`,
  ])('extracts the same case-sensitive ID from %s', (reference) => {
    const { fixture, setReference, emit } = setup();
    setReference(reference);
    expect(emit).toHaveBeenLastCalledWith(playlistId);
    expect(fixture.nativeElement.querySelector('[role="alert"]')).toBeNull();
  });

  it.each([
    ' ',
    'short',
    'A'.repeat(23),
    'ą'.repeat(22),
    `http://open.spotify.com/playlist/${playlistId}`,
    `https://example.com/playlist/${playlistId}`,
    `https://open.spotify.com.example.com/playlist/${playlistId}`,
    `https://open.spotify.com/track/${playlistId}`,
    `https://open.spotify.com/playlist/${playlistId}/extra`,
    `https://user@open.spotify.com/playlist/${playlistId}`,
    `https://open.spotify.com:444/playlist/${playlistId}`,
    `spotify:playlist:${playlistId}`,
  ])('rejects an invalid reference without emitting an old ID: %s', (reference) => {
    const { fixture, setReference, emit } = setup();
    setReference(playlistId);
    setReference(reference);
    expect(emit).toHaveBeenLastCalledWith(null);
    expect(fixture.nativeElement.querySelector('[role="alert"]')?.textContent).toContain(
      'Podaj poprawne ID lub link'
    );
  });

  it('shows the required error after leaving the empty field', () => {
    const { fixture, input } = setup();
    input.dispatchEvent(new Event('blur'));
    fixture.detectChanges();
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(input.getAttribute('aria-describedby')).toContain('playlist-source-error');
    expect(fixture.nativeElement.querySelector('[role="alert"]')?.textContent).toContain(
      'Podaj ID lub link'
    );
  });

  it('preserves the input and ID when locked and unlocked', () => {
    const { fixture, input, setReference, emit } = setup();
    setReference(`https://open.spotify.com/playlist/${playlistId}`);
    emit.mockClear();
    fixture.componentRef.setInput('isDisabled', true);
    fixture.detectChanges();
    expect(input.disabled).toBe(true);
    fixture.componentRef.setInput('isDisabled', false);
    fixture.detectChanges();
    expect(input.disabled).toBe(false);
    expect(input.value).toContain(playlistId);
    expect(emit).not.toHaveBeenCalled();
  });

  it('does not report a changed source when a sharing URL resolves to the same ID', () => {
    const { setReference, emit } = setup();
    setReference(playlistId);
    emit.mockClear();
    setReference(`https://open.spotify.com/playlist/${playlistId}?si=new`);
    expect(emit).not.toHaveBeenCalled();
  });
});

function setup() {
  TestBed.configureTestingModule({ imports: [PlaylistSourceForm] });
  const fixture = TestBed.createComponent(PlaylistSourceForm);
  const emit = vi.fn();
  fixture.componentInstance.playlistIdChange.subscribe(emit);
  fixture.detectChanges();
  const input = fixture.nativeElement.querySelector(
    '#playlist-source-reference'
  ) as HTMLInputElement | null;
  if (!input) throw new Error('Nie znaleziono pola ID lub linku playlisty');
  const setReference = (reference: string) => {
    input.value = reference;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();
  };
  return { fixture, input, setReference, emit };
}
