"""
Database Replication & Local Backup Script
Syncs all tables, schemas, and live data from remote SQL Server (192.168.179.22:1443)
into local Microsoft SQL Server (localhost).
Also saves complete offline SQL DDL schema and CSV backups to database_backup_1443/.
"""

import os
import sys
import csv
import json
import pyodbc
from pathlib import Path
from datetime import datetime

REMOTE_SERVER = "tcp:192.168.179.22,1443"
REMOTE_UID = "sa"
REMOTE_PWD = "Admin@1234"

LOCAL_SERVER = "localhost"

DATABASES_TO_SYNC = ["DocuFlowDB", "DocuFlowArchiveDB"]

BACKUP_ROOT = Path(__file__).resolve().parent.parent / "database_backup_1443"
BACKUP_ROOT.mkdir(parents=True, exist_ok=True)


def get_remote_connection(db_name: str) -> pyodbc.Connection:
    conn_str = (
        f"DRIVER={{ODBC Driver 17 for SQL Server}};"
        f"Server={REMOTE_SERVER};"
        f"Database={db_name};"
        f"UID={REMOTE_UID};"
        f"PWD={REMOTE_PWD};"
        f"TrustServerCertificate=yes;"
        f"Connection Timeout=15;"
    )
    return pyodbc.connect(conn_str)


def get_local_connection(db_name: str) -> pyodbc.Connection:
    conn_str = (
        f"DRIVER={{ODBC Driver 17 for SQL Server}};"
        f"Server={LOCAL_SERVER};"
        f"Database={db_name};"
        f"Trusted_Connection=yes;"
        f"TrustServerCertificate=yes;"
        f"Connection Timeout=15;"
    )
    return pyodbc.connect(conn_str)


def format_col_def(col_tuple) -> str:
    name, type_name, max_len, prec, scale, is_nullable, is_identity = col_tuple
    type_upper = type_name.upper()

    if type_upper in ("VARCHAR", "CHAR", "VARBINARY", "BINARY"):
        len_str = "MAX" if max_len == -1 else str(max_len)
        type_decl = f"{type_upper}({len_str})"
    elif type_upper in ("NVARCHAR", "NCHAR"):
        len_str = "MAX" if max_len == -1 else str(max_len // 2)
        type_decl = f"{type_upper}({len_str})"
    elif type_upper in ("NUMERIC", "DECIMAL"):
        type_decl = f"{type_upper}({prec},{scale})"
    elif type_upper in ("TIME", "DATETIME2", "DATETIMEOFFSET"):
        type_decl = f"{type_upper}({scale})"
    else:
        type_decl = type_upper

    ident_decl = " IDENTITY(1,1)" if is_identity else ""
    null_decl = " NULL" if is_nullable else " NOT NULL"
    return f"[{name}] {type_decl}{ident_decl}{null_decl}"


def get_table_metadata(cur, schema_name: str, table_name: str):
    cur.execute(
        """
        SELECT 
            c.name AS column_name,
            t.name AS type_name,
            c.max_length,
            c.precision,
            c.scale,
            c.is_nullable,
            c.is_identity
        FROM sys.columns c
        JOIN sys.types t ON c.user_type_id = t.user_type_id
        JOIN sys.tables tbl ON c.object_id = tbl.object_id
        JOIN sys.schemas s ON tbl.schema_id = s.schema_id
        WHERE s.name = ? AND tbl.name = ?
        ORDER BY c.column_id
        """,
        schema_name,
        table_name,
    )
    columns = cur.fetchall()

    cur.execute(
        """
        SELECT c.name
        FROM sys.indexes i
        JOIN sys.index_columns ic ON i.object_id = ic.object_id AND i.index_id = ic.index_id
        JOIN sys.columns c ON ic.object_id = c.object_id AND ic.column_id = c.column_id
        JOIN sys.tables tbl ON i.object_id = tbl.object_id
        JOIN sys.schemas s ON tbl.schema_id = s.schema_id
        WHERE s.name = ? AND tbl.name = ? AND i.is_primary_key = 1
        ORDER BY ic.key_ordinal
        """,
        schema_name,
        table_name,
    )
    pk_cols = [r[0] for r in cur.fetchall()]
    return columns, pk_cols


def sync_database(db_name: str):
    print(f"\n{'='*70}")
    print(f"[*] Starting Replication for Database: {db_name}")
    print(f"[*] Source: {REMOTE_SERVER} -> Target: {LOCAL_SERVER}")
    print(f"{'='*70}")

    db_backup_dir = BACKUP_ROOT / db_name
    db_backup_dir.mkdir(parents=True, exist_ok=True)
    schema_sql_path = db_backup_dir / f"{db_name}_schema.sql"

    remote_conn = get_remote_connection(db_name)
    local_conn = get_local_connection(db_name)

    r_cur = remote_conn.cursor()
    l_cur = local_conn.cursor()

    # 1. Fetch all user tables with their schemas from remote
    r_cur.execute(
        """
        SELECT s.name AS schema_name, t.name AS table_name
        FROM sys.tables t 
        JOIN sys.schemas s ON t.schema_id = s.schema_id
        WHERE t.is_ms_shipped = 0 
        ORDER BY s.name, t.name
        """
    )
    tables = [(r[0], r[1]) for r in r_cur.fetchall()]
    print(f"[+] Found {len(tables)} tables on remote {db_name}.")

    # 2. Get local tables
    l_cur.execute(
        """
        SELECT s.name AS schema_name, t.name AS table_name
        FROM sys.tables t 
        JOIN sys.schemas s ON t.schema_id = s.schema_id
        WHERE t.is_ms_shipped = 0 
        ORDER BY s.name, t.name
        """
    )
    local_tables = set((r[0], r[1]) for r in l_cur.fetchall())

    # Ensure required schemas exist locally
    remote_schemas = set(s for s, t in tables)
    for s_name in remote_schemas:
        if s_name.lower() != "dbo":
            l_cur.execute(
                f"IF NOT EXISTS (SELECT * FROM sys.schemas WHERE name = '{s_name}') EXEC('CREATE SCHEMA [{s_name}]')"
            )
            local_conn.commit()

    schema_sql_lines = [f"-- Full Schema DDL for {db_name} extracted from {REMOTE_SERVER}\nUSE [{db_name}];\nGO\n"]

    # 3. Synchronize Schema: Create missing tables or columns
    for s_name, tbl in tables:
        full_tbl = f"[{s_name}].[{tbl}]"
        columns, pk_cols = get_table_metadata(r_cur, s_name, tbl)

        # Build CREATE TABLE DDL
        col_defs = [format_col_def(c) for c in columns]
        if pk_cols:
            pk_str = ", ".join(f"[{c}]" for c in pk_cols)
            col_defs.append(f"CONSTRAINT [PK_{s_name}_{tbl}_{db_name}] PRIMARY KEY ({pk_str})")
        create_table_ddl = f"IF NOT EXISTS (SELECT * FROM sys.tables t JOIN sys.schemas s ON t.schema_id = s.schema_id WHERE s.name = '{s_name}' AND t.name = '{tbl}')\nCREATE TABLE {full_tbl} (\n  " + ",\n  ".join(col_defs) + "\n);\nGO\n"
        schema_sql_lines.append(create_table_ddl)

        if (s_name, tbl) not in local_tables:
            print(f"  [+] Creating missing table locally: {full_tbl}")
            raw_create = f"CREATE TABLE {full_tbl} (\n  " + ",\n  ".join(col_defs) + "\n)"
            l_cur.execute(raw_create)
            local_conn.commit()
            local_tables.add((s_name, tbl))
        else:
            # Check for missing columns in existing local table
            l_cur.execute(
                """
                SELECT c.name 
                FROM sys.columns c 
                JOIN sys.tables tbl ON c.object_id = tbl.object_id 
                JOIN sys.schemas s ON tbl.schema_id = s.schema_id
                WHERE s.name = ? AND tbl.name = ?
                """,
                s_name,
                tbl,
            )
            local_col_names = set(r[0] for r in l_cur.fetchall())
            for c in columns:
                col_name = c[0]
                if col_name not in local_col_names:
                    print(f"  [+] Adding missing column locally: {full_tbl}.[{col_name}]")
                    col_def = format_col_def((c[0], c[1], c[2], c[3], c[4], True, False))
                    l_cur.execute(f"ALTER TABLE {full_tbl} ADD {col_def}")
                    local_conn.commit()

    with open(schema_sql_path, "w", encoding="utf-8") as f:
        f.write("\n".join(schema_sql_lines))
    print(f"[+] DDL schema written to: {schema_sql_path}")

    # 4. Disable local foreign key constraints during bulk load
    print("[*] Temporarily disabling local foreign keys for clean data loading...")
    try:
        l_cur.execute('EXEC sp_MSforeachtable "ALTER TABLE ? NOCHECK CONSTRAINT all"')
        local_conn.commit()
    except Exception as exc:
        print(f"  [!] Note on NOCHECK constraints: {exc}")

    # 5. Copy data table-by-table
    print("\n[*] Synchronizing data from remote to local...")
    summary = []

    for s_name, tbl in tables:
        full_tbl = f"[{s_name}].[{tbl}]"
        columns, _ = get_table_metadata(r_cur, s_name, tbl)
        col_names = [c[0] for c in columns]
        has_identity = any(c[6] for c in columns)

        # Fetch remote rows
        r_cur.execute(f"SELECT * FROM {full_tbl}")
        remote_rows = r_cur.fetchall()
        row_count = len(remote_rows)

        # Save local CSV backup
        csv_file = db_backup_dir / f"{s_name}_{tbl}.csv"
        try:
            with open(csv_file, "w", newline="", encoding="utf-8") as f:
                writer = csv.writer(f)
                writer.writerow(col_names)
                for r in remote_rows:
                    writer.writerow([str(item) if item is not None else "" for item in r])
        except Exception as exc:
            print(f"  [!] CSV export warning for {full_tbl}: {exc}")

        # Clear existing local data
        l_cur.execute(f"DELETE FROM {full_tbl}")
        local_conn.commit()

        if row_count > 0:
            cols_str = ", ".join(f"[{c}]" for c in col_names)
            placeholders = ", ".join("?" for _ in col_names)
            insert_sql = f"INSERT INTO {full_tbl} ({cols_str}) VALUES ({placeholders})"

            if has_identity:
                l_cur.execute(f"SET IDENTITY_INSERT {full_tbl} ON")

            l_cur.fast_executemany = True
            batch_size = 500
            for i in range(0, row_count, batch_size):
                batch = [tuple(r) for r in remote_rows[i : i + batch_size]]
                try:
                    l_cur.executemany(insert_sql, batch)
                except Exception:
                    # Fallback to single-row execution if fast_executemany encounters type conversion edge-case
                    for row in batch:
                        l_cur.execute(insert_sql, tuple(row))
                local_conn.commit()

            if has_identity:
                l_cur.execute(f"SET IDENTITY_INSERT {full_tbl} OFF")
                local_conn.commit()

        # Verify local count
        l_cur.execute(f"SELECT COUNT(*) FROM {full_tbl}")
        local_count = l_cur.fetchone()[0]

        status = "MATCH" if row_count == local_count else "MISMATCH"
        print(f"  -> [{full_tbl:45}] Remote: {row_count:5} | Local: {local_count:5} [{status}]")
        summary.append((full_tbl, row_count, local_count, status))

    # 6. Re-enable local foreign keys
    print("\n[*] Re-enabling local foreign key constraints...")
    try:
        l_cur.execute('EXEC sp_MSforeachtable "ALTER TABLE ? WITH CHECK CHECK CONSTRAINT all"')
        local_conn.commit()
    except Exception as exc:
        print(f"  [!] Note on CHECK constraints: {exc}")

    remote_conn.close()
    local_conn.close()

    total_remote = sum(s[1] for s in summary)
    total_local = sum(s[2] for s in summary)
    print(f"\n[OK] {db_name} Replication Completed!")
    print(f"[OK] Total Remote Rows: {total_remote} | Total Local Rows: {total_local}")


if __name__ == "__main__":
    for db in DATABASES_TO_SYNC:
        try:
            sync_database(db)
        except Exception as exc:
            print(f"[!] Error syncing {db}: {exc}")
            import traceback
            traceback.print_exc()
