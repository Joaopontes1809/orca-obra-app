const { Pool } = require('pg');
const { createApp, initDb } = require('./app');

const port = process.env.PORT || 3000;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL && !process.env.DATABASE_URL.includes('localhost')
    ? { rejectUnauthorized: false }
    : false
});

initDb(pool)
  .then(() => {
    createApp(pool).listen(port, () => console.log('Orça Obra a correr na porta ' + port));
  })
  .catch(e => {
    console.error('Erro ao iniciar base de dados', e);
    process.exit(1);
  });
