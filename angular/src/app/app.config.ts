import { ApplicationConfig, inject, provideAppInitializer, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter } from '@angular/router';

import { AuthService } from './core/auth.service';
import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    // Anmeldeprüfung beim Start anstoßen, ohne den Start der App darauf warten zu lassen.
    provideAppInitializer(() => inject(AuthService).start()),
  ]
};
