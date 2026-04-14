from pathlib import Path

import garminconnect

from core.config import GARMIN_EMAIL, GARMIN_PASSWORD

_client: garminconnect.Garmin | None = None

# Tokens are cached here so re-logins are skipped across restarts.
_TOKEN_DIR = str(Path.home() / ".garmin_tokens")


def get_garmin_client() -> garminconnect.Garmin:
    global _client
    if _client is None:
        client = garminconnect.Garmin(GARMIN_EMAIL, GARMIN_PASSWORD)
        client.login(tokenstore=_TOKEN_DIR)  # raises on failure — don't cache until success
        _client = client
        print("Garmin client initialised and logged in.")
    return _client


def reset_garmin_client() -> garminconnect.Garmin:
    """Call this if a request fails with an auth error to force a fresh login."""
    global _client
    _client = None
    return get_garmin_client()