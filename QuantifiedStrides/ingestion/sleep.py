from datetime import datetime

import garminconnect
from sqlalchemy.ext.asyncio import AsyncSession

from db.session import AsyncSessionLocal
from ingestion.okgarmin_connection import get_garmin_client, reset_garmin_client
from repos.sleep_repo import SleepRepo


async def collect_sleep_data(db: AsyncSession, user_id: int, client: garminconnect.Garmin):
    today_date_str = datetime.today().strftime("%Y-%m-%d")
    today_date = datetime.strptime(today_date_str, "%Y-%m-%d").date()
    print(today_date_str)
    try:
        data = client.get_sleep_data(today_date_str)
    except garminconnect.GarminConnectAuthenticationError:  # token expired mid-session
        client = reset_garmin_client()
        data = client.get_sleep_data(today_date_str)

    repo = SleepRepo(db)

    # Guard: skip if sleep data for today is already recorded
    if await repo.exists_for_date(user_id, today_date):
        print(f"Sleep data for {today_date_str} already recorded. Skipping.")
        return


    sleep_dto = data.get("dailySleepDTO", {})

    deep_sleep_sec  = sleep_dto.get("deepSleepSeconds")  or 0
    light_sleep_sec = sleep_dto.get("lightSleepSeconds") or 0
    rem_sleep_sec   = sleep_dto.get("remSleepSeconds")   or 0
    awake_sleep_sec = sleep_dto.get("awakeSleepSeconds") or 0

    duration_minutes = (deep_sleep_sec + light_sleep_sec + rem_sleep_sec + awake_sleep_sec) // 60

    sleep_score    = sleep_dto.get("sleepScores", {}).get("overall", {}).get("value")
    hrv            = data.get("avgOvernightHrv")
    rhr            = data.get("restingHeartRate")
    avg_stress     = sleep_dto.get("avgSleepStress")
    feedback       = sleep_dto.get("sleepScoreFeedback", "")
    insight        = sleep_dto.get("sleepScoreInsight", "")
    hrv_status     = data.get("hrvStatus", "")
    battery_change = data.get("bodyBatteryChange")

    data = {
        "sleep_date":           today_date,
        "duration_minutes":     duration_minutes,
        "sleep_score":          float(sleep_score)    if sleep_score    else None,
        "hrv":                  float(hrv)            if hrv            else None,
        "rhr":                  int(rhr)              if rhr            else None,
        "time_in_deep":         deep_sleep_sec  // 60,
        "time_in_light":        light_sleep_sec // 60,
        "time_in_rem":          rem_sleep_sec   // 60,
        "time_awake":           awake_sleep_sec // 60,
        "avg_sleep_stress":     float(avg_stress)     if avg_stress     else None,
        "sleep_score_feedback": feedback,
        "sleep_score_insight":  insight,
        "overnight_hrv":        float(hrv)            if hrv            else None,
        "hrv_status":           hrv_status,
        "body_battery_change":  int(battery_change)   if battery_change else None,
    }

    await repo.insert(user_id, data)
    print(f"Inserted today's sleep data for {today_date_str} successfully!")


if __name__ == "__main__":
    import asyncio

    async def main():
        async with AsyncSessionLocal() as db:
            await collect_sleep_data(db, user_id=1, client=get_garmin_client())

    asyncio.run(main())