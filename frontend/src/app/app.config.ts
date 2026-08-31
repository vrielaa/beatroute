import {
  ApplicationConfig,
  inject,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { provideRouter } from '@angular/router';

import { routes } from '@app/app.routes';
import { provideHttpClient, withInterceptors, withXhr } from '@angular/common/http';
import { rateLimitRetryInterceptor } from '@core/rate-limit-retry.interceptor';

import { ThemeService } from '@app/shared/utils/theme.service';

const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    provideHttpClient(withXhr(), withInterceptors([rateLimitRetryInterceptor])),
    provideAppInitializer(() => {
      const themeService = inject(ThemeService);

      themeService.setTheme(themeService.defaultTheme);
    }),
  ],
};

export { appConfig };
