const fs = require('fs');
const path = require('path');
const pool = require('./connection');

async function initDatabase() {
  // Ensure certificates directory exists locally
  const certDir = path.join(__dirname, '..', 'public', 'uploads', 'certificates');
  if (!fs.existsSync(certDir)) fs.mkdirSync(certDir, { recursive: true });

  // Test connection
  const connection = await pool.getConnection();
  connection.release();

  console.log('Datenbankverbindung erfolgreich.');
}

module.exports = { initDatabase };
