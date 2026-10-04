import { Component, inject, ChangeDetectionStrategy } from '@angular/core';
import { AuthApiService } from '@core/api/auth/auth-api.service';
import { Icon } from '@shared/components/icon/icon';

@Component({
  selector: 'app-logout',
  imports: [Icon],
  templateUrl: './logout.html',
  styleUrl: './logout.scss',
  changeDetection: ChangeDetectionStrategy.Eager,
  host: {
    class: 'logout-action',
  },
})
class Logout {
  private readonly authApi = inject(AuthApiService);

  public logout(): void {
    this.authApi.logout().subscribe({
      next: () => {
        window.location.href = '/login';
      },
      error: (err) => {
        console.error('Logout failed', err);
      },
    });
  }
}

export { Logout };
