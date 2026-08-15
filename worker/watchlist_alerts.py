"""Per-user watchlist alerts.

Each watcher sets their own threshold, so the same spread can be interesting to
one person at 1.5 sigma and to another only at 2.5.  Two rules keep this from
becoming spam:

* **One alert per spread per session.**  A spread that stays stretched for a
  fortnight is news once, not fourteen times.
* **Nothing fires on a session the desk cannot vouch for.**  A roll-suspect day
  or a session with no computable z produces no alert, because the whole point
  of the flag is that the move was not economic.

Delivery goes to the user's own Telegram chat id, which they obtain themselves
by messaging the bot.  No address is ever collected without an explicit action
on their side, and a user with no channel configured still gets the in-app feed.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date
import logging
import math
from typing import Any

from supabase import Client

from .config import Settings
from .notify import _send_telegram


LOGGER = logging.getLogger(__name__)


@dataclass(frozen=True)
class WatchAlert:
    owner_id: str
    pair_slug: str
    display_name: str
    z: float
    threshold: float
    session: date
    message: str


def _as_float(value: Any) -> float:
    try:
        result = float(value)
    except (TypeError, ValueError):
        return math.nan
    return result if math.isfinite(result) else math.nan


def build_alert_message(display_name: str, z: float, threshold: float, url: str, slug: str) -> str:
    direction = "above" if z > 0 else "below"
    return (
        f"BASIS watchlist · {display_name}\n"
        f"z = {z:+.2f} ({direction} your {threshold:.1f} threshold)\n"
        f"→ {url}/s/{slug}"
    )


def collect_alerts(
    watchlists: list[dict[str, Any]],
    latest_by_slug: dict[str, dict[str, Any]],
    names_by_slug: dict[str, str],
    public_url: str,
) -> list[WatchAlert]:
    """Decide who should hear about what, without sending anything yet."""

    alerts: list[WatchAlert] = []
    for row in watchlists:
        slug = str(row.get("pair_slug"))
        latest = latest_by_slug.get(slug)
        if not latest:
            continue

        z = _as_float(latest.get("z"))
        threshold = _as_float(row.get("alert_z"))
        session_text = str(latest.get("d") or "")
        if not math.isfinite(z) or not math.isfinite(threshold) or not session_text:
            continue
        if bool(latest.get("roll_suspect", False)):
            continue
        if abs(z) < threshold:
            continue
        # Already told them about this session.
        if str(row.get("last_alerted_on") or "") == session_text:
            continue

        display_name = names_by_slug.get(slug, slug.upper())
        alerts.append(
            WatchAlert(
                owner_id=str(row["owner_id"]),
                pair_slug=slug,
                display_name=display_name,
                z=z,
                threshold=threshold,
                session=date.fromisoformat(session_text),
                message=build_alert_message(display_name, z, threshold, public_url, slug),
            )
        )
    return alerts


def dispatch_alerts(client: Client, settings: Settings, alerts: list[WatchAlert]) -> int:
    """Record every alert in-app, then push to whoever has a channel set up.

    The in-app row is written first: if Telegram is down the user still sees the
    alert next time they open the desk, and the watchlist is still marked so
    they are not notified twice for the same session.
    """

    if not alerts:
        return 0

    settings_rows = (
        client.table("notification_settings").select("owner_id,telegram_chat_id,enabled").execute().data
        or []
    )
    channels = {
        str(row["owner_id"]): row
        for row in settings_rows
        if row.get("enabled") and row.get("telegram_chat_id")
    }

    delivered = 0
    for alert in alerts:
        session_text = alert.session.isoformat()
        client.table("alerts").upsert(
            {
                "owner_id": alert.owner_id,
                "pair_slug": alert.pair_slug,
                "d": session_text,
                "z": alert.z,
                "message": alert.message,
            },
            on_conflict="owner_id,pair_slug,d",
        ).execute()

        client.table("watchlists").update({"last_alerted_on": session_text}).eq(
            "owner_id", alert.owner_id
        ).eq("pair_slug", alert.pair_slug).execute()

        channel = channels.get(alert.owner_id)
        if not channel or not settings.telegram_bot_token:
            continue
        # Send to the watcher's own chat, not the desk operator's.
        per_user = Settings(
            supabase_url=settings.supabase_url,
            supabase_service_role_key=settings.supabase_service_role_key,
            telegram_bot_token=settings.telegram_bot_token,
            telegram_chat_id=str(channel["telegram_chat_id"]),
            basis_public_url=settings.basis_public_url,
        )
        if _send_telegram(per_user, alert.message):
            delivered += 1

    LOGGER.info("Watchlist alerts: %s recorded, %s pushed", len(alerts), delivered)
    return delivered


def run_watchlist_alerts(
    client: Client,
    settings: Settings,
    latest_by_slug: dict[str, dict[str, Any]],
    names_by_slug: dict[str, str],
) -> None:
    watchlists = (
        client.table("watchlists").select("owner_id,pair_slug,alert_z,last_alerted_on").execute().data
        or []
    )
    if not watchlists:
        return
    alerts = collect_alerts(watchlists, latest_by_slug, names_by_slug, settings.basis_public_url)
    dispatch_alerts(client, settings, alerts)
