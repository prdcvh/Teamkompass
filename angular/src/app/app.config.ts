import { ApplicationConfig, inject, isDevMode, provideAppInitializer, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter, withInMemoryScrolling } from '@angular/router';
import { provideServiceWorker } from '@angular/service-worker';

import { AuthService } from './core/auth/auth.service';
import { OpenMeteoProvider, WeatherProvider } from './core/weather/weather-provider';
import { routes } from './app.routes';

/** Neue Seite beginnt oben, „Zurück“ springt zur alten Stelle, Sprungmarken (#fragment) werden angesprungen (SCRUM-310). */
export const routerScrolling = withInMemoryScrolling({ scrollPositionRestoration: 'enabled', anchorScrolling: 'enabled' });

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes, routerScrolling),
    // Wetteranbieter austauschbar (SCRUM-96); Open-Meteo braucht die CSP-Freigabe im Hosting-Target u14.
    { provide: WeatherProvider, useClass: OpenMeteoProvider },
    // Anmeldeprüfung beim Start anstoßen, ohne den Start der App darauf warten zu lassen.
    provideAppInitializer(() => inject(AuthService).start()),
    // Offline-Start und „App installieren“ wie in der bisherigen App (SCRUM-76); nur im Produktions-Build.
    provideServiceWorker('ngsw-worker.js', {
      enabled: !isDevMode(),
      registrationStrategy: 'registerWhenStable:30000',
    }),
  ]
};
