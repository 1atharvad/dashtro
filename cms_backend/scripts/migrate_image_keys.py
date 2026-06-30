"""
One-time migration: rename url→src and alt→alt_text in all Image field objects
across every document in the live database.
"""

import json
import sqlite3
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))
from decouple import config


def rename_image_keys(obj):
    if isinstance(obj, dict):
        new = {k: rename_image_keys(v) for k, v in obj.items()}
        if "url" in new and "alt" in new:
            new["src"] = new.pop("url")
            new["alt_text"] = new.pop("alt")
        return new
    if isinstance(obj, list):
        return [rename_image_keys(i) for i in obj]
    return obj


def main():
    db_path = config("SQLITE_DB_PATH", default="db.sqlite3")
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row

    cursor = conn.cursor()
    cursor.execute("SELECT rowid, collection_id, document_id, data FROM cms_project_workspace_data")
    rows = cursor.fetchall()

    updated = 0
    for row in rows:
        data = json.loads(row["data"])
        new_data = rename_image_keys(data)
        if new_data != data:
            conn.execute(
                "UPDATE cms_project_workspace_data SET data=? WHERE rowid=?",
                (json.dumps(new_data), row["rowid"]),
            )
            print(f"updated: {row['collection_id']} / {row['document_id']}")
            updated += 1

    conn.commit()
    conn.close()
    print(f"\n{updated} document(s) migrated")


if __name__ == "__main__":
    main()
