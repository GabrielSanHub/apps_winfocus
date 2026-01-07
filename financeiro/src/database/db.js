import * as SQLite from 'expo-sqlite';
import { addMonths } from 'date-fns';

const db = SQLite.openDatabaseSync('winfocus_finance_v5.db'); 

export const initDB = () => {
  // 1. Perfis
  db.execSync(`
    CREATE TABLE IF NOT EXISTS profiles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      settings_share_categories INTEGER DEFAULT 0,
      settings_balance_mode TEXT DEFAULT 'monthly'
    );
  `);

  if (db.getAllSync('SELECT * FROM profiles').length === 0) {
    db.runSync(`INSERT INTO profiles (name, type) VALUES ('Pessoal', 'personal');`);
    db.runSync(`INSERT INTO profiles (name, type) VALUES ('Negócio', 'business');`);
  }

  // 2. Categorias
  db.execSync(`
    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      icon TEXT,
      is_default INTEGER DEFAULT 0,
      profile_id INTEGER, 
      FOREIGN KEY (profile_id) REFERENCES profiles (id)
    );
  `);

  if (db.getAllSync('SELECT * FROM categories').length === 0) {
    const defaults = [
        ['Alimentação', 'expense', 'food'], 
        ['Transporte', 'expense', 'bus'], 
        ['Moradia', 'expense', 'home'], 
        ['Lazer', 'expense', 'party-popper'],
        ['Saúde', 'expense', 'hospital-box'],
        ['Salário', 'income', 'cash'], 
        ['Freelance', 'income', 'laptop'],
        ['Investimentos', 'income', 'chart-line']
    ];
    defaults.forEach(c => {
        db.runSync(`INSERT INTO categories (name, type, icon, is_default, profile_id) VALUES (?, ?, ?, 1, NULL)`, c);
    });
  }

  // 3. Transações
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
      is_fixed INTEGER DEFAULT 0,
      repeat_group_id TEXT, 
      repeat_total INTEGER DEFAULT 1,
      repeat_current INTEGER DEFAULT 1,
      attachment_uri TEXT,
      FOREIGN KEY (profile_id) REFERENCES profiles (id)
    );
  `);
};

// --- GETTERS & SETTERS ---

export const getProfiles = () => db.getAllSync('SELECT * FROM profiles');

export const updateProfileSettings = (id, field, value) => {
    db.runSync(`UPDATE profiles SET ${field} = ? WHERE id = ?`, [value, id]);
};

export const getCategories = (profileId, type, shareCategories) => {
    let query = `SELECT * FROM categories WHERE 1=1`; 
    const params = [];

    if (type) {
        query += ` AND type = ?`;
        params.push(type);
    }

    if (shareCategories === 1) {
        query += ` AND (profile_id = ? OR profile_id IS NULL OR is_default = 1)`;
        params.push(profileId);
    } else {
        query += ` AND (profile_id = ? OR is_default = 1)`;
        params.push(profileId);
    }
    
    query += ` ORDER BY name`;
    return db.getAllSync(query, params);
};

export const addCategory = (name, type, profileId) => {
    db.runSync(`INSERT INTO categories (name, type, icon, is_default, profile_id) VALUES (?, ?, 'tag', 0, ?)`, [name, type, profileId]);
};

export const deleteCategory = (id) => {
    db.runSync(`DELETE FROM categories WHERE id = ? AND is_default = 0`, [id]);
};

// Lógica de Saldo e Fixos

export const processFixedTransactions = (profileId, dateReference) => {
    const monthStr = dateReference.substring(0, 7);
    
    const fixedGroups = db.getAllSync(`SELECT * FROM transactions WHERE profile_id = ? AND is_fixed = 1 GROUP BY repeat_group_id`, [profileId]);

    fixedGroups.forEach(tx => {
        const exists = db.getFirstSync(
            `SELECT id FROM transactions WHERE repeat_group_id = ? AND strftime('%Y-%m', date) = ?`,
            [tx.repeat_group_id, monthStr]
        );

        if (!exists) {
            const [y, m] = monthStr.split('-');
            const originalDay = tx.date.split('-')[2]; 
            const newDate = `${y}-${m}-${originalDay}`;

            db.runSync(`
                INSERT INTO transactions (
                    profile_id, amount, type, category, description, date, expected_date, is_paid, is_fixed, repeat_group_id, repeat_total
                ) VALUES (?, ?, ?, ?, ?, ?, ?, 0, 1, ?, -1)
            `, [profileId, tx.amount, tx.type, tx.category, tx.description, newDate, newDate, tx.repeat_group_id]);
        }
    });
};

export const getDashboardData = (profileId, monthStr, balanceMode) => {
    const today = new Date().toISOString().split('T')[0];
    let balanceQuery = `SELECT type, SUM(amount) as total FROM transactions WHERE profile_id = ?`;
    let balanceParams = [profileId];

    // Saldo considera: Data <= Hoje OU Marcado como Pago
    let whereBalance = ` AND (date <= ? OR is_paid = 1)`; 
    
    if (balanceMode === 'monthly') {
        whereBalance += ` AND strftime('%Y-%m', date) = ?`;
        balanceParams.push(today, monthStr);
    } else {
        balanceParams.push(today);
    }
    
    const balanceResult = db.getAllSync(
        balanceQuery + whereBalance + ` GROUP BY type`,
        balanceParams
    );

    // Cards mostram TUDO do mês (Fluxo de Caixa Previsto)
    const statsResult = db.getAllSync(
        `SELECT type, COUNT(*) as count, SUM(amount) as total 
         FROM transactions 
         WHERE profile_id = ? AND strftime('%Y-%m', date) = ? 
         GROUP BY type`,
        [profileId, monthStr]
    );

    let realizedBalance = 0;
    balanceResult.forEach(r => realizedBalance += (r.type === 'income' ? r.total : -r.total));

    let incomeStats = { count: 0, total: 0 };
    let expenseStats = { count: 0, total: 0 };

    statsResult.forEach(r => {
        if (r.type === 'income') incomeStats = { count: r.count, total: r.total };
        if (r.type === 'expense') expenseStats = { count: r.count, total: r.total };
    });

    return { 
        balance: realizedBalance, 
        income: incomeStats, 
        expense: expenseStats 
    };
};

export const getOverdueTransactions = (profileId) => {
    const today = new Date().toISOString().split('T')[0];
    return db.getAllSync(
        `SELECT * FROM transactions 
         WHERE profile_id = ? AND is_paid = 0 AND type = 'expense' AND date < ?
         ORDER BY date ASC`,
        [profileId, today]
    );
};

export const markAsPaid = (id) => {
    db.runSync(`UPDATE transactions SET is_paid = 1 WHERE id = ?`, [id]);
};

export const getForecastData = (profileId, monthStr) => {
    return db.getAllSync(
        `SELECT type, SUM(amount) as total FROM transactions 
         WHERE profile_id = ? AND strftime('%Y-%m', date) = ? 
         GROUP BY type`,
        [profileId, monthStr]
    );
};

// --- FUNÇÃO CORRIGIDA AQUI ---
export const addTransaction = (tx) => {
  const { profile_id, amount, type, category, description, date, is_paid, repeat_months = 1, is_fixed = 0 } = tx;
  
  const groupId = (repeat_months > 1 || is_fixed) ? Date.now().toString() : null;
  const [year, month, day] = date.split('-').map(Number);
  const baseDateObj = new Date(year, month - 1, day); 

  const loops = is_fixed ? 1 : repeat_months;
  
  // CORREÇÃO: Usamos (is_paid ?? 1). Se is_paid for 0, ele mantém 0. Se for null/undefined, vira 1.
  // Antes estava is_paid || 1, que transformava 0 em 1.
  const statusToSave = (is_paid !== undefined && is_paid !== null) ? is_paid : 1;

  for (let i = 0; i < loops; i++) {
    const nextDateObj = addMonths(baseDateObj, i);
    const dateStr = nextDateObj.toISOString().split('T')[0];
    const desc = (loops > 1 && !is_fixed) ? `${description} (${i + 1}/${loops})` : description;

    db.runSync(
      `INSERT INTO transactions (
        profile_id, amount, type, category, description, date, expected_date, is_paid, 
        is_fixed, repeat_group_id, repeat_total, repeat_current
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        profile_id, amount, type, category, desc, dateStr, dateStr, statusToSave,
        is_fixed, groupId, is_fixed ? -1 : repeat_months, i + 1
      ]
    );
  }
};

// --- CRUD & UTILS ---

export const getTransactionById = (id) => {
    return db.getFirstSync(`SELECT * FROM transactions WHERE id = ?`, [id]);
};

// CORREÇÃO: Agora atualiza também o is_paid durante a edição
export const updateTransaction = (id, tx) => {
    // Adicionado is_paid = ? na query
    const statusToSave = (tx.is_paid !== undefined && tx.is_paid !== null) ? tx.is_paid : 1;
    
    db.runSync(
        `UPDATE transactions SET amount = ?, category = ?, description = ?, date = ?, is_paid = ? WHERE id = ?`,
        [tx.amount, tx.category, tx.description, tx.date, statusToSave, id]
    );
};

export const toggleTransactionStatus = (id, currentStatus) => {
    const newStatus = currentStatus === 1 ? 0 : 1;
    db.runSync(`UPDATE transactions SET is_paid = ? WHERE id = ?`, [newStatus, id]);
    return newStatus;
};

export const getRecurringAndFixedGroups = (profileId) => {
    return db.getAllSync(`
      SELECT repeat_group_id, description, category, amount, type, is_fixed, COUNT(*) as count 
      FROM transactions 
      WHERE profile_id = ? AND repeat_group_id IS NOT NULL 
      GROUP BY repeat_group_id
    `, [profileId]);
};

export const deleteTransactionGroup = (groupId) => {
    db.runSync(`DELETE FROM transactions WHERE repeat_group_id = ? AND is_paid = 0`, [groupId]);
};

export const getTransactions = (profileId, monthStr) => {
    if (monthStr) {
      return db.getAllSync(`SELECT * FROM transactions WHERE profile_id = ? AND strftime('%Y-%m', date) = ? ORDER BY date DESC`, [profileId, monthStr]);
    }
    return db.getAllSync(`SELECT * FROM transactions WHERE profile_id = ? ORDER BY date DESC LIMIT 100`, [profileId]);
};

export const getTransactionsByDate = (profileId, dateStr) => {
    return db.getAllSync(`SELECT * FROM transactions WHERE profile_id = ? AND date = ?`, [profileId, dateStr]);
};

export const getMonthTransactionsByType = (profileId, monthStr, type) => {
    return db.getAllSync(
        `SELECT * FROM transactions WHERE profile_id = ? AND strftime('%Y-%m', date) = ? AND type = ? ORDER BY date`, 
        [profileId, monthStr, type]
    );
};

// Estatísticas e Limpeza
export const getAllTimeTotals = (profileId) => {
    const result = db.getAllSync(
        `SELECT type, SUM(amount) as total FROM transactions 
         WHERE profile_id = ? 
         GROUP BY type`,
        [profileId]
    );
    
    let income = 0;
    let expense = 0;
    
    result.forEach(row => {
        if (row.type === 'income') income = row.total;
        if (row.type === 'expense') expense = row.total;
    });

    return { income, expense, balance: income - expense };
};

export const clearAllProfileTransactions = (profileId) => {
    db.runSync(`DELETE FROM transactions WHERE profile_id = ?`, [profileId]);
};