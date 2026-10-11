import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type {
  PlaylistTrackRejectionReason,
  RejectedPlaylistTrack,
} from '../../playlist-generator.models';
import { PlaylistRejectedTracks } from './playlist-rejected-tracks';

describe('PlaylistRejectedTracks', () => {
  let fixture: ComponentFixture<PlaylistRejectedTracks>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [PlaylistRejectedTracks] }).compileComponents();
    fixture = TestBed.createComponent(PlaylistRejectedTracks);
  });

  it('reports no rejected tracks without displaying an empty list', () => {
    renderTracks([]);

    expect(getText()).toContain('Żaden utwór nie został odrzucony przez wymagania obowiązkowe.');
    expect(getTracks()).toHaveLength(0);
    expect(fixture.nativeElement.querySelector('.rejected-track-list')).toBeNull();
    expect(fixture.nativeElement.querySelector('.rejections-hint')).toBeNull();
  });

  it('displays the rejected track name and all artists', () => {
    renderTracks([createRejectedTrack()]);

    const track = getTracks()[0];
    expect(getText(track.querySelector('h4'))).toBe('Przykładowy utwór');
    expect(getText(track.querySelector('.track-artists'))).toBe('Pierwszy artysta, Drugi artysta');
  });

  it.each<{ reason: PlaylistTrackRejectionReason; message: string }>([
    {
      reason: { feature: 'tempo', code: 'missing-measurement' },
      message: 'Brak pomiaru cechy „tempo (BPM)”.',
    },
    {
      reason: { feature: 'speechiness', code: 'missing-measurement' },
      message: 'Brak pomiaru cechy „udział mowy (speechiness)”.',
    },
    {
      reason: { feature: 'liveness', code: 'missing-measurement' },
      message: 'Brak pomiaru cechy „prawdopodobieństwo wykonania na żywo (liveness)”.',
    },
    {
      reason: { feature: 'tempo', code: 'outside-range' },
      message: 'Tempo (BPM) jest poza wybranym zakresem.',
    },
    {
      reason: { feature: 'speechiness', code: 'above-maximum' },
      message: 'Pomiar cechy „udział mowy (speechiness)” przekracza ustawione maksimum.',
    },
    {
      reason: { feature: 'liveness', code: 'above-maximum' },
      message:
        'Pomiar cechy „prawdopodobieństwo wykonania na żywo (liveness)” przekracza ustawione maksimum.',
    },
  ])('translates $reason.feature / $reason.code into a readable reason', ({ reason, message }) => {
    renderTracks([createRejectedTrack({ reasons: [reason] })]);

    expect(getReasons(getTracks()[0])).toEqual([message]);
    expect(getText()).not.toContain(reason.code);
  });

  it('displays every rejection reason for a track, preserving their order', () => {
    renderTracks([
      createRejectedTrack({
        reasons: [
          { feature: 'tempo', code: 'outside-range' },
          { feature: 'speechiness', code: 'missing-measurement' },
          { feature: 'liveness', code: 'above-maximum' },
        ],
      }),
    ]);

    expect(getReasons(getTracks()[0])).toEqual([
      'Tempo (BPM) jest poza wybranym zakresem.',
      'Brak pomiaru cechy „udział mowy (speechiness)”.',
      'Pomiar cechy „prawdopodobieństwo wykonania na żywo (liveness)” przekracza ustawione maksimum.',
    ]);
  });

  it('preserves track order and associates reasons with the correct track', () => {
    const first = createRejectedTrack();
    first.track = { ...first.track, id: 'first-track', name: 'Zeta' };
    const second = createRejectedTrack({
      reasons: [{ feature: 'speechiness', code: 'above-maximum' }],
    });
    second.track = { ...second.track, id: 'second-track', name: 'Alfa' };

    renderTracks([first, second]);

    const tracks = getTracks();
    expect(tracks).toHaveLength(2);
    expect(tracks.map((track) => getText(track.querySelector('h4')))).toEqual(['Zeta', 'Alfa']);
    expect(getReasons(tracks[0])).toEqual(['Tempo (BPM) jest poza wybranym zakresem.']);
    expect(getReasons(tracks[1])).toEqual([
      'Pomiar cechy „udział mowy (speechiness)” przekracza ustawione maksimum.',
    ]);
  });

  it('explains that hard requirements and missing measurements cause rejection', () => {
    renderTracks([createRejectedTrack()]);

    expect(getText()).toContain(
      'Te utwory nie spełniają co najmniej jednego wymagania obowiązkowego.'
    );
    expect(getText()).toContain('Brak potrzebnego pomiaru również powoduje odrzucenie.');
    expect(fixture.nativeElement.querySelector('app-playlist-preference-matches')).toBeNull();
    expect(getText()).not.toContain('%');
  });

  it('uses backend reasons without recalculating rejection or modifying the input', () => {
    const rejectedTrack = createRejectedTrack();
    const originalTrack = structuredClone(rejectedTrack);
    Object.freeze(rejectedTrack);
    Object.freeze(rejectedTrack.track);
    Object.freeze(rejectedTrack.reasons);
    Object.freeze(rejectedTrack.reasons[0]);
    const tracks = [rejectedTrack];
    Object.freeze(tracks);

    renderTracks(tracks);

    expect(getTracks()).toHaveLength(1);
    expect(getReasons(getTracks()[0])).toEqual(['Tempo (BPM) jest poza wybranym zakresem.']);
    expect(rejectedTrack).toEqual(originalTrack);
  });

  it('refreshes reasons for the same track ID and removes stale rows after an empty result', () => {
    renderTracks([createRejectedTrack()]);
    renderTracks([
      createRejectedTrack({ reasons: [{ feature: 'liveness', code: 'missing-measurement' }] }),
    ]);

    expect(getTracks()).toHaveLength(1);
    expect(getReasons(getTracks()[0])).toEqual([
      'Brak pomiaru cechy „prawdopodobieństwo wykonania na żywo (liveness)”.',
    ]);
    expect(getText()).not.toContain('Tempo (BPM) jest poza wybranym zakresem.');

    renderTracks([]);

    expect(getTracks()).toHaveLength(0);
    expect(getText()).toContain('Żaden utwór nie został odrzucony przez wymagania obowiązkowe.');

    renderTracks([createRejectedTrack()]);

    expect(getTracks()).toHaveLength(1);
    expect(fixture.nativeElement.querySelector('.rejections-empty')).toBeNull();
  });

  it('renders track metadata as text instead of interpreting it as HTML', () => {
    const rejectedTrack = createRejectedTrack();
    rejectedTrack.track = {
      ...rejectedTrack.track,
      name: '<img src="invalid" onerror="alert(1)">',
      artists: ['<b>Artysta</b>'],
    };

    renderTracks([rejectedTrack]);

    expect(getText(getTracks()[0].querySelector('h4'))).toBe(rejectedTrack.track.name);
    expect(getText(getTracks()[0].querySelector('.track-artists'))).toBe('<b>Artysta</b>');
    expect(fixture.nativeElement.querySelector('img')).toBeNull();
    expect(fixture.nativeElement.querySelector('b')).toBeNull();
  });

  function renderTracks(tracks: RejectedPlaylistTrack[]): void {
    fixture.componentRef.setInput('rejectedTracks', tracks);
    fixture.detectChanges();
  }

  function getTracks(): HTMLElement[] {
    return Array.from(fixture.nativeElement.querySelectorAll('.rejected-track'));
  }

  function getText(element: Element | null = fixture.nativeElement): string {
    if (!element) {
      throw new Error('Nie znaleziono elementu listy odrzuconych utworów');
    }

    return element.textContent.replace(/\s+/g, ' ').trim();
  }

  function getReasons(track: HTMLElement): string[] {
    return Array.from(track.querySelectorAll('.rejection-reasons li')).map((reason) =>
      getText(reason)
    );
  }
});

function createRejectedTrack(
  overrides: Partial<RejectedPlaylistTrack> = {}
): RejectedPlaylistTrack {
  return {
    track: {
      id: 'example-track',
      name: 'Przykładowy utwór',
      artists: ['Pierwszy artysta', 'Drugi artysta'],
      audioFeatures: {
        tempo: 150,
        energy: 0.8,
        danceability: 0.7,
        valence: 0.5,
        acousticness: 0.1,
        instrumentalness: 0.2,
        speechiness: 0.1,
        liveness: 0.1,
      },
    },
    reasons: [{ feature: 'tempo', code: 'outside-range' }],
    ...overrides,
  };
}
