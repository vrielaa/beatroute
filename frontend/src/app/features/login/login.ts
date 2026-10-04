import { Component, inject, ChangeDetectionStrategy } from '@angular/core';
import { AuthApiService } from '@core/api/auth/auth-api.service';

@Component({
  selector: 'app-login',
  imports: [],
  templateUrl: './login.html',
  styleUrl: './login.scss',
  changeDetection: ChangeDetectionStrategy.Eager,
  host: {
    class: 'login-page-host',
  },
})
class Login {
  private readonly authApi = inject(AuthApiService);

  public login(): void {
    this.authApi.loginWithSpotify();
  }
}

export { Login };
