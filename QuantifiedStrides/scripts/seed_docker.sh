#!/bin/sh
set -e

echo "Waiting for a registered user..."
until python - <<'EOF'
import os, psycopg2, sys
try:
    c = psycopg2.connect(
        host=os.environ.get("DB_HOST", "localhost"),
        dbname=os.environ.get("DB_NAME", "quantifiedstrides"),
        user=os.environ.get("DB_USER", "quantified"),
        password=os.environ.get("DB_PASSWORD", "2026"),
    )
    cur = c.cursor()
    cur.execute("SELECT count(*) FROM users")
    n = cur.fetchone()[0]
    c.close()
    sys.exit(0 if n > 0 else 1)
except Exception:
    sys.exit(1)
EOF
do
    sleep 3
done

# Skip if data already exists (workouts are a reliable proxy)
ALREADY_SEEDED=$(python - <<'EOF'
import os, psycopg2, sys
c = psycopg2.connect(
    host=os.environ.get("DB_HOST", "localhost"),
    dbname=os.environ.get("DB_NAME", "quantifiedstrides"),
    user=os.environ.get("DB_USER", "quantified"),
    password=os.environ.get("DB_PASSWORD", "2026"),
)
cur = c.cursor()
cur.execute("SELECT count(*) FROM workouts")
n = cur.fetchone()[0]
c.close()
print(n)
EOF
)

if [ "$ALREADY_SEEDED" -gt "0" ]; then
    echo "Data already present ($ALREADY_SEEDED workouts). Skipping seed."
    exit 0
fi

echo "Running populate_tables.py..."
python scripts/populate_tables.py

echo "Running populate_tables2.py..."
python scripts/populate_tables2.py

echo "Seeding complete."
