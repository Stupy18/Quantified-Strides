import garminconnect
from core.config import GARMIN_EMAIL, GARMIN_PASSWORD

_client: garminconnect.Garmin | None = None


def get_garmin_client() -> garminconnect.Garmin:
    global _client
    if _client is None:
        _client = garminconnect.Garmin(GARMIN_EMAIL, GARMIN_PASSWORD)
        _client.login()
        print("Garmin client initialised and logged in.")
    return _client

def reset_garmin_client() -> garminconnect.Garmin:
    """Call this if a request fails with an auth error to force a fresh login."""
    global _client
    _client = None
    return get_garmin_client()