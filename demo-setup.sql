-- ─────────────────────────────────────────────────────────────
--  IfDAU – Demo-System Setup
--  In phpMyAdmin ausführen
-- ─────────────────────────────────────────────────────────────

-- 1) Demo-Accounts-Tabelle
CREATE TABLE IF NOT EXISTS demo_accounts (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  company_name  VARCHAR(255)  NOT NULL,
  contact_name  VARCHAR(255)  NOT NULL,
  email         VARCHAR(255)  NOT NULL UNIQUE,
  phone         VARCHAR(50)   DEFAULT NULL,
  token         VARCHAR(64)   DEFAULT NULL,
  status        ENUM('pending','active','expired','deactivated') NOT NULL DEFAULT 'pending',
  demo_user_id  INT           DEFAULT NULL,
  expires_at    DATETIME      DEFAULT NULL,
  activated_at  DATETIME      DEFAULT NULL,
  created_at    TIMESTAMP     DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2) Spalte demo_account_id in users
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS demo_account_id INT DEFAULT NULL;

-- 3) is_demo-Flag in trainings (markiert die 3 Demo-Unterweisungen)
ALTER TABLE trainings
  ADD COLUMN IF NOT EXISTS is_demo TINYINT(1) NOT NULL DEFAULT 0;

-- 4) Die ersten 3 aktiven Unterweisungen als Demo markieren
--    (passe ggf. die IDs manuell in phpMyAdmin an)
UPDATE trainings SET is_demo = 1
WHERE status = 'active'
ORDER BY id ASC
LIMIT 3;
