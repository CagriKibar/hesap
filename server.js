/**
 * Standalone Express REST API Server
 * =================================
 * Run this on the server computer to host the Hausmart database.
 * Usage: node server.js [port] [db_path]
 */
const path = require('path');
const app = require('./express_app');
const { initDatabase } = require('./database');

const DEFAULT_PORT = 8765;
const DEFAULT_DB_PATH = path.join(__dirname, 'satis_takip.db');

const port = process.env.PORT || parseInt(process.argv[2]) || DEFAULT_PORT;
const dbPath = process.env.DB_PATH || process.argv[3] || DEFAULT_DB_PATH;

console.log('Starting Hausmart Server...');
console.log(`Database Path: ${path.resolve(dbPath)}`);

initDatabase(dbPath)
  .then(() => {
    app.listen(port, '0.0.0.0', () => {
      console.log(`----------------------------------------`);
      console.log(` Hausmart API server started successfully!`);
      console.log(` Port: ${port}`);
      console.log(` Mode: Network Host`);
      console.log(` URL: http://localhost:${port}`);
      console.log(`----------------------------------------`);
    });
  })
  .catch(err => {
    console.error('Failed to initialize database:', err);
    process.exit(1);
  });
