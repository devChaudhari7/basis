"""Alert delivery for BASIS: Twilio WhatsApp or Telegram, in desk-message prose.

Message content is intentionally terse and numeric.  A missing channel is a
logged warning, never a pipeline failure: the desk's statistics must persist
even when the messaging provider is down.
"""

from __future__ import annotations

from dataclasses import dataclass
import logging
import math
from urllib import error as urlerror
from urllib import parse, request

from .config import Settings


LOGGER = logging.getLogger(__name__)
TELEGRAM_TIMEOUT_SECONDS = 15


@dataclass(frozen=True)
class SignalAlert:
    """Everything a stretched-spread message needs, already computed upstream."""

    slug: str
    display_name: str
    unit: str
    lookback: int
    z: float
    value: float
    pct_rank_252: float
    half_life: float
    adf_p: float
    z_30: float
    z_90: float
    stability: str
    next_event_label: str | None = None
    next_event_days: int | None = None


@dataclass(frozen=True)
class DigestLine:
    """One pair (or open trade) line for the morning digest."""

    text: str


def _fmt(value: float, decimals: int = 2, signed: bool = False) -> str:
    if value is None or not math.isfinite(value):
        return "n/a"
    sign = "+" if signed and value > 0 else ""
    return f"{sign}{value:.{decimals}f}"


def format_signal_message(alert: SignalAlert, public_url: str) -> str:
    windows = f"{_fmt(alert.z_30, 1)}/{_fmt(alert.z, 1)}/{_fmt(alert.z_90, 1)}"
    half_life = f"{_fmt(alert.half_life, 1)}d" if math.isfinite(alert.half_life) else "none detected"
    pct = f"{alert.pct_rank_252:.0f}th" if math.isfinite(alert.pct_rank_252) else "n/a"
    lines = [
        f"BASIS · {alert.display_name}",
        f"z = {_fmt(alert.z, 2, signed=True)}  ({alert.lookback}d)  |  spread {_fmt(alert.value, 2)} {alert.unit}",
        f"1y percentile: {pct}   half-life: {half_life}",
        f"ADF p = {_fmt(alert.adf_p, 2)}   windows 30/60/90: {windows} ({alert.stability})",
    ]
    if alert.next_event_label and alert.next_event_days is not None:
        plural = "" if alert.next_event_days == 1 else "s"
        lines.append(f"next event: {alert.next_event_label} in {alert.next_event_days} day{plural}")
    lines.append(f"→ {public_url}/s/{alert.slug}")
    return "\n".join(lines)


def format_digest(pair_lines: list[DigestLine], trade_lines: list[DigestLine], as_of: str) -> str:
    lines = [f"BASIS digest · {as_of}"]
    lines.extend(line.text for line in pair_lines)
    if trade_lines:
        lines.append("open paper trades:")
        lines.extend(line.text for line in trade_lines)
    else:
        lines.append("open paper trades: none")
    return "\n".join(lines)


def _send_telegram(settings: Settings, body: str) -> bool:
    url = f"https://api.telegram.org/bot{settings.telegram_bot_token}/sendMessage"
    payload = parse.urlencode(
        {
            "chat_id": settings.telegram_chat_id,
            "text": body,
            "disable_web_page_preview": "true",
        }
    ).encode()
    try:
        with request.urlopen(request.Request(url, data=payload), timeout=TELEGRAM_TIMEOUT_SECONDS) as response:
            ok = 200 <= response.status < 300
    except (urlerror.URLError, OSError, ValueError) as exc:
        LOGGER.error("Telegram delivery failed: %s", exc)
        return False
    if not ok:
        LOGGER.error("Telegram delivery returned an unexpected status.")
    return ok


def _send_twilio_whatsapp(settings: Settings, body: str) -> bool:
    try:
        # Imported lazily so a Telegram-only deployment does not need twilio.
        from twilio.rest import Client as TwilioClient  # type: ignore[import-untyped]
    except ImportError:
        LOGGER.error("twilio package is not installed; cannot send WhatsApp message.")
        return False
    try:
        client = TwilioClient(settings.twilio_account_sid, settings.twilio_auth_token)
        client.messages.create(
            from_=settings.twilio_whatsapp_from,
            to=settings.twilio_whatsapp_to,
            body=body,
        )
        return True
    except Exception as exc:  # Twilio raises provider-specific runtime errors.
        LOGGER.error("Twilio WhatsApp delivery failed: %s", exc)
        return False


def send_message(settings: Settings, body: str) -> bool:
    """Deliver one message via the configured channel; report success honestly."""

    if settings.has_twilio_whatsapp:
        return _send_twilio_whatsapp(settings, body)
    if settings.has_telegram:
        return _send_telegram(settings, body)
    LOGGER.warning("No notification channel configured; message not sent:\n%s", body)
    return False
