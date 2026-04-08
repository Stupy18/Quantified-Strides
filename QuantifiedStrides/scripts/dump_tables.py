"""
dump_tables.py — Print all tables, their columns, and row counts.

Run from project root:
    python scripts/dump_tables.py

Paste the output here so Claude can see exactly what's in the DB.
"""

import psycopg2

conn = psycopg2.connect(
    host="localhost", port=5432,
    dbname="quantifiedstrides",
    user="quantified", password="2026",
)
cur = conn.cursor()

# All tables
cur.execute("""
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public'
    ORDER BY table_name
""")
tables = [r[0] for r in cur.fetchall()]

print("=" * 60)
print("DATABASE DUMP — QuantifiedStrides")
print("=" * 60)

for table in tables:
    # Row count
    cur.execute(f"SELECT COUNT(*) FROM {table}")
    count = cur.fetchone()[0]

    # Columns
    cur.execute("""
        SELECT column_name, data_type
        FROM information_schema.columns
        WHERE table_name = %s
        ORDER BY ordinal_position
    """, (table,))
    cols = cur.fetchall()

    print(f"\n┌─ {table} ({count} rows)")
    for col, dtype in cols:
        print(f"│  {col}: {dtype}")

    # Sample rows (up to 3)
    if count > 0:
        cur.execute(f"SELECT * FROM {table} LIMIT 3")
        rows = cur.fetchall()
        col_names = [c[0] for c in cols]
        print("│  Sample rows:")
        for row in rows:
            print("│   ", dict(zip(col_names, row)))

print("\n" + "=" * 60)
print("Done.")

cur.close()
conn.close()