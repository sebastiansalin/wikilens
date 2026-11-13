# MariaDB on a development machine

## Verification status

The initial development environment did **not** have MariaDB, MySQL, Docker, or a matching Windows database service installed. Downloading the official portable server from the executor failed because the host could not connect to the download endpoint. No database server was started, no credentials were generated, and no live database integration result is claimed.

The application must therefore report `wikipedia` mode until a real MariaDB connection succeeds. A working API-only demo does not verify the MariaDB challenge requirement. A configured but unreachable database must be shown as unavailable.

## Portable Windows option

MariaDB provides a ZIP distribution that does not require a Windows service or a system installation. The official 11.4.12 package catalog was checked for this project:

- [MariaDB 11.4.12 Windows packages](https://dlm.mariadb.com/browse/mariadb_server/11.4.12/winx64-packages/)
- [Portable ZIP](https://dlm.mariadb.com/MariaDB/mariadb-11.4.12/winx64-packages/mariadb-11.4.12-winx64.zip)
- [Official Windows ZIP instructions](https://mariadb.com/docs/server/server-management/install-and-upgrade-mariadb/installing-mariadb/binary-packages/installing-mariadb-windows-zip-packages)
- [System-table initialization options](https://mariadb.com/docs/server/server-management/install-and-upgrade-mariadb/installing-mariadb/installing-system-tables-mariadb-install-db/mariadb-install-db-exe)

Download the ZIP and its `sha256sums.txt` from the same official catalog. Verify the ZIP's SHA-256 against the vendor checksum before executing it. Store the archive, extracted binaries, data directory, configuration, and logs beneath `.local/mariadb-runtime/`, which is ignored by Git.

Initialize the data directory with the supplied `mariadb-install-db.exe`, following the vendor instructions. Do not pass `--service` or enable remote root access. Use a unique local root password and a separate `wikilens` application account restricted to the `wikilens` database.

The server configuration should include:

```ini
[mysqld]
bind-address=127.0.0.1
port=3307
character-set-server=utf8mb4
collation-server=utf8mb4_unicode_ci
```

Also set `basedir`, `datadir`, and the error-log path to absolute paths inside `.local/mariadb-runtime/`. The custom port avoids colliding with a future database on the standard port.

Launch `mariadbd.exe` with that configuration file. If using PowerShell `Start-Process`, include `-WindowStyle Hidden`. Do not register an auto-start service or modify the machine PATH. Keep the database bound to loopback and never expose it through a router, tunnel, or public firewall rule for this prototype.

## Application connection and checks

Use the repository's `.env.example` as the definitive list of connection variables. Keep real connection credentials in an ignored local environment file or a deployment secret store. Never put them in a browser environment variable, source file, README, or screenshot.

After the server is running:

1. Create the application database/account and initialize the repository SQL schema.
2. Run a `SELECT VERSION()` connection check with the application account.
3. Import a real article neighbourhood with the repository's import script.
4. Check that graph rows and the persistent cache are present in MariaDB.
5. Fetch the same graph again and verify database-backed provenance.
6. Restart the API process and verify that cached data survives.
7. Run the bounded graph traversal and cross-language overlap queries against the imported data.

Record the server version, imported topics/languages, row counts, query timings, and which checks passed. These checks remain outstanding until an actual server is available.

## Hosted deployment

A MariaDB instance running on `127.0.0.1` on a developer's computer is not reachable from Vercel. Hosted database mode needs a separate reachable MariaDB endpoint with TLS, restricted credentials, and connection settings in the Vercel project. Provisioning a paid database or changing network exposure is a separate decision; the app should remain explicit about API-only mode until that is configured.
