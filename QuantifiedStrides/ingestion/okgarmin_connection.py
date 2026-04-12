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