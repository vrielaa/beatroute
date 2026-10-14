import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type { Observable } from 'rxjs';
import { map } from 'rxjs';
import { parseSavedPlaylist } from './playlist-save-response';
import type {
  GeneratedPlaylist,
  PlaylistGeneratorRequest,
  PlaylistTrackIdsFile,
  PlaylistToSave,
  PlaylistSaveProgress,
  PreparedPlaylistDataset,
  SavedPlaylist,
} from './playlist-generator.models';

@Injectable({ providedIn: 'root' })
class PlaylistGeneratorApiService {
  private readonly http = inject(HttpClient);

  /**
   * Przekazuje ID do backendu, który pobiera metadane Spotify i cechy ReccoBeats.
   * Wymaga sesji Spotify przesyłanej jako cookie, nie tokenu w body.
   * Nie generuje rankingu; przygotowany zbiór można wykorzystać dla wielu kryteriów.
   * Jedna subskrypcja wysyła jedno żądanie. Kolejność partii, ich zachowanie
   * oraz ponowienie po błędzie są odpowiedzialnością komponentu strony.
   *
   * @param file - Sprawdzony plik wersji 1 lub jego partia z unikalnymi Spotify ID.
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

  /**
   * Wysyła nazwę i kopię wybranych ID do zapisu nowej, prywatnej playlisty Spotify.
   * Wymaga sesji z playlist-modify-private, przesyłanej jako cookie, nie tokenu w body.
   * Nie zmienia wyboru, nie pobiera pomiarów ani nie uruchamia generatora ponownie.
   *
   * Każda subskrypcja wykonuje osobny POST. Metoda nie ponawia zapisu i nie zamienia
   * błędów na sukces: HttpErrorResponse zachowuje kod, dane częściowego zapisu
   * oraz Retry-After. Anulowanie subskrypcji nie cofa już rozpoczętego zapisu w backendzie.
   * Sprawdza dane odpowiedzi, link Spotify i liczbę potwierdzonych utworów;
   * niepoprawne potwierdzenie również trafia do kanału błędów, bez ponowienia POST-a.
   *
   * @param playlist - Nazwa i Spotify ID w docelowej kolejności; dodatkowe pola są pomijane.
   * @returns Dane playlisty dopiero po potwierdzeniu dodania wszystkich wybranych utworów.
   */
  public savePlaylist(playlist: PlaylistToSave): Observable<SavedPlaylist> {
    const trackIds = [...playlist.trackIds];
    const expectedTrackCount = trackIds.length;
    return this.http
      .post<unknown>(
        '/api/playlist-generator/save',
        { name: playlist.name, trackIds },
        { withCredentials: true }
      )
      .pipe(map((response) => parseSavedPlaylist(response, expectedTrackCount)));
  }

  /**
   * Wznawia zapis istniejącej playlisty po świadomym kliknięciu użytkownika.
   * Wysyła tylko jej ID; pierwotny wybór pozostaje w sesji backendu.
   * Nie ponawia POST-a, nie tworzy nowej playlisty i nie używa aktualnych zaznaczeń.
   * Potwierdzenie musi dotyczyć tej samej playlisty i całej pierwotnej liczby utworów.
   *
   * @param progress - Sprawdzony postęp nieukończonego zapisu.
   * @returns Potwierdzenie kompletnej istniejącej playlisty albo błąd do obsługi w widoku.
   */
  public resumePlaylist(progress: PlaylistSaveProgress): Observable<SavedPlaylist> {
    const playlistId = progress.id;
    const expectedTrackCount = progress.requestedTrackCount;

    return this.http
      .post<unknown>(
        '/api/playlist-generator/resume-save',
        { playlistId },
        { withCredentials: true }
      )
      .pipe(
        map((response) => {
          const saved = parseSavedPlaylist(response, expectedTrackCount);

          if (saved.id !== playlistId) {
            throw new Error('Potwierdzenie dotyczy innej playlisty');
          }

          return saved;
        })
      );
  }
}

export { PlaylistGeneratorApiService };
