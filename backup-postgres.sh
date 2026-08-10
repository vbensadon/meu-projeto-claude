#!/usr/bin/env bash
# ============================================================
# Backup diário do Postgres (AgendaBot) -> Backblaze B2
# Uso: bash backup-postgres.sh
# Agendar no cron:  0 3 * * * /root/backup-postgres.sh >> /var/log/backup.log 2>&1
# Pré-requisitos: rclone configurado com remote "b2" (rclone config)
# ============================================================
set -euo pipefail

# ----- AJUSTE ESTAS VARIÁVEIS -----
CONTAINER="agendabot-postgres"     # nome do container (veja com: docker ps)
DB_USER="agendabot"
DB_NAME="agendabot"
B2_REMOTE="b2:agendabot-backups"   # remote:bucket configurado no rclone
ALERT_EMAIL=""                     # ex: ops@agendabot.com.br (deixe vazio para desativar)
ALERT_WEBHOOK=""                   # ex: URL do Slack/Discord (deixe vazio para desativar)
# ----------------------------------

BACKUP_DIR="/root/backups"
RETENTION_DAYS=30
TIMESTAMP=$(date +%Y-%m-%d_%H%M)
FILE="$BACKUP_DIR/agendabot_$TIMESTAMP.sql.gz"

# ----- Alerta em caso de falha -----
alerta_falha() {
  local msg="[AgendaBot] Backup FALHOU em $(hostname) às $(date). Verifique: /var/log/backup.log"
  echo "[$(date)] ERRO: $msg" >&2

  if [ -n "$ALERT_EMAIL" ] && command -v mail &>/dev/null; then
    echo "$msg" | mail -s "[AgendaBot] Backup FALHOU" "$ALERT_EMAIL" || true
  fi

  if [ -n "$ALERT_WEBHOOK" ]; then
    curl -s -X POST "$ALERT_WEBHOOK" \
      -H "Content-Type: application/json" \
      -d "{\"text\": \"$msg\"}" || true
  fi
}

trap 'alerta_falha' ERR

# ----- Backup -----
mkdir -p "$BACKUP_DIR"

echo "[$(date)] Iniciando backup..."

docker exec "$CONTAINER" pg_dump -U "$DB_USER" "$DB_NAME" | gzip > "$FILE"

if [ ! -s "$FILE" ] || ! gunzip -t "$FILE" 2>/dev/null; then
  echo "[$(date)] ERRO: backup vazio ou corrompido!" >&2
  exit 1
fi

SIZE=$(du -h "$FILE" | cut -f1)
echo "[$(date)] Dump OK ($SIZE). Enviando para B2..."

rclone copy "$FILE" "$B2_REMOTE/" --quiet

# ----- Retenção local -----
find "$BACKUP_DIR" -name "agendabot_*.sql.gz" -mtime +"$RETENTION_DAYS" -delete

# ----- Retenção remota (lista e deleta por nome, mais confiável no B2) -----
CUTOFF=$(date -d "-${RETENTION_DAYS} days" +%Y-%m-%d 2>/dev/null || \
         date -v-"${RETENTION_DAYS}"d +%Y-%m-%d)  # compatível Linux e macOS

rclone ls "$B2_REMOTE/" --quiet 2>/dev/null | while read -r _size name; do
  # Nome esperado: agendabot_YYYY-MM-DD_HHMM.sql.gz
  file_date=$(echo "$name" | grep -oP '\d{4}-\d{2}-\d{2}' | head -1 || true)
  if [ -n "$file_date" ] && [[ "$file_date" < "$CUTOFF" ]]; then
    rclone deletefile "$B2_REMOTE/$name" --quiet || true
    echo "[$(date)] Remoto removido: $name"
  fi
done

echo "[$(date)] Backup concluído: $FILE"

# ============================================================
# RESTAURAÇÃO (teste pelo menos uma vez!):
#
# Restaurar no banco existente (cuidado: sobrescreve dados):
#   gunzip -c agendabot_DATA.sql.gz | docker exec -i agendabot-postgres \
#     psql -U agendabot -d agendabot
#
# Restaurar em banco de teste (sem risco):
#   docker exec agendabot-postgres createdb -U agendabot restore_test
#   gunzip -c backup.sql.gz | docker exec -i agendabot-postgres \
#     psql -U agendabot -d restore_test
#   docker exec agendabot-postgres dropdb -U agendabot restore_test
# ============================================================
