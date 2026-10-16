import { WeatherProvider } from '../weather/weather-provider';

/** Ersatz für den Wetteranbieter in Seitentests: kein Netzwerkzugriff, die Vorhersage ist „nicht verfügbar“. */
export class OfflineWeatherProvider extends WeatherProvider {
  async fetchDay(): Promise<unknown> {
    throw new Error('Kein Netzwerk in Tests');
  }
}
