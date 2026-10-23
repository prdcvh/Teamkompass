import type { FirebaseApp } from 'firebase/app';
import { appCheckSiteKey } from '../../../environments/firebase';
import { startAppCheck } from './firebase-connection';

describe('App Check (SCRUM-181)', () => {
  it('bleibt ohne Websiteschlüssel aus – der Standard, bis der PO ihn in der Firebase-Konsole anlegt', async () => {
    expect(appCheckSiteKey).toBe('');
    expect(await startAppCheck({} as FirebaseApp)).toBe(false);
  });
});
