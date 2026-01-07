import { addMonths } from 'date-fns';
import * as SQLite from 'expo-sqlite';

const db = SQLite.openDatabaseSync('winfocus_finance_v3.db'); // v3 para garantir atualização

export const initDB = () => {
  // 1. Tabela de Perfis
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

  // 2. Tabela de Categorias (NOVO)
  db.execSync(`
    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      type TEXT NOT NULL, -- 'income' ou 'expense'
      icon TEXT,
      is_default INTEGER DEFAULT 0
    );
  `);

  // Popular categorias iniciais se estiver vazio
  const categories = db.getAllSync('SELECT * FROM categories');
  if (categories.length === 0) {
    // Despesas
    db.execSync(`INSERT INTO categories (name, type, icon, is_default) VALUES ('Alimentação', 'expense', 'food', 1);`);
    db.execSync(`INSERT INTO categories (name, type, icon, is_default) VALUES ('Transporte', 'expense', 'bus', 1);`);
    db.execSync(`INSERT INTO categories (name, type, icon, is_default) VALUES ('Moradia', 'expense', 'home', 1);`);
    db.execSync(`INSERT INTO categories (name, type, icon, is_default) VALUES ('Lazer', 'expense', 'party-popper', 1);`);
    db.execSync(`INSERT INTO categories (name, type, icon, is_default) VALUES ('Saúde', 'expense', 'hospital-box', 1);`);
    // Receitas
    db.execSync(`INSERT INTO categories (name, type, icon, is_default) VALUES ('Salário', 'income', 'cash', 1);`);
    db.execSync(`INSERT INTO categories (name, type, icon, is_default) VALUES ('Freelance', 'income', 'laptop', 1);`);
    db.execSync(`INSERT INTO categories (name, type, icon, is_default) VALUES ('Investimentos', 'income', 'chart-line', 1);`);
  }

  // 3. Tabela de Transações
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

// --- Funções Auxiliares ---

export const getProfiles = () => db.getAllSync('SELECT * FROM profiles');

// Nova função de Categorias
export const getCategories = (type) => { // type opcional ('income' ou 'expense')
    if (type) {
        return db.getAllSync('SELECT * FROM categories WHERE type = ? ORDER BY name', [type]);
    }
    return db.getAllSync('SELECT * FROM categories ORDER BY name');
};

export const addCategory = (name, type) => {
    db.runSync(`INSERT INTO categories (name, type, icon, is_default) VALUES (?, ?, 'tag', 0)`, [name, type]);
};

export const deleteCategory = (id) => {
    db.runSync(`DELETE FROM categories WHERE id = ? AND is_default = 0`, [id]);
};

export const getTransactions = (profileId, monthStr) => {
  if (monthStr) {
    return db.getAllSync(
      `SELECT * FROM transactions WHERE profile_id = ? AND strftime('%Y-%m', date) = ? ORDER BY date DESC`,
      [profileId, monthStr]
    );
  }
  return db.getAllSync(`SELECT * FROM transactions WHERE profile_id = ? ORDER BY date DESC LIMIT 100`, [profileId]);
};

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

export const addTransaction = (tx) => {
  const { profile_id, amount, type, category, description, date, expected_date, is_paid, repeat_months = 1 } = tx;
  
  const groupId = repeat_months > 1 ? Date.now().toString() : null;
  const [year, month, day] = date.split('-').map(Number);
  const baseDateObj = new Date(year, month - 1, day); 

  for (let i = 0; i < repeat_months; i++) {
    const nextDateObj = addMonths(baseDateObj, i);
    const dateStr = nextDateObj.toISOString().split('T')[0];
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