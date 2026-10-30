import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { formatDate } from '../../core/shared/dates';
import {
  DEFAULT_FEDERAL_STATE,
  type FederalState,
  federalStateName,
} from '../../core/team-settings/federal-states';
import {
  SCHOOL_HOLIDAYS_BY_STATE,
  SCHOOL_HOLIDAYS_CHECKED,
  schoolHolidaysForYear,
} from './school-holidays';

/**
 * Aufklappbarer Hinweis mit den Schulferien des aktuellen Jahres für das Bundesland des Teams.
 * Nur Anzeige, kein Übernehmen (SCRUM-149, alle Länder SCRUM-186).
 */
@Component({
  selector: 'tk-school-holidays-hint',
  templateUrl: './school-holidays-hint.html',
  styleUrl: './school-holidays-hint.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SchoolHolidaysHint {
  /** Bundesland aus den Teameinstellungen; ohne Angabe Hessen. */
  readonly state = input<FederalState>(DEFAULT_FEDERAL_STATE);

  protected readonly year = new Date().getFullYear();
  protected readonly stateName = computed(() => federalStateName(this.state()));
  private readonly entry = computed(() => SCHOOL_HOLIDAYS_BY_STATE[this.state()]);
  protected readonly holidays = computed(() => schoolHolidaysForYear(this.year, this.entry()));
  protected readonly hasSchoolFree = computed(
    () => this.holidays()?.some((holiday) => holiday.schoolFreeDays) ?? false,
  );
  protected readonly source = computed(() => this.entry().source);
  protected readonly note = computed(() => this.entry().note ?? '');
  protected readonly checked = formatDate(SCHOOL_HOLIDAYS_CHECKED);
  protected readonly formatDate = formatDate;
}
