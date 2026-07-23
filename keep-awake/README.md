# Keep Awake

Lokale Web-App zur Simulation von Nutzeraktivität, damit der Rechner nicht in
den Idle-/Sperrbildschirm-Zustand geht. Läuft ausschließlich auf `127.0.0.1`,
kein externer Netzwerkzugriff.

## Installation

```bash
cd keep-awake
python3 -m venv venv
source venv/bin/activate   # Windows: venv\Scripts\activate
pip install -r requirements.txt
```

## Start

```bash
python main.py
```

Anschließend im Browser öffnen: http://127.0.0.1:8765

## macOS: Bedienungshilfen-Rechte

`pyautogui` steuert Maus und Tastatur über die macOS-Bedienungshilfen-APIs.
Damit das funktioniert, muss dem Terminal (bzw. der App, aus der `python`
gestartet wird) unter **Systemeinstellungen → Datenschutz & Sicherheit →
Bedienungshilfen** Zugriff erteilt werden. Ohne diese Berechtigung schlagen
die simulierten Tastendrücke/Mausbewegungen unter macOS fehl oder werden
ignoriert.

## Linux: zusätzliche Abhängigkeit

`pyautogui` benötigt unter Linux zusätzlich `python3-tk` (Tkinter), sonst
bricht der Import beim Start ab:

```bash
sudo apt-get install python3-tk
```

## Funktionsweise

- **Modus**: entweder wird periodisch die Taste `F15` gedrückt (existiert auf
  keiner physischen Tastatur und löst in keiner Anwendung eine Aktion aus)
  oder der Mauszeiger wird um wenige Pixel bewegt und exakt wieder auf die
  Ausgangsposition zurückgesetzt.
- **Intervall**: vor jeder Aktion wird eine zufällige Wartezeit aus
  `[Basis − Jitter, Basis + Jitter]` Sekunden gezogen, damit kein starrer
  Takt entsteht.
- **Zeitplan**: optional lässt sich ein Zeitfenster (z. B. 09:00–17:30) sowie
  eine Auswahl von Wochentagen festlegen. Außerhalb des Fensters pausiert der
  Worker, ohne sich zu beenden.
- **Auto-Stop**: optional stoppt der Worker automatisch nach einer
  konfigurierbaren Gesamtlaufzeit.
- **Failsafe**: `pyautogui.FAILSAFE` bleibt aktiviert. Den Mauszeiger schnell
  in die linke obere Bildschirmecke bewegen, bricht die laufende Aktion
  sofort ab und stoppt den Worker.

Einstellungen werden serverseitig in `config.json` gespeichert und beim
nächsten Start automatisch wieder geladen.

## API

| Methode | Pfad           | Beschreibung                                  |
|---------|----------------|------------------------------------------------|
| GET     | `/api/status`  | Aktueller Zustand, Countdown, Laufzeit, Log    |
| POST    | `/api/start`   | Worker starten                                 |
| POST    | `/api/stop`    | Worker stoppen                                 |
| GET     | `/api/config`  | Aktuelle Konfiguration abrufen                 |
| POST    | `/api/config`  | Konfiguration ändern und persistieren          |
