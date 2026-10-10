import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type { Observable } from 'rxjs';
import type { GeneratedPlaylist, PlaylistGeneratorRequest } from './playlist-generator.models';

@Injectable({ providedIn: 'root' })
class PlaylistGeneratorApiService {
  private readonly http = inject(HttpClient);

  /**
   * Wysyła zbiór utworów, wymagania i preferencje do generatora backendowego.
   * Nie pobiera danych ze Spotify ani nie tworzy tam playlisty.
   *
   * @param request - Zbiór z pomiarami oraz ustawienia generowania playlisty.
   * @returns Ranking dopuszczonych utworów i odrzucone utwory z powodami.
   */
  public generatePlaylist(request: PlaylistGeneratorRequest): Observable<GeneratedPlaylist> {
    return this.http.post<GeneratedPlaylist>('/api/playlist-generator/generate', request, {
      withCredentials: true,
    });
  }
}

export { PlaylistGeneratorApiService };
