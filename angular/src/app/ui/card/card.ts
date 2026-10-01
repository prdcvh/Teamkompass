import { ChangeDetectionStrategy, Component } from '@angular/core';

/** Figma: Karte (weiß, Rahmen, 16–18px Radius). */
@Component({
  selector: 'tk-card',
  template: '<ng-content />',
  styleUrl: './card.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Card {}
