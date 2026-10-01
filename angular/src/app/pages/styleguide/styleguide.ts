import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { Button } from '../../ui/button/button';
import { Card } from '../../ui/card/card';
import { Chip } from '../../ui/chip/chip';
import { Dialog } from '../../ui/dialog/dialog';
import { Status } from '../../ui/status/status';

/** Entwickler-Seite: alle Basiskomponenten nebeneinander, zum Abgleich mit Figma. */
@Component({
  selector: 'app-styleguide',
  imports: [Button, Card, Chip, Dialog, Status],
  templateUrl: './styleguide.html',
  styleUrl: './styleguide.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Styleguide {
  protected readonly dialogOpen = signal(false);
  protected readonly statuses = ['Fit', 'Angeschlagen', 'Beobachten', 'Nicht einsetzen', 'Abwesend'];
}
