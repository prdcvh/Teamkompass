import { Component } from '@angular/core';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-home',
  template: `
    <main>
      <h1>TeamKompass</h1>
      <p>{{ teamName }} · Team-ID {{ teamId }}</p>
    </main>
  `,
})
export class Home {
  protected readonly teamName = environment.teamName;
  protected readonly teamId = environment.teamId;
}
