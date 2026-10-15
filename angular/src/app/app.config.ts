import { ApplicationConfig, inject, isDevMode, provideAppInitializer, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideServiceWorker } from '@angular/service-worker';

import { AuthService } from './core/auth/auth.service';
import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    // Anmeldeprüfung beim Start anstoßen, ohne den Start der App darauf warten zu lassen.
    provideAppInitializer(() => inject(AuthService).start()),
    // Offline-Start und „App installieren“ wie in der bisherigen App (SCRUM-76); nur im Produktions-Build.
    provideServiceWorker('ngsw-worker.js', {
      enabled: !isDevMode(),
      registrationStrategy: 'registerWhenStable:30000',
    }),
  ]
};
