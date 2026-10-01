import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Button } from './button/button';
import { Card } from './card/card';
import { Chip } from './chip/chip';
import { Dialog } from './dialog/dialog';
import { Status, toneForStatus } from './status/status';

@Component({
  imports: [Button, Chip, Status, Card],
  template: `
    <button tkButton variant="primary" size="sm">Speichern</button>
    <a tkButton href="/x">Link</a>
    <tk-chip tone="green">Fit</tk-chip>
    <tk-status label="Verletzt" />
    <tk-card>Inhalt</tk-card>
  `,
})
class Host {}

describe('UI-Basiskomponenten', () => {
  async function render(): Promise<HTMLElement> {
    await TestBed.configureTestingModule({ imports: [Host] }).compileComponents();
    const fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  it('Button übernimmt Variante und Größe als Attribute', async () => {
    const root = await render();
    const button = root.querySelector('button[tkButton]') as HTMLButtonElement;
    expect(button.dataset['variant']).toBe('primary');
    expect(button.dataset['size']).toBe('sm');
  });

  it('Button setzt auf Links kein type-Attribut', async () => {
    const root = await render();
    expect(root.querySelector('a[tkButton]')?.hasAttribute('type')).toBe(false);
  });

  it('Chip und Status tragen den passenden Ton', async () => {
    const root = await render();
    expect((root.querySelector('tk-chip') as HTMLElement).dataset['tone']).toBe('green');
    expect((root.querySelector('tk-status') as HTMLElement).dataset['tone']).toBe('red');
  });

  it('Status kennt das Vokabular der Figma-Ansichten', () => {
    expect(toneForStatus('Fit')).toBe('green');
    expect(toneForStatus('Unauffällig')).toBe('green');
    expect(toneForStatus('Angeschlagen')).toBe('amber');
    expect(toneForStatus('Beobachten')).toBe('blue');
    expect(toneForStatus('Nicht einsetzen')).toBe('red');
    expect(toneForStatus('irgendwas')).toBe('neutral');
  });
});

describe('Dialog', () => {
  @Component({
    imports: [Dialog],
    template: `<tk-dialog title="Titel" [open]="open" (closed)="closes = closes + 1">Inhalt</tk-dialog>`,
  })
  class DialogHost {
    open = false;
    closes = 0;
  }

  it('meldet das Schließen an den Aufrufer, statt sich selbst zu schließen', async () => {
    await TestBed.configureTestingModule({ imports: [DialogHost] }).compileComponents();
    const fixture = TestBed.createComponent(DialogHost);
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;
    (root.querySelector('.close') as HTMLButtonElement).click();
    expect(fixture.componentInstance.closes).toBe(1);
    expect(root.querySelector('h2')?.textContent).toBe('Titel');
  });
});
