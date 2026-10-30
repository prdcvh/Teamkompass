import type { Provider } from '@angular/core';
import { AccessApi } from '../firebase/access.api';
import { AuthApi } from '../firebase/auth.api';
import { EventsApi } from '../firebase/events.api';
import { LineupApi } from '../firebase/lineup.api';
import { KnowledgeApi } from '../firebase/knowledge.api';
import { NotificationsApi } from '../firebase/notifications.api';
import { OpponentsApi } from '../firebase/opponents.api';
import { PlayerRecordsApi } from '../firebase/player-records.api';
import { PlayerStatsApi } from '../firebase/player-stats.api';
import { PlanningApi } from '../firebase/planning.api';
import { PlayersApi } from '../firebase/players.api';
import { RankingApi } from '../firebase/ranking.api';
import { RatingsApi } from '../firebase/ratings.api';
import { RsvpApi } from '../firebase/rsvp.api';
import { ScoutApi } from '../firebase/scout.api';
import { TeamSettingsApi } from '../firebase/team-settings.api';
import { TeamsApi } from '../firebase/teams.api';
import { RegistrationApi } from '../firebase/registration.api';
import { FakeTeamsApi } from './fake-teams.api';
import { FakeRegistrationApi } from './fake-registration.api';
import { WeatherProvider } from '../weather/weather-provider';
import { OfflineWeatherProvider } from './fake-weather.provider';
import { FakeAccessApi } from './fake-access.api';
import { FakeAuthApi } from './fake-auth.api';
import { FakeEventsApi } from './fake-events.api';
import { FakeLineupApi } from './fake-lineup.api';
import { FakeKnowledgeApi } from './fake-knowledge.api';
import { FakeNotificationsApi } from './fake-notifications.api';
import { FakeOpponentsApi } from './fake-opponents.api';
import { FakePlanningApi } from './fake-planning.api';
import { FakePlayerRecordsApi } from './fake-player-records.api';
import { FakePlayerStatsApi } from './fake-player-stats.api';
import { FakePlayersApi } from './fake-players.api';
import { FakeRankingApi } from './fake-ranking.api';
import { FakeRatingsApi } from './fake-ratings.api';
import { FakeRsvpApi } from './fake-rsvp.api';
import { FakeScoutApi } from './fake-scout.api';
import { FakeTeamSettingsApi } from './fake-team-settings.api';

/**
 * Alle Firebase-Attrappen eines Tests an einer Stelle (je Zugriffsklasse unter `firebase/` eine).
 * Sie schreiben in dieselbe Aufrufliste `calls`, damit Tests die Reihenfolge über Themen hinweg prüfen können.
 */
export class FakeFirebase {
  calls: string[] = [];
  readonly auth = new FakeAuthApi(this.calls);
  readonly access = new FakeAccessApi(this.calls);
  readonly players = new FakePlayersApi(this.calls);
  readonly events = new FakeEventsApi(this.calls);
  readonly lineup = new FakeLineupApi(this.calls);
  readonly knowledge = new FakeKnowledgeApi(this.calls);
  readonly opponents = new FakeOpponentsApi(this.calls);
  readonly ratings = new FakeRatingsApi(this.calls);
  readonly rsvp = new FakeRsvpApi(this.calls);
  readonly ranking = new FakeRankingApi(this.calls, this.ratings.privateNotes);
  readonly records = new FakePlayerRecordsApi(this.calls);
  readonly settings = new FakeTeamSettingsApi(this.calls);
  readonly notifications = new FakeNotificationsApi(this.calls);
  readonly planning =new FakePlanningApi(this.calls);
  readonly scout = new FakeScoutApi(this.calls);
  readonly playerStats = new FakePlayerStatsApi(this.calls, this.events, this.ratings);
  readonly teams = new FakeTeamsApi();
  readonly registration = new FakeRegistrationApi(this.auth);

  constructor() {
    this.events.hasRecords = (id) => (this.ratings.ratings.get(id)?.size ?? 0) > 0 || (this.ratings.privateNotes.get(id)?.size ?? 0) > 0;
  }
}

/** Stellt die Attrappe für alle Firebase-Zugriffsklassen bereit. */
export function provideFakeFirebase(fake: FakeFirebase): Provider[] {
  return [
    { provide: AuthApi, useValue: fake.auth },
    { provide: AccessApi, useValue: fake.access },
    { provide: PlayersApi, useValue: fake.players },
    { provide: EventsApi, useValue: fake.events },
    { provide: LineupApi, useValue: fake.lineup },
    { provide: KnowledgeApi, useValue: fake.knowledge },
    { provide: OpponentsApi, useValue: fake.opponents },
    { provide: RatingsApi, useValue: fake.ratings },
    { provide: RsvpApi, useValue: fake.rsvp },
    { provide: RankingApi, useValue: fake.ranking },
    { provide: PlayerRecordsApi, useValue: fake.records },
    // Seiten zeigen Wetter; Tests sollen nie ins Netz (SCRUM-98).
    { provide: WeatherProvider, useClass: OfflineWeatherProvider },
    { provide: TeamSettingsApi, useValue: fake.settings },
    { provide: NotificationsApi, useValue: fake.notifications },
    { provide: PlanningApi, useValue: fake.planning },
    { provide: ScoutApi, useValue: fake.scout },
    { provide: PlayerStatsApi, useValue: fake.playerStats },
    { provide: TeamsApi, useValue: fake.teams },
    { provide: RegistrationApi, useValue: fake.registration },
  ];
}
