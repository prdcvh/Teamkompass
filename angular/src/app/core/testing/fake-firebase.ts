import type { Provider } from '@angular/core';
import { AccessApi } from '../firebase/access.api';
import { AuthApi } from '../firebase/auth.api';
import { EventsApi } from '../firebase/events.api';
import { LineupApi } from '../firebase/lineup.api';
import { OpponentsApi } from '../firebase/opponents.api';
import { PlayerRecordsApi } from '../firebase/player-records.api';
import { PlayersApi } from '../firebase/players.api';
import { RatingsApi } from '../firebase/ratings.api';
import { FakeAccessApi } from './fake-access.api';
import { FakeAuthApi } from './fake-auth.api';
import { FakeEventsApi } from './fake-events.api';
import { FakeLineupApi } from './fake-lineup.api';
import { FakeOpponentsApi } from './fake-opponents.api';
import { FakePlayerRecordsApi } from './fake-player-records.api';
import { FakePlayersApi } from './fake-players.api';
import { FakeRatingsApi } from './fake-ratings.api';

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
  readonly opponents = new FakeOpponentsApi(this.calls);
  readonly ratings = new FakeRatingsApi(this.calls);
  readonly records = new FakePlayerRecordsApi(this.calls);
}

/** Stellt die Attrappe für alle Firebase-Zugriffsklassen bereit. */
export function provideFakeFirebase(fake: FakeFirebase): Provider[] {
  return [
    { provide: AuthApi, useValue: fake.auth },
    { provide: AccessApi, useValue: fake.access },
    { provide: PlayersApi, useValue: fake.players },
    { provide: EventsApi, useValue: fake.events },
    { provide: LineupApi, useValue: fake.lineup },
    { provide: OpponentsApi, useValue: fake.opponents },
    { provide: RatingsApi, useValue: fake.ratings },
    { provide: PlayerRecordsApi, useValue: fake.records },
  ];
}
