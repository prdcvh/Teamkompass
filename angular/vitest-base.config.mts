import { defineConfig } from 'vitest/config';

// SCRUM-384: Timeouts sind hier nur eine Obergrenze gegen echte Hänger, keine
// Leistungsaussage. Gemessen (4 Kerne, unbelastet) braucht der langsamste Test
// ~0,6 s und die ganze Suite ~23 s; das 5-s-Standardlimit hat also nur ~8x
// Luft und reißt, sobald die Umgebung stark gedrosselt ist (geteilte oder
// überbuchte CPU). Mit 30 s ist es gegen ~47x Verlangsamung abgesichert, ein
// echter Endlos-Hänger fällt weiterhin auf. Siehe angular/README.md,
// Abschnitt "Tests in langsamer Umgebung".
export default defineConfig({
  test: {
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
