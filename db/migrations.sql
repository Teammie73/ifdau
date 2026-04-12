-- IfDAU Datenbank-Migrationen
-- Diese Befehle einmalig im Hetzner phpMyAdmin oder MySQL-Client ausführen.

-- ── 1. Stammdaten-Felder für users ─────────────────────────────────────────
ALTER TABLE users
  ADD COLUMN geburtsdatum    DATE         NULL AFTER position,
  ADD COLUMN firma           VARCHAR(255) NULL AFTER geburtsdatum,
  ADD COLUMN firma_anschrift TEXT         NULL AFTER firma;

-- ── 2. Neue Tabelle: Zuweisungsvorlagen ────────────────────────────────────
CREATE TABLE assignment_templates (
  id           INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
  name         VARCHAR(255) NOT NULL,
  description  TEXT         NULL,
  training_ids JSON         NOT NULL,
  created_at   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
);
