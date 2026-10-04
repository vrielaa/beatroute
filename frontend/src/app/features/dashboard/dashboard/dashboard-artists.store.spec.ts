import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { LastfmApiService } from '@core/api/lastfm/lastfm-api.service';
import { SpotifyApiService } from '@core/api/spotify/spotify-api.service';
import { DashboardArtistsStore } from './dashboard-artists.store';
import type { ArtistGenreDistributionResponse } from '@core/api/lastfm/lastfm.models';
import type { TopArtistsResponse } from '@core/api/spotify/spotify.models';

describe('DashboardArtistsStore', () => {
  const spotifyApi = { getTopArtists: vi.fn() };
  const lastfmApi = { getArtistGenreDistribution: vi.fn() };
  let store: DashboardArtistsStore;

  beforeEach(() => {
    vi.clearAllMocks();
    TestBed.configureTestingModule({
      providers: [
        DashboardArtistsStore,
        { provide: SpotifyApiService, useValue: spotifyApi },
        { provide: LastfmApiService, useValue: lastfmApi },
      ],
    });
    store = TestBed.inject(DashboardArtistsStore);
  });

  it('loads top artists and their Last.fm genre distribution', () => {
    spotifyApi.getTopArtists.mockReturnValue(of(createTopArtists(['Radiohead'])));
    lastfmApi.getArtistGenreDistribution.mockReturnValue(of(createDistribution()));

    store.load('short_term', 10);

    expect(lastfmApi.getArtistGenreDistribution).toHaveBeenCalledWith(['Radiohead']);
    expect(store.genreDistribution()?.matchedArtists).toBe(1);
    expect(store.artistGenres()).toEqual({ radiohead: ['alternative rock'] });
    expect(store.isTopArtistsLoading()).toBe(false);
    expect(store.isGenreDistributionLoading()).toBe(false);
  });

  it('does not call Last.fm when Spotify returns no artists', () => {
    spotifyApi.getTopArtists.mockReturnValue(of(createTopArtists([])));

    store.load('medium_term', 10);

    expect(lastfmApi.getArtistGenreDistribution).not.toHaveBeenCalled();
    expect(store.genreDistribution()).toBeNull();
    expect(store.isGenreDistributionLoading()).toBe(false);
  });

  it('keeps Spotify data when only the Last.fm request fails', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    spotifyApi.getTopArtists.mockReturnValue(of(createTopArtists(['Radiohead'])));
    lastfmApi.getArtistGenreDistribution.mockReturnValue(
      throwError(() => new Error('Last.fm unavailable'))
    );

    try {
      store.load('short_term', 10);

      expect(store.topArtists()?.items[0].name).toBe('Radiohead');
      expect(store.hasTopArtistsError()).toBe(false);
      expect(store.hasGenreDistributionError()).toBe(true);
      expect(store.isGenreDistributionLoading()).toBe(false);
    } finally {
      consoleError.mockRestore();
    }
  });

  it('marks both sections as unavailable when Spotify fails', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    spotifyApi.getTopArtists.mockReturnValue(throwError(() => new Error('Spotify unavailable')));

    try {
      store.load('long_term', 20);

      expect(store.hasTopArtistsError()).toBe(true);
      expect(store.hasGenreDistributionError()).toBe(true);
      expect(store.isTopArtistsLoading()).toBe(false);
      expect(store.isGenreDistributionLoading()).toBe(false);
    } finally {
      consoleError.mockRestore();
    }
  });
});

function createTopArtists(names: string[]): TopArtistsResponse {
  return {
    href: '',
    items: names.map((name, index) => ({
      id: `artist-${index}`,
      name,
      genres: [],
      images: [],
      followers: { total: 100 },
      popularity: 50,
      external_urls: { spotify: '' },
    })),
    limit: 10,
    next: null,
    offset: 0,
    previous: null,
    total: names.length,
  };
}

function createDistribution(): ArtistGenreDistributionResponse {
  return {
    genres: [
      {
        name: 'alternative',
        count: 1,
        percentage: 100,
        artists: ['Radiohead'],
        subgenres: [
          {
            name: 'alternative rock',
            count: 1,
            percentage: 100,
            artists: ['Radiohead'],
          },
        ],
      },
    ],
    totalArtists: 1,
    matchedArtists: 1,
    totalGenreMatches: 1,
    unmatchedArtists: [],
    source: 'lastfm-artist-info-tags',
  };
}
