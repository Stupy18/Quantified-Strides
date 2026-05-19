from datetime import date, timedelta

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession


class RecommendationRepo:
    def __init__(self, db: AsyncSession):
        self.db = db

    # ── training_load_daily ────────────────────────────────────────────────────

    async def upsert_training_load_daily(
        self,
        user_id: int,
        load_date: date,
        atl: float,
        ctl: float,
        tsb: float,
        acwr: float | None,
        ramp_rate: float | None,
    ) -> None:
        await self.db.execute(
            text("""
                INSERT INTO training_load_daily
                    (user_id, load_date, atl, ctl, tsb, acwr, ramp_rate, computed_at)
                VALUES
                    (:uid, :load_date, :atl, :ctl, :tsb, :acwr, :ramp_rate, NOW())
                ON CONFLICT (user_id, load_date) DO UPDATE SET
                    atl         = EXCLUDED.atl,
                    ctl         = EXCLUDED.ctl,
                    tsb         = EXCLUDED.tsb,
                    acwr        = EXCLUDED.acwr,
                    ramp_rate   = EXCLUDED.ramp_rate,
                    computed_at = NOW()
            """),
            {
                "uid": user_id, "load_date": load_date,
                "atl": atl, "ctl": ctl, "tsb": tsb,
                "acwr": acwr, "ramp_rate": ramp_rate,
            },
        )

    async def get_training_load_daily(self, user_id: int, target_date: date):
        """Returns the most recent row within 7 days of target_date, or None."""
        result = await self.db.execute(
            text("""
                SELECT load_date, atl, ctl, tsb, acwr, ramp_rate
                FROM training_load_daily
                WHERE user_id = :uid
                  AND load_date BETWEEN :earliest AND :target
                ORDER BY load_date DESC
                LIMIT 1
            """),
            {
                "uid": user_id,
                "earliest": target_date - timedelta(days=7),
                "target": target_date,
            },
        )
        return result.fetchone()

    # ── pattern_fatigue_ledger ─────────────────────────────────────────────────

    async def get_pattern_fatigue_ledger(self, user_id: int, since_date: date) -> list:
        """Returns ledger rows for all patterns since the given date."""
        result = await self.db.execute(
            text("""
                SELECT l.pattern_key, l.session_date, l.fatigue_units,
                       m.fatigue_decay_tau_h
                FROM pattern_fatigue_ledger l
                JOIN movement_patterns m USING (pattern_key)
                WHERE l.user_id = :uid
                  AND l.session_date >= :since
                ORDER BY l.session_date
            """),
            {"uid": user_id, "since": since_date},
        )
        return result.fetchall()

    async def upsert_pattern_fatigue_ledger(
        self,
        user_id: int,
        pattern_key: str,
        session_date: date,
        fatigue_units: float,
    ) -> None:
        await self.db.execute(
            text("""
                INSERT INTO pattern_fatigue_ledger
                    (user_id, pattern_key, session_date, fatigue_units, computed_at)
                VALUES (:uid, :pattern_key, :session_date, :fatigue_units, NOW())
                ON CONFLICT (user_id, pattern_key, session_date) DO UPDATE SET
                    fatigue_units = pattern_fatigue_ledger.fatigue_units + EXCLUDED.fatigue_units,
                    computed_at   = NOW()
            """),
            {
                "uid": user_id,
                "pattern_key": pattern_key,
                "session_date": session_date,
                "fatigue_units": fatigue_units,
            },
        )

    async def get_pattern_ledger_entry_counts(self, user_id: int) -> dict[str, int]:
        """Returns {pattern_key: session_count} for cold-start detection."""
        result = await self.db.execute(
            text("""
                SELECT pattern_key, COUNT(DISTINCT session_date) AS cnt
                FROM pattern_fatigue_ledger
                WHERE user_id = :uid
                GROUP BY pattern_key
            """),
            {"uid": user_id},
        )
        return {row.pattern_key: row.cnt for row in result.fetchall()}

    # ── biomechanics_baselines ─────────────────────────────────────────────────

    async def get_biomechanics_baseline(self, user_id: int, terrain_type: str):
        """Returns the biomechanics baseline row for the given terrain, or None."""
        result = await self.db.execute(
            text("""
                SELECT cadence_slope, cadence_intercept, cadence_r2,
                       gct_mean_ms, gct_sd_ms,
                       vertical_ratio_mean, vertical_ratio_sd,
                       sessions_used
                FROM biomechanics_baselines
                WHERE user_id = :uid AND terrain_type = :terrain
            """),
            {"uid": user_id, "terrain": terrain_type},
        )
        return result.fetchone()

    # ── movement_patterns catalog ─────────────────────────────────────────────

    async def get_movement_patterns(self) -> dict[str, float]:
        """Returns {pattern_key: fatigue_decay_tau_h} for all 9 patterns."""
        result = await self.db.execute(
            text("SELECT pattern_key, fatigue_decay_tau_h FROM movement_patterns"),
        )
        return {row.pattern_key: float(row.fatigue_decay_tau_h) for row in result.fetchall()}