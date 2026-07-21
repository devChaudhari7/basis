"""Configuration for the BASIS worker.

Secrets are read only at runtime, from GitHub Actions secrets or an untracked
local ``.env``/``.env.local`` file.  Values already present in the environment
always win, so a local dotenv file can never overwrite deployment credentials.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date
import os
from pathlib import Path
from typing import Final

from dotenv import load_dotenv


PROJECT_ROOT: Final[Path] = Path(__file__).resolve().parents[1]
DEFAULT_START_DATE: Final[date] = date(2019, 1, 1)

# These are intentionally the Yahoo symbols from BASIS_BUILD_SPEC.md.  Symbol
# metadata and pair definitions live in seed.py so the database remains the
# source of truth for what the desk actually monitors.
TICKERS: Final[dict[str, str]] = {
    "WTI": "CL=F",
    "BRENT": "BZ=F",
    "NATGAS": "NG=F",
    "GOLD": "GC=F",
    "SILVER": "SI=F",
    "US10Y_NOTE": "ZN=F",
    "NIFTY": "^NSEI",
    "BANKNIFTY": "^NSEBANK",
    "USDINR": "USDINR=X",
    "DXY": "DX-Y.NYB",
}


class ConfigurationError(RuntimeError):
    """Raised when a required runtime setting is absent or malformed."""


def load_environment() -> None:
    """Load local development files without overriding real environment values."""

    for filename in (".env", ".env.local"):
        candidate = PROJECT_ROOT / filename
        if candidate.is_file():
            load_dotenv(dotenv_path=candidate, override=False)


def _optional(name: str) -> str | None:
    value = os.getenv(name)
    return value.strip() if value and value.strip() else None


def _required(name: str) -> str:
    value = _optional(name)
    if value is None:
        raise ConfigurationError(
            f"{name} is required. Set it in the worker environment or GitHub Actions secrets."
        )
    return value


def _int_from_env(name: str, default: int, *, minimum: int = 1) -> int:
    raw = _optional(name)
    if raw is None:
        return default
    try:
        value = int(raw)
    except ValueError as exc:
        raise ConfigurationError(f"{name} must be an integer, not {raw!r}.") from exc
    if value < minimum:
        raise ConfigurationError(f"{name} must be at least {minimum}.")
    return value


def _date_from_env(name: str, default: date) -> date:
    raw = _optional(name)
    if raw is None:
        return default
    try:
        return date.fromisoformat(raw)
    except ValueError as exc:
        raise ConfigurationError(f"{name} must use YYYY-MM-DD, not {raw!r}.") from exc


def _path_from_env(name: str, default: Path) -> Path:
    raw = _optional(name)
    if raw is None:
        return default
    path = Path(raw)
    return path if path.is_absolute() else PROJECT_ROOT / path


@dataclass(frozen=True)
class Settings:
    """Runtime settings. Secret fields are intentionally omitted from repr()."""

    supabase_url: str | None
    supabase_service_role_key: str | None = field(repr=False)
    start_date: date = DEFAULT_START_DATE
    raw_cache_dir: Path = PROJECT_ROOT / "data" / "raw"
    download_retries: int = 4
    download_backoff_seconds: int = 2
    roll_window: int = 60
    roll_min_periods: int = 20
    percentile_window: int = 252
    diagnostics_window: int = 252
    signal_cooldown_sessions: int = 5
    basis_public_url: str = "https://basis.vercel.app"
    twilio_account_sid: str | None = field(default=None, repr=False)
    twilio_auth_token: str | None = field(default=None, repr=False)
    twilio_whatsapp_from: str | None = None
    twilio_whatsapp_to: str | None = None
    telegram_bot_token: str | None = field(default=None, repr=False)
    telegram_chat_id: str | None = None

    @property
    def has_supabase_credentials(self) -> bool:
        return bool(self.supabase_url and self.supabase_service_role_key)

    @property
    def has_twilio_whatsapp(self) -> bool:
        return bool(
            self.twilio_account_sid
            and self.twilio_auth_token
            and self.twilio_whatsapp_from
            and self.twilio_whatsapp_to
        )

    @property
    def has_telegram(self) -> bool:
        return bool(self.telegram_bot_token and self.telegram_chat_id)

    @property
    def has_notification_channel(self) -> bool:
        return self.has_twilio_whatsapp or self.has_telegram

    @classmethod
    def from_env(cls, *, require_supabase: bool = True) -> "Settings":
        """Build settings after safely loading optional local dotenv files."""

        load_environment()
        supabase_url = _optional("SUPABASE_URL")
        service_key = _optional("SUPABASE_SERVICE_ROLE_KEY")
        if require_supabase:
            # Validate both keys together without ever printing either value.
            if supabase_url is None:
                _required("SUPABASE_URL")
            if service_key is None:
                _required("SUPABASE_SERVICE_ROLE_KEY")

        public_url = (_optional("BASIS_PUBLIC_URL") or "https://basis.vercel.app").rstrip("/")
        if not public_url.startswith(("https://", "http://")):
            raise ConfigurationError("BASIS_PUBLIC_URL must begin with http:// or https://.")

        return cls(
            supabase_url=supabase_url,
            supabase_service_role_key=service_key,
            start_date=_date_from_env("BASIS_START_DATE", DEFAULT_START_DATE),
            raw_cache_dir=_path_from_env("BASIS_RAW_CACHE_DIR", PROJECT_ROOT / "data" / "raw"),
            download_retries=_int_from_env("BASIS_DOWNLOAD_RETRIES", 4),
            download_backoff_seconds=_int_from_env("BASIS_DOWNLOAD_BACKOFF_SECONDS", 2),
            roll_window=_int_from_env("BASIS_ROLL_WINDOW", 60),
            roll_min_periods=_int_from_env("BASIS_ROLL_MIN_PERIODS", 20),
            percentile_window=_int_from_env("BASIS_PERCENTILE_WINDOW", 252),
            diagnostics_window=_int_from_env("BASIS_DIAGNOSTICS_WINDOW", 252),
            signal_cooldown_sessions=_int_from_env("BASIS_SIGNAL_COOLDOWN_SESSIONS", 5),
            basis_public_url=public_url,
            twilio_account_sid=_optional("TWILIO_ACCOUNT_SID"),
            twilio_auth_token=_optional("TWILIO_AUTH_TOKEN"),
            twilio_whatsapp_from=_optional("TWILIO_WHATSAPP_FROM"),
            twilio_whatsapp_to=_optional("TWILIO_WHATSAPP_TO"),
            telegram_bot_token=_optional("TELEGRAM_BOT_TOKEN"),
            telegram_chat_id=_optional("TELEGRAM_CHAT_ID"),
        )
