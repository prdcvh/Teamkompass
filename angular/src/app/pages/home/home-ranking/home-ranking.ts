import { ChangeDetectionStrategy, Component, OnInit, computed, inject, input } from '@angular/core';
import { type RankingEntry, monthPeriod, weekPeriod } from '../../../core/points/ranking';
import { RankingService } from '../../../core/points/ranking.service';
import { formatDate, todayIso } from '../../../core/shared/dates';
import { Button } from '../../../ui/button/button';
import { Card } from '../../../ui/card/card';

const MONTH_NAMES = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];

/**
 * „MVP der Woche“ und „MVP des Monats“ (SCRUM-105): zwei Ranglisten mit den Top 5 aus den Trainingspunkten. Platz 1 ist
 * der MVP und wird hervorgehoben; Gleichplatzierte teilen sich den Platz. Am Handy untereinander, sonst nebeneinander.
 * Trainer und Spieler/Eltern sehen dasselbe; die Daten kommen aus {@link RankingService}.
 */
@Component({
  selector: 'app-home-ranking',
  imports: [Button, Card],
  templateUrl: './home-ranking.html',
  styleUrl: './home-ranking.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomeRanking implements OnInit {
  protected readonly ranking = inject(RankingService);
  readonly mobile = input(false);

  protected readonly lists = computed(() => {
    const today = todayIso();
    const week = weekPeriod(today);
    const month = monthPeriod(today);
    const monthNumber = Number(month.from.slice(5, 7));
    return [
      { key: 'week', title: 'MVP der Woche', range: `${formatDate(week.from)} – ${formatDate(week.to)}`, entries: this.ranking.week() },
      { key: 'month', title: 'MVP des Monats', range: `${MONTH_NAMES[monthNumber - 1] ?? ''} ${month.from.slice(0, 4)}`, entries: this.ranking.month() },
    ];
  });

  ngOnInit(): void {
    void this.ranking.start();
  }

  protected isMvp(entry: RankingEntry): boolean {
    return entry.rank === 1;
  }

  protected pointsText(points: number): string {
    return points === 1 ? '1 Punkt' : `${points} Punkte`;
  }
}
