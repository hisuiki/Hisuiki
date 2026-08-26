#!/bin/sh
set -eu

: "${PGBOUNCER_DATABASE_HOST:?PGBOUNCER_DATABASE_HOST is required}"
: "${PGBOUNCER_DATABASE_NAME:?PGBOUNCER_DATABASE_NAME is required}"
: "${PGBOUNCER_DATABASE_USER:?PGBOUNCER_DATABASE_USER is required}"
: "${PGBOUNCER_DATABASE_PASSWORD:?PGBOUNCER_DATABASE_PASSWORD is required}"

# These values are written into PgBouncer's line-oriented config. Reject control characters and
# punctuation that could create another setting. Production passwords are generated as
# alphanumeric strings in Terraform, so this is also a useful guard against an accidental secret.
case "$PGBOUNCER_DATABASE_HOST" in
  *[!A-Za-z0-9_./:-]*) echo "PGBOUNCER_DATABASE_HOST contains unsupported characters" >&2; exit 1 ;;
esac
case "$PGBOUNCER_DATABASE_NAME" in
  *[!A-Za-z0-9_.-]*) echo "PGBOUNCER_DATABASE_NAME contains unsupported characters" >&2; exit 1 ;;
esac
case "$PGBOUNCER_DATABASE_USER" in
  *[!A-Za-z0-9_.-]*) echo "PGBOUNCER_DATABASE_USER contains unsupported characters" >&2; exit 1 ;;
esac
case "$PGBOUNCER_DATABASE_PASSWORD" in
  *[!A-Za-z0-9]*) echo "PGBOUNCER_DATABASE_PASSWORD must be alphanumeric" >&2; exit 1 ;;
esac

config_directory="$(mktemp -d /tmp/pgbouncer.XXXXXX)"
trap 'rm -rf "$config_directory"' EXIT HUP INT TERM

cat > "$config_directory/pgbouncer.ini" <<EOF
[databases]
$PGBOUNCER_DATABASE_NAME = host=$PGBOUNCER_DATABASE_HOST port=5432 dbname=$PGBOUNCER_DATABASE_NAME user=$PGBOUNCER_DATABASE_USER password=$PGBOUNCER_DATABASE_PASSWORD

[pgbouncer]
listen_addr = 0.0.0.0
listen_port = 6432
unix_socket_dir =
auth_type = scram-sha-256
auth_file = $config_directory/userlist.txt
pool_mode = transaction
default_pool_size = ${PGBOUNCER_DEFAULT_POOL_SIZE:-4}
reserve_pool_size = ${PGBOUNCER_RESERVE_POOL_SIZE:-1}
reserve_pool_timeout = 3
max_client_conn = ${PGBOUNCER_MAX_CLIENT_CONN:-100}
max_prepared_statements = 100
query_wait_timeout = 30
server_idle_timeout = 60
client_idle_timeout = 300
log_connections = 0
log_disconnections = 0
pidfile =
logfile =
EOF

printf '"%s" "%s"\n' "$PGBOUNCER_DATABASE_USER" "$PGBOUNCER_DATABASE_PASSWORD" > "$config_directory/userlist.txt"
chmod 600 "$config_directory/pgbouncer.ini" "$config_directory/userlist.txt"

exec /usr/local/bin/pgbouncer "$config_directory/pgbouncer.ini"
