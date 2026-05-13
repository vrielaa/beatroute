import { inject, Injectable } from '@angular/core';
import { HttpClient, httpResource } from '@angular/common/http';

@Injectable({
  providedIn: 'root',
})
export class SpotifyService {
  public loginWithSpotify(): void {
    window.location.href = '/auth/spotify/login';
  }

  private readonly http = inject(HttpClient);

  public authResource = httpResource<{ isLoggedIn: boolean }>(() => ({
    url: '/api/auth/me',
    method: 'GET',
    withCredentials: true,
  }));

  public checkAuth() {
    return this.http.get<{ isLoggedIn: boolean }>('/api/auth/me', {
      withCredentials: true,
    });
  }

  public userProfileResource = httpResource<any>(() => ({
    url: '/api/me/profile',
    method: 'GET',
    withCredentials: true,
  }));

  public topTracksResource = httpResource<any>(() => ({
    url: '/api/me/top-tracks',
    method: 'GET',
    params: {
      limit: '10',
      time_range: 'medium_term',
    },
    withCredentials: true,
  }));

  public logout() {
    return this.http.post(
      '/api/auth/logout',
      {},
      {
        withCredentials: true,
      }
    );
  }
  readonly userProfile = this.userProfileResource.value;
}
