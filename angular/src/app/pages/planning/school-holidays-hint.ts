import { ChangeDetectionStrategy, Component } from '@angular/core';
import { formatDate } from '../../core/shared/dates';
import { SCHOOL_HOLIDAYS_CHECKED, SCHOOL_HOLIDAYS_SOURCE, schoolHolidaysForYear } from './school-holidays';

/** Aufklappbarer Hinweis mit den Schulferien Hessen des aktuellen Jahres. Nur Anzeige, kein Übernehmen (SCRUM-149). */
@Component({
  selector: 'tk-school-holidays-hint',
  templateUrl: './school-holidays-hint.html',
  styleUrl: './school-holidays-hint.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SchoolHolidaysHint {
  protected readonly year = new Date().getFullYear();
  protected readonly holidays = schoolHolidaysForYear(this.year);
  protected readonly source = SCHOOL_HOLIDAYS_SOURCE;
  protected readonly checked = formatDate(SCHOOL_HOLIDAYS_CHECKED);
  protected readonly formatDate = formatDate;
}
