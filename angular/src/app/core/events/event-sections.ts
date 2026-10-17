/** Einteilung der Eventliste in Vergangene / Diese Woche / Später (SCRUM-140, Sortierung SCRUM-141). */
import { isIsoDate } from '../shared/dates';
import { type EventSort, type TeamEvent, sortEvents } from './event';

export interface EventSections {
  readonly past: TeamEvent[];
  readonly week: TeamEvent[];
  readonly later: TeamEvent[];
}

/** Sonntag der Woche (Mo–So) von `today` (ISO-Datum). */
export function endOfWeek(today: string): string {
  const day = new Date(`${today}T00:00:00Z`);
  const sinceMonday = (day.getUTCDay() + 6) % 7;
  day.setUTCDate(day.getUTCDate() + 6 - sinceMonday);
  return day.toISOString().slice(0, 10);
}

/**
 * Teilt Events in vergangene (vor heute), diese Woche (heute bis Sonntag) und spätere (ab nächstem Montag) ein
 * und sortiert jeden Bereich nach `sort`. In „Chronologisch“ steht bei Vergangenen das jüngste oben,
 * bei Diese Woche/Später das nächste oben (SCRUM-140/141). Ohne gültiges Datum zählt ein Event als vergangen.
 */
export function sectionEvents(events: readonly TeamEvent[], sort: EventSort, today: string): EventSections {
  const sunday = endOfWeek(today);
  const past: TeamEvent[] = [];
  const week: TeamEvent[] = [];
  const later: TeamEvent[] = [];
  for (const event of events) {
    if (!isIsoDate(event.date) || event.date < today) past.push(event);
    else if (event.date <= sunday) week.push(event);
    else later.push(event);
  }
  const order = (list: TeamEvent[], newestFirst: boolean) =>
    sort === 'chronological' ? (newestFirst ? sortEvents(list, 'chronological').reverse() : sortEvents(list, 'chronological')) : sortEvents(list, sort);
  return { past: order(past, true), week: order(week, false), later: order(later, false) };
}
