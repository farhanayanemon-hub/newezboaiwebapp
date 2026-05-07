#!/usr/bin/env bash
#
# EzboAI Daily PostgreSQL Backup
# Add to cron: 0 3 * * * /var/www/ezboai/infrastructure/backup.sh >> /var/log/ezboai-backup.log 2>&1
#
set -euo pipefail

BACKUP_DIR="/var/backups/ezboai"
DB_NAME="ezboai"
DB_USER="ezbouser"
RETENTION_DAYS=14
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

mkdir -p "$BACKUP_DIR"

# Read DB password from .env.production
ENV_FILE="/var/www/ezboai/.env.production"
if [ -f "$ENV_FILE" ]; then
  export PGPASSWORD=$(grep '^DATABASE_URL=' "$ENV_FILE" | sed -E 's|.*://[^:]+:([^@]+)@.*|\1|')
fi

BACKUP_FILE="${BACKUP_DIR}/ezboai_${TIMESTAMP}.sql.gz"

echo "[$(date)] Starting backup → ${BACKUP_FILE}"
pg_dump -h localhost -U "$DB_USER" -d "$DB_NAME" --no-owner --clean --if-exists | gzip > "$BACKUP_FILE"

# Verify backup is not empty
if [ ! -s "$BACKUP_FILE" ]; then
  echo "[$(date)] ERROR: Backup file is empty!"
  exit 1
fi

SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
echo "[$(date)] Backup successful: ${SIZE}"

# Delete backups older than RETENTION_DAYS
find "$BACKUP_DIR" -name "ezboai_*.sql.gz" -mtime +${RETENTION_DAYS} -delete
echo "[$(date)] Cleaned backups older than ${RETENTION_DAYS} days"

# Optional: upload to remote storage (uncomment + configure)
# aws s3 cp "$BACKUP_FILE" s3://ezboai-backups/
# rclone copy "$BACKUP_FILE" remote:ezboai-backups/
