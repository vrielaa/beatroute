import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

@Injectable({ providedIn: 'root' })
class AuthApiService {
  private readonly http = inject(HttpClient);

  public loginWithSpotify(): void {
    window.location.href = '/auth/spotify/login';
  }

  public checkAuth(): Observable<{ isLoggedIn: boolean }> {
    return this.http.get<{ isLoggedIn: boolean }>('/api/auth/me', {
      withCredentials: true,
    });
  }

  public logout(): Observable<{ message: string }> {
    return this.http.post<{ message: string }>('/api/auth/logout', {}, { withCredentials: true });
  }
}

export { AuthApiService };
