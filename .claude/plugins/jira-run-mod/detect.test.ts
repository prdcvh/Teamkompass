import { expect, test } from 'claude-code/testing'

import { berlinClock, ciOf, modelLabel, prNumberOf, statusOfTransition, waitNoteOf } from './hooks/detect'

test('Uhrzeiten: Winterzeit UTC+1, Sommerzeit UTC+2, Umstellung am letzten Sonntag', async () => {
  expect(berlinClock(Date.UTC(2026, 10, 25, 21, 31))).toBe('22:31')
  expect(berlinClock(Date.UTC(2026, 6, 1, 20, 31))).toBe('22:31')
  // 2026: Sommerzeit ab Sonntag 29. März, 01:00 UTC; Ende am 25. Oktober, 01:00 UTC.
  expect(berlinClock(Date.UTC(2026, 2, 29, 0, 59))).toBe('01:59')
  expect(berlinClock(Date.UTC(2026, 2, 29, 1, 0))).toBe('03:00')
  expect(berlinClock(Date.UTC(2026, 9, 25, 0, 59))).toBe('02:59')
  expect(berlinClock(Date.UTC(2026, 9, 25, 1, 0))).toBe('02:00')
})

test('Status, PR-Nummer, CI und Modell werden aus den Aufrufen gelesen', async () => {
  expect(statusOfTransition('ok', { transition: { name: 'In Überprüfung' } })).toBe('In Überprüfung')
  expect(statusOfTransition('ok', { transition: { id: '3' } })).toBe('Frage')
  expect(statusOfTransition('Status ist jetzt "Genehmigt"', { transition: { id: '9' } })).toBe('Genehmigt')
  expect(statusOfTransition('ok', {})).toBeNull()
  expect(prNumberOf('{"html_url":"https://github.com/o/r/pull/236"}')).toBe(236)
  expect(ciOf('{"conclusion":"failure"}')).toBe('rot')
  expect(ciOf('{"status":"queued"}')).toBe('läuft')
  expect(ciOf('{"conclusion":"success"}')).toBe('grün')
  expect(ciOf('nichts')).toBeNull()
  expect(modelLabel('claude-opus-5-5')).toBe('Opus')
  expect(waitNoteOf('**Was noch fehlt / wo ich unsicher bin**\nDie Regel ist unklar.\n\n**Technik**\nPR')).toBe('Die Regel ist unklar.')
  expect(waitNoteOf('kein Abschnitt')).toBeNull()
})
