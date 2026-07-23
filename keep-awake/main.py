"""Keep Awake - lokale Web-App zur Simulation von Nutzeraktivitaet."""
import json
import random
import threading
from contextlib import asynccontextmanager
from collections import deque
from datetime import datetime
from pathlib import Path
from typing import List, Literal, Optional

import pyautogui
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, field_validator

pyautogui.FAILSAFE = True

BASE_DIR = Path(__file__).parent
CONFIG_PATH = BASE_DIR / "config.json"
STATIC_DIR = BASE_DIR / "static"


class ConfigModel(BaseModel):
    mode: Literal["key", "mouse"] = "key"
    interval_base_s: int = 60
    interval_jitter_s: int = 30
    schedule_enabled: bool = False
    schedule_start: str = "09:00"
    schedule_end: str = "17:30"
    schedule_days: List[int] = [0, 1, 2, 3, 4, 5, 6]
    auto_stop_enabled: bool = False
    auto_stop_minutes: int = 240

    @field_validator("schedule_start", "schedule_end")
    @classmethod
    def validate_time(cls, v: str) -> str:
        datetime.strptime(v, "%H:%M")
        return v

    @field_validator("schedule_days")
    @classmethod
    def validate_days(cls, v: List[int]) -> List[int]:
        if any(d < 0 or d > 6 for d in v):
            raise ValueError("schedule_days muss Werte von 0-6 enthalten")
        return v

    @field_validator("interval_base_s", "auto_stop_minutes")
    @classmethod
    def validate_positive(cls, v: int) -> int:
        if v < 1:
            raise ValueError("Wert muss >= 1 sein")
        return v

    @field_validator("interval_jitter_s")
    @classmethod
    def validate_jitter(cls, v: int) -> int:
        if v < 0:
            raise ValueError("Wert muss >= 0 sein")
        return v


def load_config() -> dict:
    if CONFIG_PATH.exists():
        try:
            data = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
            return ConfigModel(**data).model_dump()
        except Exception:
            pass
    return ConfigModel().model_dump()


def save_config(cfg: dict) -> None:
    CONFIG_PATH.write_text(json.dumps(cfg, indent=2, ensure_ascii=False), encoding="utf-8")


class AppState:
    def __init__(self) -> None:
        self.lock = threading.RLock()
        self.config = load_config()
        self.stop_event = threading.Event()
        self.worker_thread: Optional[threading.Thread] = None
        self.state = "stopped"  # running | paused | stopped
        self.pause_reason: Optional[str] = None
        self.next_action_in: Optional[float] = None
        self.session_start: Optional[datetime] = None
        self.final_runtime = 0.0
        self.log: deque = deque(maxlen=50)


app_state = AppState()


def log_event(message: str) -> None:
    with app_state.lock:
        app_state.log.appendleft({"time": datetime.now().strftime("%H:%M:%S"), "message": message})


def get_config() -> dict:
    with app_state.lock:
        return dict(app_state.config)


def schedule_pause_reason(cfg: dict) -> Optional[str]:
    if not cfg["schedule_enabled"]:
        return None
    now = datetime.now()
    if now.weekday() not in cfg["schedule_days"]:
        return "außerhalb Zeitplan (Wochentag)"
    start_t = datetime.strptime(cfg["schedule_start"], "%H:%M").time()
    end_t = datetime.strptime(cfg["schedule_end"], "%H:%M").time()
    now_t = now.time()
    in_window = (start_t <= now_t <= end_t) if start_t <= end_t else (now_t >= start_t or now_t <= end_t)
    return None if in_window else "außerhalb Zeitplan (Uhrzeit)"


def perform_action(cfg: dict) -> None:
    if cfg["mode"] == "mouse":
        x, y = pyautogui.position()
        pyautogui.moveTo(x + 3, y + 3, duration=0.1)
        pyautogui.moveTo(x, y, duration=0.1)
        log_event("Mausbewegung ausgeführt")
    else:
        pyautogui.press("f15")
        log_event("Taste F15 gedrückt")


def worker_loop() -> None:
    try:
        while not app_state.stop_event.is_set():
            cfg = get_config()

            if cfg["auto_stop_enabled"]:
                elapsed = (datetime.now() - app_state.session_start).total_seconds()
                if elapsed >= cfg["auto_stop_minutes"] * 60:
                    log_event(f"Auto-Stop erreicht nach {cfg['auto_stop_minutes']} Minuten")
                    return

            reason = schedule_pause_reason(cfg)
            if reason:
                with app_state.lock:
                    app_state.state = "paused"
                    app_state.pause_reason = reason
                    app_state.next_action_in = None
                if app_state.stop_event.wait(1):
                    return
                continue

            with app_state.lock:
                if app_state.state == "paused":
                    log_event("Zeitplan aktiv, Worker läuft weiter")
                app_state.state = "running"
                app_state.pause_reason = None

            base, jitter = cfg["interval_base_s"], cfg["interval_jitter_s"]
            lo = max(1.0, base - jitter)
            hi = max(lo, base + jitter)
            remaining = random.uniform(lo, hi)
            aborted = False

            while remaining > 0:
                if app_state.stop_event.is_set():
                    aborted = True
                    break
                cfg_live = get_config()
                if cfg_live["auto_stop_enabled"]:
                    elapsed = (datetime.now() - app_state.session_start).total_seconds()
                    if elapsed >= cfg_live["auto_stop_minutes"] * 60:
                        log_event(f"Auto-Stop erreicht nach {cfg_live['auto_stop_minutes']} Minuten")
                        return
                if schedule_pause_reason(cfg_live):
                    aborted = True
                    break
                with app_state.lock:
                    app_state.state = "running"
                    app_state.next_action_in = round(remaining, 1)
                tick = min(1.0, remaining)
                if app_state.stop_event.wait(tick):
                    aborted = True
                    break
                remaining -= tick

            if aborted:
                continue

            try:
                perform_action(cfg)
            except pyautogui.FailSafeException:
                log_event("Failsafe ausgelöst – Worker gestoppt")
                return
            except Exception as exc:
                log_event(f"Fehler bei Aktion: {exc}")
                return
    finally:
        with app_state.lock:
            app_state.state = "stopped"
            app_state.pause_reason = None
            app_state.next_action_in = None
            if app_state.session_start:
                app_state.final_runtime = (datetime.now() - app_state.session_start).total_seconds()
        log_event("Worker gestoppt")


def start_worker() -> None:
    with app_state.lock:
        if app_state.state != "stopped":
            return
        app_state.stop_event.clear()
        app_state.session_start = datetime.now()
        app_state.final_runtime = 0.0
        app_state.state = "running"
        app_state.pause_reason = None
        app_state.next_action_in = None
    log_event("Worker gestartet")
    thread = threading.Thread(target=worker_loop, daemon=True)
    with app_state.lock:
        app_state.worker_thread = thread
    thread.start()


def stop_worker() -> None:
    with app_state.lock:
        if app_state.state == "stopped":
            return
        thread = app_state.worker_thread
    app_state.stop_event.set()
    if thread:
        thread.join(timeout=5)


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield
    stop_worker()


app = FastAPI(lifespan=lifespan)


@app.get("/api/status")
def api_status() -> dict:
    with app_state.lock:
        state = app_state.state
        if state == "stopped":
            runtime = app_state.final_runtime
        else:
            runtime = (datetime.now() - app_state.session_start).total_seconds() if app_state.session_start else 0.0
        return {
            "state": state,
            "paused_reason": app_state.pause_reason,
            "mode": app_state.config["mode"],
            "next_action_in": app_state.next_action_in,
            "runtime_s": round(runtime, 1),
            "log": list(app_state.log),
        }


@app.post("/api/start")
def api_start() -> dict:
    start_worker()
    return api_status()


@app.post("/api/stop")
def api_stop() -> dict:
    stop_worker()
    return api_status()


@app.get("/api/config")
def api_get_config() -> dict:
    return get_config()


@app.post("/api/config")
def api_set_config(cfg: ConfigModel) -> dict:
    data = cfg.model_dump()
    with app_state.lock:
        app_state.config = data
    save_config(data)
    return data


app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="static")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="127.0.0.1", port=8765)
