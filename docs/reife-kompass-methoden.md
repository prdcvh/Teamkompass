# Reife-Kompass: Methoden, Quellen, Grenzen (SCRUM-251)

**Methodenversion 1.0** · Stand 10.11.2026 · gilt für `angular/src/app/core/records/maturity.ts`
(`MATURITY_METHOD_VERSION`), `bio-banding.ts` und die Folgetickets des Epics SCRUM-250.

Dieses Dokument ist die fachliche Grundlage, gegen die der vorhandene Rechner (SCRUM-190) geprüft wurde.
Es baut keinen zweiten Rechner. Jede Änderung an Formel, Tabelle, Grenzen oder Regeln unten erhöht die
Methodenversion (Nebensache → 1.1, neue/andere Aussage → 2.0) und braucht passende Referenzfälle in
`maturity.spec.ts`.

Kurzfassung:

| Thema | Ergebnis |
| --- | --- |
| Khamis–Roche-Tabelle | alle 224 Koeffizienten = erratum-korrigierte Abschrift (UW MSK, 2007 nach Erratum 1995 korrigiert); Beispielrechnung Cumming 2017 exakt getroffen. Original und Erratum selbst **nicht geprüft** (Verlag gesperrt). |
| Einheiten, Dezimalalter | korrekt (exakte Zoll-/Pfund-Definition, Tage/365,25, Schaltjahre richtig). |
| Auswahl der Tabellenzeile | nächstes halbes Jahr wie UW-Rechner und matuR; Regel des Originals **nicht geprüft**; führt zu sichtbaren Stufen (bis ca. 2 cm) im Verlauf. Kein Sperrgrund. |
| Kategorien „spät / im Schnitt / früh“ (< 85 / 85–95 / > 95 %) | **nicht belegt als Reifetempo.** %PAH ohne Altersbezug beschreibt den Reifestand, nicht früh/spät. Entscheidungsvorlage in Abschnitt 4. Bestehende PO-Entscheidung vom 02.11.2026 bleibt bis dahin unverändert in der App. |
| Moore 2015 | nicht umsetzen. Jungen-Sitzhöhe-Konstante widersprüchlich (−8,128741 / −8,125741), Original nicht frei zugänglich → **Sperrgrund**; außerdem fehlt die Sitzhöhe in der App. |
| Mirwald 2002 | nicht umsetzen (kein Zusatznutzen, mehr Messaufwand, bekannte Verzerrung). |
| Automatische PHV-Einordnung | bleibt **aus**. |
| Gefundener Fehler außerhalb des Rechners | Belastungsampel liest eine Messung ohne Größe als 0 cm → **SCRUM-302** (High). |

## 1. Begriffe – drei verschiedene Aussagen

Diese drei Aussagen dürfen in der App nicht vermischt werden:

1. **%PAH** (Anteil der erwarteten Erwachsenengröße): heutige Größe ÷ geschätzte Erwachsenengröße × 100.
   Eine Zahl über das Längenwachstum, **kein** Prozentsatz der „gesamten biologischen Entwicklung“.
   Die Erwachsenengröße ist eine Schätzung mit Fehler (Abschnitt 3.5).
2. **Reifestatus** (vor / um / nach dem Wachstumsschub, PHV = Zeitpunkt der größten Wachstumsgeschwindigkeit):
   *wo* ein Spieler gerade in seiner Pubertätsentwicklung steht. Belastbar nur aus einer dichten
   Größenserie (beobachtete PHV) oder durch qualifizierte Beurteilung. %PAH-Bänder sind dafür nur eine Näherung
   (Monasterio et al. 2024: Übereinstimmung hängt stark vom gewählten Band ab).
3. **Reifetempo** (früh / durchschnittlich / spät): *im Vergleich zu Gleichaltrigen einer Referenzgruppe*.
   Braucht immer einen Altersbezug, z. B. z-Wert des %PAH gegen alters­spezifische Mittelwerte und
   Standardabweichungen einer Referenzstudie (Bayer & Bayley 1959, Berkeley Growth Study). So arbeitet die
   Premier League (Player Management Application): z-Wert −0,5 bis +0,5 = durchschnittlich, darüber früh,
   darunter spät; in der Forschung auch ±1,0 (Hill et al. 2020).

Ein 12-Jähriger mit 85 % und ein 15-Jähriger mit 95 % können beide genau durchschnittlich im Tempo sein –
sie stehen nur an verschiedenen Stellen der Pubertät.

## 2. Methodenmatrix

| | Khamis–Roche (umgesetzt) | Moore-1 Jungen (Sitzhöhe) | Moore-2 Jungen (Größe) / Moore Mädchen | Mirwald 2002 |
| --- | --- | --- | --- | --- |
| Status in der App | **aktiv** seit SCRUM-190 | **gesperrt** (Konstante ungeklärt, keine Sitzhöhe) | nicht umgesetzt, nicht empfohlen | nicht umgesetzt, nicht empfohlen |
| Ergebnis | erwartete Erwachsenengröße → %PAH | „maturity offset“ (Jahre bis/seit PHV) | wie Moore-1 | wie Moore-1 |
| Quelle | Khamis & Roche 1994, Pediatrics 94(4):504–507; Erratum Pediatrics 1995;95(3):457 | Moore et al. 2015, MSSE 47(8):1755–1764 | Moore et al. 2015 | Mirwald et al. 2002, MSSE 34(4):689–694 |
| Population | Fels Longitudinal Study, Südwest-Ohio, 223 weiße Jungen, 210 weiße Mädchen, gesund | Kanada (PBMAS), europäische Herkunft; Kreuzvalidierung HBS III (Kanada) und Harpenden (England) | wie Moore-1 | Kanada, Belgien (europäische Herkunft) |
| Eingaben | Geschlecht, Dezimalalter, Größe, Gewicht, Größe beider leiblicher Eltern | Alter, Sitzhöhe | Alter, Größe | Alter, Größe, Sitzhöhe, Beinlänge, Gewicht |
| Einheiten | Original Zoll / Pfund; App cm/kg → exakt umgerechnet | Jahre, cm | Jahre, cm | Jahre, cm, kg |
| Altersbereich | Tabelle 4,0–17,5 J. (halbe Jahre); **App: 12,0 ≤ Alter < 16,0** (PO 02.11.2026) | laut Validierung nur um PHV sinnvoll (Jungen ca. 13–15 J.) | wie Moore-1 | wie Moore-1 |
| Geschlechtsbezug | getrennte Tabellen Jungen/Mädchen; ohne Angabe kein Wert | nur Jungen | Moore-2 Jungen; eigene Mädchenformel (Größe) | getrennt |
| Fehlerangabe | 50-%-/90-%-Fehlergrenze der Erwachsenengröße: Jungen ±2,2 / ±5,3 cm, Mädchen ±1,7 / ±4,3 cm (Abschnitt 3.5) | SEE 0,51 J. | SEE 0,52 J. (Mädchen) | SEE ca. 0,57–0,59 J. |
| Bekannte Grenzen | nur weiße US-Kinder ohne Krankheit; Elterngrößen oft selbst angegeben (zu groß) | sagt bei Früh-/Spätreifenden das PHV-Alter systematisch Richtung Durchschnitt voraus | wie Moore-1 | wie Moore-1, stärker |
| Konflikte | Original + Erratum nicht einsehbar; Auswahlregel der Tabellenzeile nicht am Original geprüft (Abschnitt 3) | Konstante −8,128741 vs. −8,125741 (Abschnitt 5) | keiner gefunden | – |

Keine gemittelten „biologischen Alter“ aus mehreren Modellen: Die Verfahren messen Verschiedenes (Größenanteil
vs. Zeit bis PHV), teilen dieselben Eingaben (Größe, Alter) und damit dieselben Fehler. Dass mehrere verwandte
Formeln übereinstimmen, belegt **keine** höhere Sicherheit.

## 3. Khamis–Roche: Prüfung des vorhandenen Rechners

### 3.1 Formel

Erwachsenengröße (Zoll) = β0 + β1 · Größe (Zoll) + β2 · Gewicht (Pfund) + β3 · Mittelelterngröße (Zoll),
Mittelelterngröße = (Mutter + Vater) / 2. %PAH = Größe ÷ Erwachsenengröße × 100. Umgesetzt in
`predictedAdultHeightCm` und `maturityAt`. Geprüft: richtig.

### 3.2 Koeffiziententabelle und Erratum

- Das Erratum 1995 korrigiert die Gewichtsspalte (im Original um den Faktor 10 zu klein gedruckt).
- Die Verlagsseiten von Original und Erratum (doi 10.1542/peds.95.3.457) waren am 10.11.2026 gesperrt
  (HTTP 403). **Original und Erratum sind damit nicht direkt geprüft.**
- Abgleich stattdessen: Alle 224 Werte (2 Geschlechter × 28 Altersstufen × 4 Koeffizienten) der App wurden
  maschinell mit dem Quelltext des „Adult Stature Predictor“ der UW MSK Radiology (M. L. Richardson,
  uwmsk.org/stature.html, Gewichtsspalte am 20.04.2007 „as in errata … Pediatrics 1995;95:457“ korrigiert)
  verglichen: **0 Abweichungen**. SCRUM-190 hatte zusätzlich calcvita.com (erratum-korrigiert) und matuR
  (Gewichtsspalte unkorrigiert) verglichen.
- Unabhängige Gegenprobe: Beispielrechnung „Spieler B“ aus Cumming et al. (Bio-Banding, 2017):
  13,5 J., 172,5 cm, 55 kg, Mutter 167,6 cm, Vater 172,7 cm → 184,7 cm / 93,4 %. Mit der korrigierten Tabelle
  exakt getroffen, mit der unkorrigierten nicht (Test vorhanden).
- Bewertung: kein Sperrgrund (zwei unabhängige Abschriften + veröffentlichtes Rechenbeispiel stimmen überein).
  Für eine Mädchen-Tabelle gibt es kein veröffentlichtes Rechenbeispiel, das wir prüfen konnten; die
  Mädchenwerte sind nur über die Abschriften gesichert.

### 3.3 Einheiten

1 Zoll = 2,54 cm, 1 Pfund = 0,45359237 kg (exakte Definitionen). Gerechnet wird ungerundet; gerundet wird erst
die Anzeige (Prozent auf 0,1). Geprüft: richtig. Referenzfall: Mädchen 12,5 J., 150 cm, 44 kg, Eltern
165/178 cm → 64,1354 Zoll = 162,90 cm, 92,08 % (von Hand in Zoll/Pfund nachgerechnet).

### 3.4 Dezimalalter und Auswahl der Tabellenzeile

- Dezimalalter = Kalendertage seit Geburt ÷ 365,25 (UTC, kein Zeitzonenfehler). Schaltjahre: 12. und
  16. Geburtstag ergeben immer genau 12,0 bzw. 16,0 (in 12 und 16 Jahren liegen immer 3 bzw. 4 Schalttage,
  2000–2099). Geboren am 29.02.2012: 28.02.2024 = 11,997 (kein Wert), 29.02.2024 = 12,000 (Wert),
  28.02.2028 = 15,997 (Wert), 29.02.2028 = 16,000 (kein Wert). Geprüft: richtig, Referenzfälle vorhanden.
- Tabellenzeile = nächstes halbes Jahr (`Math.round(alter × 2) / 2`), wie im UW-Rechner und in matuR. Ob das
  Original rundet oder interpoliert, konnten wir nicht prüfen (Volltext gesperrt). Folge: Am Viertel-Jahr
  springt die Zeile. Beispiel Spieler B: 13,2485 J. (Zeile 13,0) → 186,8 cm; einen Tag später 13,2512 J.
  (Zeile 13,5) → 184,7 cm. Linear interpoliert wären es 185,8 cm. Die Stufe (≈ 2 cm, ≈ 1 Prozentpunkt) liegt
  innerhalb der 50-%-Fehlergrenze und ist **kein Sperrgrund**, kann aber im Verlauf wie ein Sprung aussehen.
  Vorschlag für SCRUM-255 (Reifeanzeige): Stufen im Verlauf nicht als Entwicklung deuten; die Regel bleibt in
  Version 1.0 unverändert, eine Umstellung auf Interpolation wäre Version 2.0.
- Im Anzeigebereich 15,75–15,99 J. wird die Zeile 16,0 benutzt (liegt in der Tabelle, korrekt).

### 3.5 Fehler der Schätzung (keine individuellen Konfidenzintervalle)

UW-Rechner (aus Khamis & Roche): 50-%-Fehlergrenze ±0,851 Zoll (2,2 cm) Jungen / ±0,657 Zoll (1,7 cm)
Mädchen; 90-%-Grenze ±2,101 Zoll (5,3 cm) / ±1,675 Zoll (4,3 cm). Das sind Anteile der Fels-Kinder, deren
Abweichung kleiner war – **kein** Konfidenzintervall für ein einzelnes Kind, schon gar nicht für Kinder
außerhalb der Fels-Population. Gleiches gilt für SEE/RMSE der Moore-/Mirwald-Formeln.

Auswirkung auf %PAH: Spieler B (93,4 %) läge mit ±5,3 cm Erwachsenengröße zwischen 90,8 % und 96,2 % –
das überdeckt zwei Bio-Bänder und beide Seiten der 95-%-Grenze. Grenzwerte auf eine Nachkommastelle sind
deshalb nur Rechenregeln, keine scharfen Aussagen.

Der Karten-Text „Schätzung, meist ± 5 cm“ passt für Jungen (90 %: 5,3 cm). Vorschlag für SCRUM-255: genauer
„bei 9 von 10 Kindern der Studiengruppe lag die Abweichung unter ca. 5 cm“.

### 3.6 Fehlende und ungültige Angaben

Kein Wert ohne: Geburtsdatum, Geschlecht, Einverständnis der Eltern, beide Elterngrößen, Größe **und**
Gewicht derselben Messung, Alter 12,0–15,99. Null, negative Werte, NaN und Alter außerhalb der Tabelle →
kein Wert (`null`). Geprüft, Referenzfälle vorhanden.

## 4. Entscheidungsvorlage: Kategorien aus SCRUM-190

**Bestehende Entscheidung (PO, 02.11.2026, in SCRUM-190 dokumentiert, in der App aktiv):**
unter 85 % „spät entwickelt“, 85–95 % „im Schnitt“, über 95 % „früh entwickelt“.

**Befund:** Die Grenzen sind nicht altersbezogen, die Wörter „früh/spät“ beschreiben aber ein Tempo im
Vergleich zu Gleichaltrigen. Rechenbeispiel mit dem App-Rechner, ein erfundener Junge, der jedes Jahr ganz
normal wächst (Mittelelterngröße 170 cm):

| Alter | Größe / Gewicht | %PAH | App sagt heute |
| --- | --- | --- | --- |
| 12 | 149 cm / 40,5 kg | 84,1 % | spät entwickelt |
| 13 | 156 cm / 45,5 kg | 87,9 % | im Schnitt |
| 14 | 163,5 cm / 51 kg | 92,1 % | im Schnitt |
| 15 | 169,5 cm / 56 kg | 95,7 % | früh entwickelt |

Derselbe Junge wechselt von „spät“ zu „früh“, nur weil er älter wird. Bei Mädchen (früherer Wachstumsschub)
liegt %PAH im Bereich 12–15 J. meist schon über 90 %; ein gleich normal wachsendes Mädchen wäre ab 13 J.
„früh entwickelt“ (95,1 %). Die Grenzen 85/90/95 % stammen aus dem Bio-Banding, wo sie **Gruppen nach
Reifestand** bilden, nicht Früh-/Spätreifende benennen. Für die Grenzen als Reifetempo gibt es keine Validierung
– weder alters- noch populationsbezogen.

**Optionen für den PO:**

- **A – neutrale Beschriftung (Empfehlung).** Die Zahl bleibt, die Wörter „früh/spät/im Schnitt“ fallen weg.
  Angezeigt wird „93,4 % der erwarteten Erwachsenengröße“ plus das Bio-Band („90 bis 95 %“), so wie es das
  Bio-Banding (SCRUM-191) schon tut. Keine neuen Grenzwerte, nichts Unbelegtes. Aufwand klein.
- **B – Reifestatus-Wörter** („eher vor / um / nach dem Wachstumsschub“) aus %PAH-Bändern. Nicht empfohlen:
  Das wäre eine automatische PHV-Einordnung, die laut Epic ohne eigene Validierung aus bleibt; die Literatur
  nennt verschiedene Bänder für „um PHV“ (85–96, 88–96, 88–93, 90–93 %, Monasterio et al. 2024) mit je nach
  Band unterschiedlicher Trefferquote.
- **C – echtes Reifetempo** über z-Werte gegen eine Altersreferenz (Bayer & Bayley 1959; ±0,5 wie die
  Premier League). Fachlich der richtige Weg für „früh/spät“, aber **gesperrt**, bis die Referenztabelle
  (Mittelwert und Standardabweichung von %PAH je Alter, Jungen und Mädchen) aus der Originalquelle vorliegt
  und geprüft ist; sie war für uns nicht zugänglich. Gilt außerdem nur für die Referenzpopulation (historische
  US-Längsschnittstudie).
- **D – unverändert lassen.** Dann sollte die Karte mindestens sagen, dass „früh/spät“ hier nur heißt „mehr
  bzw. weniger als 85/95 % der erwarteten Größe“, unabhängig vom Alter.

Bis zur Entscheidung bleibt die App unverändert (Option D ohne Zusatztext). Umsetzung von A, C oder D-Text:
eigenes kleines Ticket, Methodenversion 1.1 (A, D) bzw. 2.0 (C).

## 5. Moore 2015 und Mirwald 2002

- **Jungen-Konstante Moore-1 (Sitzhöhe):** −8,128741 in Kozieł & Malina 2018 (PMC5752743, Gleichung im
  Volltext geprüft) und in Towlson et al. 2021 (J Sport Health Sci, PMC8343060, Tabelle 1, geprüft);
  −8,125741 im Ausgangstext des PO und laut Suchergebnis in einer Tabelle des J Sports Sci Med (Artikel 21-640,
  nicht direkt abrufbar). Das Original (Moore et al. 2015) ist nicht frei zugänglich; die Zusammenfassung
  nennt keine Konstanten. **Nicht aufgelöst → Sperrgrund für Moore-1.** Die Mehrheit der geprüften Quellen
  spricht für −8,128741; vor einer Umsetzung muss das Original eingesehen werden.
- Moore-2 Jungen (−7,999994 + 0,0036124 · Alter · Größe) und Mädchen (−7,709133 + 0,0042232 · Alter · Größe)
  stimmen in den geprüften Quellen überein.
- **Nutzen gering:** Kozieł & Malina 2018 (Wrocław, 193 Jungen, 198 Mädchen): Vorhersagen bei Früh- und
  Spätreifenden systematisch falsch, nur bei durchschnittlich reifenden Jungen um 13–15 J. brauchbar.
  Monasterio et al. 2024 (124 Nachwuchsfußballer, Athletic Club): Offset-Gleichungen ordnen ein Drittel bis
  die Hälfte falsch ein; %PAH schneidet besser ab. Die App erfasst keine Sitzhöhe. → Moore wird in Version 1.0
  nicht umgesetzt.
- **Mirwald:** braucht Sitzhöhe und Beinlänge, größere Fehler (SEE ca. 0,57–0,59 J.) und gleiche Verzerrung;
  durch Moore ersetzt. Kein Zusatznutzen → nicht aufnehmen.

## 6. Verlaufshinweise: Mindestdaten, Aktualität, Messfehler (für SCRUM-253, SCRUM-254)

Getrennt von der Reifeschätzung. Grundlage: MacMaster et al. 2021 (PLoS ONE, Nachwuchsfußball U14/U15; Reliabilität aus 12–16 J.):
Größe zweimal messen, bei Abweichung ≥ 0,4 cm eine dritte Messung, Median festhalten; typischer Messfehler
Größe 0,6 cm (Wiederholung nach 7 Tagen), Gewicht 0,3 kg, Sitzhöhe 0,9 cm.

| Regel | Vorschlag Version 1.0 | Begründung |
| --- | --- | --- |
| Toleranz Größe für dritte Messung | Unterschied **≥ 0,4 cm** (in mm vergleichen: ≥ 4 mm) | veröffentlichtes Protokoll im Nachwuchsfußball (MacMaster 2021 und dort zitierte Arbeiten) |
| Toleranz Gewicht / Sitzhöhe | ≥ 0,4 kg / ≥ 0,4 cm | gleiches Protokoll |
| verwendeter Wert | **Median aller Wiederholungen** (bei 2 Werten = Mittelwert, bei 3 der mittlere); Rohwerte bleiben gespeichert | gleiches Protokoll; Median ist robust gegen einen Ausreißer |
| nach der 3. Messung noch > 0,4 cm Spanne | Median verwenden, Messung als „prüfen“ markieren | keine heimliche Korrektur (SCRUM-253) |
| Mindestabstand für eine Wachstumsrate | **90 Tage** zwischen den beiden Messungen | Fehler der Differenz ≈ √2 · 0,6 cm ≈ 0,85 cm; bei 90 Tagen ≈ ±3,4 cm/Jahr (mit Doppelmessung ≈ ±2,4 cm/Jahr). Kürzer wird das Rauschen größer als ein echter Wachstumsschub. Übliches Messraster im Nachwuchsfußball ist vierteljährlich. |
| kürzere Abstände | Werte anzeigen, aber **keine Rate und kein Hinweis** („zu kurz für eine Rate“) | SCRUM-254: kein scheinbarer Verlauf |
| längster Abstand für den Hinweis | 365 Tage | längere Intervalle glätten die Wachstumsspitze weg; Rate in cm/Jahr bleibt anzeigbar |
| Aktualitätsgrenze Hinweis | jüngste gültige Größenmessung **≤ 90 Tage** alt | wie SCRUM-157 heute; Vergleichsmessung ist die jüngste ältere Messung mit 90–365 Tagen Abstand (nicht: beide in den letzten 90 Tagen) |
| Aktualität Reifewert (%PAH) | Wert mit Messdatum; älter als 90 Tage → als „veraltet“ kennzeichnen, nicht ausblenden | vierteljährliches Messraster; Wachstum kann in 3 Monaten 2–3 cm betragen |
| negative Differenz | ab −0,4 cm als „Messung prüfen“ markieren, keine Rate | Kinder schrumpfen nicht; kleiner Rückgang = Messfehler/Tageszeit |
| Mindestdaten | 1 Messung = Ausgangswert; 2 gültige Messungen mit Mindestabstand = genau 1 Rate; ≥ 3 = Verlauf | SCRUM-254 |
| PHV | **keine automatische Erkennung** (weder aus Maximum der Raten noch aus %PAH) | eigene Validierung fehlt; Monasterio 2024: beste Übereinstimmung (≈ 80 %) nur durch erfahrene Personen, die die Kurve ansehen |

Die heutige Ampel (SCRUM-157) nimmt zwei beliebige Messungen der letzten 90 Tage ohne Mindestabstand und
liest eine Messung ohne Größe als 0 cm → falscher „starker Wachstumsschub“: **SCRUM-302** (High). Die Regeln
oben sind für die Umsetzung in SCRUM-254 gedacht.

## 7. Grenzen der Übertragbarkeit

- **Population:** Khamis–Roche: weiße US-Kinder (Fels, Ohio), Moore: Kanada/England, europäische Herkunft.
  Für Kinder anderer Herkunft, heutiger Generationen (säkularer Trend) und Leistungssportler ist die Genauigkeit
  unbekannt. Fußball-Akademien selektieren früh Reifende (Hill et al. 2020) – die Spielergruppe ist also selbst
  keine Normalpopulation.
- **Mädchen:** eigene Tabelle, aber früherer Wachstumsschub; im Bereich 12–15 J. sind viele Mädchen schon
  nach PHV, %PAH liegt hoch und unterscheidet wenig. Moore-Mädchen: kein brauchbares Fenster in der Validierung.
  Grenzen von Jungen dürfen nicht auf Mädchen übertragen werden.
- **Früh-/Spätreifende:** gerade für sie sind die Verfahren am ungenauesten (Offset-Formeln ziehen Richtung
  Durchschnitt; Khamis–Roche mit großem Fehler). Eine Einordnung am Rand ist am unsichersten.
- **Elterngrößen:** Das Verfahren braucht die leiblichen Eltern. Selbst angegebene Größen sind oft zu groß;
  Studien korrigieren sie (Epstein et al. 1995, angewandt bei Hill et al. 2020). Die App unterscheidet heute
  nicht zwischen gemessen und angegeben und korrigiert nicht → als offener Punkt vermerkt.
- **Kein medizinisches Urteil:** keine Knochenalter-, Trainingssperre-, Verletzungs- oder Talentaussage.

## 8. Quellen

Geprüft = Inhalt am 10.11.2026 selbst eingesehen; nicht geprüft = nicht zugänglich, nur indirekt.

| Quelle | Status |
| --- | --- |
| Khamis HJ, Roche AF. Predicting adult stature without using skeletal age: the Khamis-Roche method. Pediatrics 1994;94(4):504–507 | Volltext nicht geprüft (Verlag gesperrt); Zusammenfassung über Wright State CORE Scholar geprüft |
| Erratum, Pediatrics 1995;95(3):457, https://doi.org/10.1542/peds.95.3.457 | **nicht geprüft** (HTTP 403) |
| Richardson ML, Adult Stature Predictor, UW MSK Radiology, http://uwmsk.org/stature.html | geprüft (Quelltext, Tabelle, Fehlergrenzen, Rundungsregel) |
| Cumming SP et al., Bio-Banding in Sport, 2017 (Beispielrechnung) | über SCRUM-190 geprüft |
| Moore SA et al. Enhancing a somatic maturity prediction model. MSSE 2015;47(8):1755–1764, https://doi.org/10.1249/MSS.0000000000000588 | nur Zusammenfassung geprüft; Gleichungen **nicht** am Original geprüft |
| Kozieł SM, Malina RM. Modified maturity offset prediction equations: validation in independent longitudinal samples of boys and girls. Sports Med 2018;48(1):221–236, https://pmc.ncbi.nlm.nih.gov/articles/PMC5752743/ | geprüft |
| Towlson C, Salter J, Ade JD et al. Maturity-associated considerations for training load, injury risk, and physical performance in youth soccer. J Sport Health Sci 2021;10, https://doi.org/10.1016/j.jshs.2020.09.003 | Tabelle der Gleichungen geprüft |
| Monasterio X et al. Estimating maturity status in elite youth soccer players: evaluation of methods. MSSE 2024;56(6):1124–1133, https://doi.org/10.1249/MSS.0000000000003405 | Zusammenfassung geprüft (Forschungsportal Bath); Volltext nicht abrufbar |
| Hill M, Scott S, Malina RM, McGee D, Cumming SP. Relative age and maturation selection biases in academy football. J Sports Sci 2020;38(11–12):1359–1367, https://doi.org/10.1080/02640414.2019.1649524 | geprüft (Autorenmanuskript, Leeds Beckett, CC BY-NC) |
| MacMaster C, Portas M et al. The effect of bio-banding on the anthropometric, physical fitness and functional movement characteristics of academy soccer players. PLoS ONE 2021, https://doi.org/10.1371/journal.pone.0260136 | geprüft (Messprotokoll, Messfehler) |
| Bayer LM, Bayley N. Growth diagnosis. 1959 (Referenz für z-Werte) | **nicht geprüft** (nicht zugänglich) |
| Mirwald RL et al. An assessment of maturity from anthropometric measurements. MSSE 2002;34(4):689–694 | nur über Kozieł & Malina 2018 |
| Epstein LH et al. 1995 (Korrektur selbst angegebener Elterngrößen) | nur über Hill et al. 2020 |
| J Sports Sci Med, Artikel 21-640, Tabelle 2 (−8,125741) | **nicht geprüft** (Verbindung abgebrochen), nur Suchergebnis |
