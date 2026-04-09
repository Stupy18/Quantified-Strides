"""
dump_schema.py — Print exact CREATE TABLE statements from the live DB.

Run from project root:
    python scripts/dump_schema.py

Paste the output next to your schema.sql to compare.
"""

import psycopg2

conn = psycopg2.connect(
    host="localhost", port=5432,
    dbname="quantifiedstrides",
    user="quantified", password="2026",
)
cur = conn.cursor()

# Get all tables
cur.execute("""
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public'
    ORDER BY table_name
""")
tables = [r[0] for r in cur.fetchall()]

print("-- ============================================================")
print("-- LIVE DB SCHEMA DUMP")
print("-- ============================================================\n")

for table in tables:
    # Get columns
    cur.execute("""
        SELECT
            column_name,
            data_type,
            character_maximum_length,
            numeric_precision,
            is_nullable,
            column_default
        FROM information_schema.columns
        WHERE table_name = %s AND table_schema = 'public'
        ORDER BY ordinal_position
    """, (table,))
    cols = cur.fetchall()

    # Get constraints
    cur.execute("""
        SELECT
            tc.constraint_type,
            tc.constraint_name,
            kcu.column_name,
            ccu.table_name AS foreign_table,
            ccu.column_name AS foreign_column,
            rc.delete_rule
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
            ON tc.constraint_name = kcu.constraint_name
        LEFT JOIN information_schema.referential_constraints rc
            ON tc.constraint_name = rc.constraint_name
        LEFT JOIN information_schema.constraint_column_usage ccu
            ON rc.unique_constraint_name = ccu.constraint_name
        WHERE tc.table_name = %s AND tc.table_schema = 'public'
        ORDER BY tc.constraint_type, tc.constraint_name
    """, (table,))
    constraints = cur.fetchall()

    # Get indexes
    cur.execute("""
        SELECT indexname, indexdef
        FROM pg_indexes
        WHERE tablename = %s AND schemaname = 'public'
        ORDER BY indexname
    """, (table,))
    indexes = cur.fetchall()

    # Get row count
    cur.execute(f"SELECT COUNT(*) FROM {table}")
    count = cur.fetchone()[0]

    print(f"-- {table} ({count} rows)")
    print(f"CREATE TABLE {table} (")

    col_lines = []
    for col_name, dtype, char_len, num_prec, nullable, default in cols:
        # Build type string
        if dtype == 'character varying':
            type_str = f"VARCHAR({char_len})" if char_len else "VARCHAR"
        elif dtype == 'integer':
            type_str = "INT"
        elif dtype == 'bigint':
            type_str = "BIGINT"
        elif dtype == 'smallint':
            type_str = "SMALLINT"
        elif dtype == 'double precision':
            type_str = "FLOAT"
        elif dtype == 'boolean':
            type_str = "BOOLEAN"
        elif dtype == 'text':
            type_str = "TEXT"
        elif dtype == 'date':
            type_str = "DATE"
        elif dtype in ('timestamp without time zone', 'timestamp'):
            type_str = "TIMESTAMP"
        elif dtype == 'timestamp with time zone':
            type_str = "TIMESTAMPTZ"
        elif dtype == 'jsonb':
            type_str = "JSONB"
        elif dtype == 'ARRAY':
            type_str = "TEXT[]"
        elif dtype == 'USER-DEFINED':
            type_str = "vector(384)"  # pgvector
        else:
            type_str = dtype.upper()

        null_str  = "" if nullable == 'YES' else " NOT NULL"
        default_str = ""
        if default:
            if 'nextval' in str(default):
                type_str = f"SERIAL"
                default_str = ""
                null_str = ""
            elif default == 'false':
                default_str = " DEFAULT FALSE"
            elif default == 'true':
                default_str = " DEFAULT TRUE"
            elif default == 'now()' or 'now()' in str(default):
                default_str = " DEFAULT NOW()"
            elif default == "'{}'::jsonb":
                default_str = " DEFAULT '{}'"
            else:
                default_str = f" DEFAULT {default}"

        col_lines.append(f"    {col_name:<30} {type_str}{null_str}{default_str}")

    print(",\n".join(col_lines))
    print(");\n")

    # Print non-primary-key indexes
    for idxname, idxdef in indexes:
        if 'pkey' not in idxname:
            print(f"-- INDEX: {idxdef};")

    print()

# Print foreign keys separately for clarity
print("\n-- ============================================================")
print("-- FOREIGN KEY RELATIONSHIPS")
print("-- ============================================================\n")

cur.execute("""
    SELECT
        tc.table_name,
        kcu.column_name,
        ccu.table_name AS foreign_table,
        ccu.column_name AS foreign_column,
        rc.delete_rule
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
        ON tc.constraint_name = kcu.constraint_name
    JOIN information_schema.referential_constraints rc
        ON tc.constraint_name = rc.constraint_name
    JOIN information_schema.constraint_column_usage ccu
        ON rc.unique_constraint_name = ccu.constraint_name
    WHERE tc.constraint_type = 'FOREIGN KEY'
      AND tc.table_schema = 'public'
    ORDER BY tc.table_name
""")
fks = cur.fetchall()
for table, col, ftable, fcol, del_rule in fks:
    print(f"  {table}.{col} → {ftable}.{fcol}  (ON DELETE {del_rule})")

print("\n-- ============================================================")
print("-- UNIQUE CONSTRAINTS")
print("-- ============================================================\n")

cur.execute("""
    SELECT tc.table_name, string_agg(kcu.column_name, ', ' ORDER BY kcu.ordinal_position)
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
        ON tc.constraint_name = kcu.constraint_name
    WHERE tc.constraint_type = 'UNIQUE'
      AND tc.table_schema = 'public'
    GROUP BY tc.table_name, tc.constraint_name
    ORDER BY tc.table_name
""")
for table, cols in cur.fetchall():
    print(f"  UNIQUE ({cols}) ON {table}")

cur.close()
conn.close()
print("\n-- Done.")