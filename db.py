import os
import pymysql


def connect(database=True):
    conn = pymysql.connect(host=os.getenv('DB_HOST', '127.0.0.1'),
        port=int(os.getenv('DB_PORT', '3308')), user=os.getenv('DB_USER', 'root'),
        password=os.getenv('DB_PASSWORD', ''), database='wikilens' if database else None,
        charset='utf8mb4', autocommit=True, cursorclass=pymysql.cursors.DictCursor)
    with conn.cursor() as cur:
        cur.execute("SET time_zone = '+00:00'")
    return conn


SCHEMA = [
'''CREATE TABLE IF NOT EXISTS article (
 page_id INT UNSIGNED NOT NULL, title VARCHAR(255) NOT NULL,
 rev_id INT UNSIGNED NOT NULL, parent_id INT UNSIGNED, editor VARCHAR(255),
 comment TEXT, sha1 VARCHAR(40), bytes INT UNSIGNED, text MEDIUMTEXT NOT NULL,
 row_start TIMESTAMP(6) GENERATED ALWAYS AS ROW START INVISIBLE,
 row_end TIMESTAMP(6) GENERATED ALWAYS AS ROW END INVISIBLE,
 PERIOD FOR SYSTEM_TIME(row_start,row_end), PRIMARY KEY(page_id),
 KEY page_start(page_id,row_start), KEY revision_lookup(page_id,rev_id)
) WITH SYSTEM VERSIONING''',
'''CREATE TABLE IF NOT EXISTS reversal (
 page_id INT UNSIGNED, rev_id INT UNSIGNED PRIMARY KEY,
 reverted_rev_id INT UNSIGNED, restored_rev_id INT UNSIGNED,
 happened_at DATETIME(6), actor VARCHAR(255), target VARCHAR(255), comment TEXT,
 KEY page_time(page_id,happened_at)
)''',
'''CREATE TABLE IF NOT EXISTS revision_meta (
 page_id INT UNSIGNED, rev_id INT UNSIGNED PRIMARY KEY,
 editor VARCHAR(255), happened_at DATETIME(6),
 KEY page_time(page_id,happened_at)
)''',
'''CREATE TABLE IF NOT EXISTS article_link (
 source_id INT UNSIGNED, target_id INT UNSIGNED,
 PRIMARY KEY(source_id,target_id), KEY target_idx(target_id)
)''',
'''CREATE TABLE IF NOT EXISTS metadata (name VARCHAR(100) PRIMARY KEY, value TEXT)'''
]
