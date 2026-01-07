import { addMonths } from 'date-fns';
import * as SQLite from 'expo-sqlite';

const db = SQLite.openDatabaseSync('winfocus_finance_v2.db'); // Mudei o nome para forçar criação de novo banco limpo

export const initDB = () => {
  // Tabela de Perfis
  db.execSync(`
    CREATE TABLE IF NOT EXISTS profiles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `);

  const profiles = db.getAllSync('SELECT * FROM profiles');
  if (profiles.length === 0) {
    db.execSync(`INSERT INTO profiles (name, type) VALUES ('Pessoal', 'personal');`);
    db.execSync(`INSERT INTO profiles (name, type) VALUES ('Negócio', 'business');`);
  }

  // Tabela de Transações Atualizada
  // Adicionado: repeat_group_id (para agrupar repetições) e repeat_index (1/12, 2/12...)
  db.execSync(`
    CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      profile_id INTEGER NOT NULL,
      amount REAL NOT NULL,
      type TEXT NOT NULL,
      category TEXT NOT NULL,
      description TEXT,
      date TEXT NOT NULL,
      expected_date TEXT,
      is_paid INTEGER DEFAULT 1,
      repeat_group_id TEXT, 
      repeat_total INTEGER DEFAULT 1,
      repeat_current INTEGER DEFAULT 1,
      attachment_uri TEXT,
      FOREIGN KEY (profile_id) REFERENCES profiles (id)
    );
  `);
};

export const getProfiles = () => db.getAllSync('SELECT * FROM profiles');

export const getTransactions = (profileId, monthStr) => {
  // Se monthStr for passado, filtra. Se null, pega tudo (para gestão)
  if (monthStr) {
    return db.getAllSync(
      `SELECT * FROM transactions WHERE profile_id = ? AND strftime('%Y-%m', date) = ? ORDER BY date DESC`,
      [profileId, monthStr]
    );
  }
  return db.getAllSync(`SELECT * FROM transactions WHERE profile_id = ? ORDER BY date DESC LIMIT 100`, [profileId]);
};

// Buscar grupos de transações recorrentes para a tela de gestão
export const getRecurringGroups = (profileId) => {
  return db.getAllSync(`
    SELECT repeat_group_id, description, category, amount, type, COUNT(*) as count, MIN(date) as start_date 
    FROM transactions 
    WHERE profile_id = ? AND repeat_group_id IS NOT NULL 
    GROUP BY repeat_group_id
  `, [profileId]);
};

export const deleteTransactionGroup = (groupId) => {
  db.runSync(`DELETE FROM transactions WHERE repeat_group_id = ?`, [groupId]);
};

export const deleteTransaction = (id) => {
  db.runSync(`DELETE FROM transactions WHERE id = ?`, [id]);
};

export const getTransactionsByDate = (profileId, dateStr) => {
  return db.getAllSync(
    `SELECT * FROM transactions WHERE profile_id = ? AND date = ?`,
    [profileId, dateStr]
  );
};

export const getDashboardTotals = (profileId, monthStr) => {
  const result = db.getAllSync(
    `SELECT type, SUM(amount) as total FROM transactions WHERE profile_id = ? AND strftime('%Y-%m', date) = ? GROUP BY type`,
    [profileId, monthStr]
  );
  let income = 0, expense = 0;
  result.forEach(row => {
    if (row.type === 'income') income = row.total;
    if (row.type === 'expense') expense = row.total;
  });
  return { income, expense, balance: income - expense };
};

// Nova função de Adicionar com suporte a Repetição
export const addTransaction = (tx) => {
  const { profile_id, amount, type, category, description, date, expected_date, is_paid, repeat_months = 1 } = tx;
  
  const groupId = repeat_months > 1 ? Date.now().toString() : null;
  
  // Converte a string YYYY-MM-DD para objeto Date, garantindo fuso horário local
  // O split resolve problemas de fuso horário que o new Date() direto pode causar
  const [year, month, day] = date.split('-').map(Number);
  const baseDateObj = new Date(year, month - 1, day); 

  for (let i = 0; i < repeat_months; i++) {
    // Usa date-fns para somar meses corretamente (ex: 31/Jan + 1 mês = 28/Fev)
    const nextDateObj = addMonths(baseDateObj, i);
    
    // Formata de volta para YYYY-MM-DD para o SQLite
    const dateStr = nextDateObj.toISOString().split('T')[0];

    // Descrição ex: "Compra (1/3)"
    const desc = repeat_months > 1 ? `${description} (${i + 1}/${repeat_months})` : description;

    db.runSync(
      `INSERT INTO transactions (
        profile_id, amount, type, category, description, date, expected_date, is_paid, 
        repeat_group_id, repeat_total, repeat_current
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        profile_id, amount, type, category, desc, dateStr, dateStr, is_paid || 1,
        groupId, repeat_months, i + 1
      ]
    );
  }
};