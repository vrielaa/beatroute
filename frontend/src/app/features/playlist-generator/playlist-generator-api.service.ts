import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type { Observable } from 'rxjs';
import type {
  GeneratedPlaylist,
  PlaylistGeneratorRequest,
  PlaylistTrackIdsFile,
  PreparedPlaylistDataset,
} from './playlist-generator.models';

@Injectable({ providedIn: 'root' })
class PlaylistGeneratorApiService {
  private readonly http = inject(HttpClient);

  /**
   * Przekazuje ID do backendu, który pobiera metadane Spotify i cechy ReccoBeats.
   * Wymaga sesji Spotify przesyłanej jako cookie, nie tokenu w body.
   * Nie generuje rankingu; przygotowany zbiór można wykorzystać dla wielu kryteriów.
   *
   * @param file - Sprawdzony plik wersji 1 z unikalnymi ID utworów Spotify.
   * @returns Zbiór oraz informacje o pominiętych utworach i brakujących pomiarach.
   */
  public prepareDataset(file: PlaylistTrackIdsFile): Observable<PreparedPlaylistDataset> {
    return this.http.post<PreparedPlaylistDataset>(
      '/api/playlist-generator/prepare-dataset',
      file,
      {
        withCredentials: true,
      }
    );
  }

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
