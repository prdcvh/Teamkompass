# Wetter, Kleidungsempfehlung und E-Mail-Erinnerung (nur `angular/`, SCRUM-102)

Stand der drei Funktionen und was noch fehlt. Gilt nur für die Angular-App; die Kopien unter
`outputs/*` und die Wurzel-Kopie haben diese Funktionen nicht.

## Architektur

```
Browser (Angular)                                   Dritte / Cloud
------------------------------------------------   ---------------------------------------
Event mit Ort/Startzeit
  -> tk-weather (ui/weather)
       -> WeatherService (core/weather)  ----------> api.open-meteo.com   (Vorhersage)
            Cache 30 min je Ort+Tag, Timeout 8 s    (nur Koordinaten + IP)
       -> clothingFor() (core/clothing)
            reine Funktion, rechnet nur lokal
Ortssuche -> GeocodingService --------------------> geocoding-api.open-meteo.com
                                                    (Suchbegriff + IP)

Einstellungen -> NotificationsService ------------> Firestore teams/{teamId}/notifications/{uid}
  Schalter "Erinnerung per E-Mail"                   { emailReminders: bool }  (sonst nichts)

                              [noch nicht gebaut]   Cloud Function (geplant, Zeitplan)
                                                     liest notifications/*, offene Bewertungen
                                                     -> Mailanbieter -> E-Mail an Trainer
```

- Wetter und Ortssuche laufen direkt im Browser; die CSP in `firebase.json` erlaubt dafür genau
  `https://api.open-meteo.com` und `https://geocoding-api.open-meteo.com`.
- Der Wetteranbieter ist austauschbar (`WeatherProvider`), z. B. gegen DWD oder eine Cloud Function.
- Die Kleidungsempfehlung ist eine reine Funktion ohne Netzwerk; es verlassen keine zusätzlichen Daten das Gerät.
- Die Wahl der Erinnerung liegt je Konto in Firestore. Die Regel (`firestore.rules`, `notifications/{uid}`)
  erlaubt nur dem Trainer mit passender `uid` Lesen/Schreiben und nur das Feld `emailReminders` (bool).
  Getestet in `tests/rules/roles.test.mjs` und `tests/rules/clubs.test.mjs`.

## Stand: was gebaut ist und was fehlt

| Teil | Stand |
| --- | --- |
| Wetteranzeige bei Events (SCRUM-98, 151, 153, 155) | live in Angular |
| Kleidungsempfehlung (SCRUM-99) | live in Angular, auf Wunsch einblendbar |
| Schalter „Erinnerung per E-Mail“ (SCRUM-100) | live, speichert nur die Wahl |
| **Erinnerungsdienst (Cloud Function + Mailanbieter)** | **nicht gebaut.** Es wird keine E-Mail versendet. Der Hinweis steht in den Einstellungen. |

## Blaze-Plan und Budget (für den Erinnerungsdienst)

Cloud Functions (und ausgehende Netzwerkaufrufe aus ihnen) gibt es in Firebase nur im Tarif **Blaze**
(Abrechnung nach Verbrauch, Kreditkarte nötig). Der Betrieb für ein paar Teams bleibt im Rahmen der
kostenlosen Kontingente; trotzdem vorher einrichten:

1. In der Firebase-Konsole auf Blaze wechseln.
2. In Google Cloud Billing ein **Budget mit Warn-E-Mail** setzen (z. B. 5 EUR/Monat, Warnungen bei 50/90/100 %).
   Ein Budget warnt nur, es stoppt nichts – bei Bedarf zusätzlich Abrechnung manuell deaktivieren.
3. Die Function selbst begrenzen (`maxInstances: 1`, ein Lauf pro Tag).

Wichtig: Mit Blaze fallen auch für Hosting/Firestore Kosten über den Gratis-Kontingenten an. Das ist eine
Entscheidung des Product Owners.

## Deployment der Function (geplant)

Noch nicht vorhanden – so soll es aussehen, damit die Umsetzung nichts neu entscheiden muss:

- Eigener Ordner `functions/` mit eigener `package.json` (nicht im Angular-Build), Zeitplan-Trigger
  (`onSchedule`, täglich, Zeitzone `Europe/Berlin`), Region `europe-west1` (EU).
- Liest per Admin-SDK (umgeht die Regeln) alle `teams/*/notifications/*` mit `emailReminders == true`,
  ermittelt offene Bewertungen und holt die Adresse aus Firebase Authentication (`getUser(uid).email`) –
  sie wird nirgends gespeichert.
- Der Mailanbieter-Schlüssel kommt als Secret (`firebase functions:secrets:set …`), nie in den Quelltext.
- Die Mail enthält nur „Es sind Bewertungen offen“ und einen Link, keine Namen oder Noten von Spielern.
- Deploy: `firebase deploy --only functions --project teamkompass-b8aac`, in der CI als eigener Schritt
  im Merge-Workflow. Vorher Anbieter im Datenschutztext (`docs/legal/datenschutzerklaerung.md` 2.6, 3) und im
  Auftragsverarbeitungsvertrag ergänzen.

## Schwellenwerte der Kleidung und wie man sie ändert

Alle Werte stehen in `angular/src/app/core/clothing.ts`:

| Konstante | Wert | Wirkung |
| --- | --- | --- |
| `CLOTHING_THRESHOLDS.warm` | 20 °C | ab hier kurze Hose + T-Shirt |
| `CLOTHING_THRESHOLDS.mild` | 12 °C | ab hier kurze Hose + Langarmshirt; darunter lange Hose + Pulli |
| `CLOTHING_THRESHOLDS.cold` | 5 °C | darunter zusätzlich Mütze + Handschuhe |
| `RAIN_JACKET_FROM_PERCENT` | 50 % | ab hier Regenjacke |
| `WIND_PENALTY_FROM_KMH` / `_DEGREES` | 30 km/h / 1 °C | starker Wind zählt wie 1 °C kälter |
| `CHILD_MARGIN_DEGREES` | 1 °C | Kinder kühlen schneller aus: immer 1 °C kälter gerechnet |

Entschieden wird nach der **wirksamen Temperatur**: gefühlte Temperatur (sonst Lufttemperatur) minus Wind-
und Kinder-Zuschlag. Beispiel: gefühlt 21 °C ohne Wind ergibt wirksam 20 °C und damit T-Shirt.

Ändern: Konstante anpassen, in `angular/src/app/core/clothing.spec.ts` die Grenzfälle (gefühlt = Schwelle + 1)
und den Test „Schwellenwerte entsprechen den dokumentierten Werten“ nachziehen, diese Tabelle aktualisieren,
dann `npm run verify`. Die Werte sind eine Annahme und sollten mit dem Trainerteam abgestimmt werden.

## Datenschutz in Kürze

Siehe `docs/legal/datenschutzerklaerung.md` 2.5/2.6 und den Abschnitt „Wettervorhersage“ in den Einstellungen
der App. An Open-Meteo gehen nur Ort (Koordinaten bzw. Suchbegriff) und IP-Adresse, an den späteren Mailanbieter
nur die E-Mail-Adresse des Trainers. Es werden keine personenbezogenen Daten von Minderjährigen an Dritte
übertragen.

## Style-Budget

Komponenten-Styles bleiben unter 6 kB (`anyComponentStyle` in `angular/angular.json`); `npm run verify`
baut damit und würde eine Überschreitung als Warnung melden (siehe `angular/README.md`).
