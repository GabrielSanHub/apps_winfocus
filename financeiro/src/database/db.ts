import * as SQLite from 'expo-sqlite';
import { addMonths } from 'date-fns';

// --- Interfaces de Tipagem ---

export interface Profile {
  id: number;
  name: string;
  type: 'personal' | 'business';
  settings_share_categories: number; // 0 ou 1
  settings_balance_mode: 'monthly' | 'total'; // Exemplo
}

export interface Category {
  id: number;
  name: string;
  type: 'income' | 'expense';
  icon?: string;
  is_default: number;
  profile_id?: number | null;
}

export interface Transaction {
  id?: number;
  profile_id: number;
  amount: number;
  type: 'income' | 'expense';
  category: string;
  description?: string;
  date: string; // YYYY-MM-DD
  expected_date?: string;
  is_paid: number; // 0 | 1
  is_fixed: number; // 0 | 1
  repeat_group_id?: string | null;
  repeat_total?: number;
  repeat_current?: number;
  attachment_uri?: string;
  // Campos auxiliares para criação
  repeat_months?: number;
}

export interface DashboardData {
  balance: number;
  income: { total: number; received: number; pending: number; count: number };
  expense: { total: number; paid: number; pending: number; count: number };
}

export interface DashboardDataWithCounts extends DashboardData {
    counts?: {
        incPaid: number;
        incPend: number;
        expPaid: number;
        expPend: number;
    }
}

// --- Inicialização do Banco ---

const db = SQLite.openDatabaseSync('winfocus_finance_v5.db'); 

export const initDB = (): void => {
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
        // TypeScript pode reclamar do array misto, forçamos a tipagem no bind
        db.runSync(`INSERT INTO categories (name, type, icon, is_default, profile_id) VALUES (?, ?, ?, 1, NULL)`, c as any[]);
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

export const getProfiles = (): Profile[] => {
    return db.getAllSync('SELECT * FROM profiles') as Profile[];
};

export const updateProfileSettings = (id: number, field: string, value: any): void => {
    db.runSync(`UPDATE profiles SET ${field} = ? WHERE id = ?`, [value, id]);
};

export const getCategories = (profileId: number, type?: string, shareCategories?: number): Category[] => {
    let query = `SELECT * FROM categories WHERE 1=1`; 
    const params: any[] = [];

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
    return db.getAllSync(query, params) as Category[];
};

export const addCategory = (name: string, type: string, profileId: number): void => {
    db.runSync(`INSERT INTO categories (name, type, icon, is_default, profile_id) VALUES (?, ?, 'tag', 0, ?)`, [name, type, profileId]);
};

export const deleteCategory = (id: number): void => {
    db.runSync(`DELETE FROM categories WHERE id = ? AND is_default = 0`, [id]);
};

// Lógica de Saldo e Fixos

export const processFixedTransactions = (profileId: number, dateReference: string): void => {
    const monthStr = dateReference.substring(0, 7);
    
    const fixedGroups = db.getAllSync(
        `SELECT * FROM transactions WHERE profile_id = ? AND is_fixed = 1 GROUP BY repeat_group_id`, 
        [profileId]
    ) as Transaction[];

    fixedGroups.forEach(tx => {
        // Assegura que repeat_group_id existe
        if (!tx.repeat_group_id) return;

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
            `, [profileId, tx.amount, tx.type, tx.category, tx.description || '', newDate, newDate, tx.repeat_group_id]);
        }
    });
};

export const getDashboardData = (profileId: number, monthStr: string, balanceMode: string): DashboardData => {
    const today = new Date().toISOString().split('T')[0];
    
    // 1. CÁLCULO DO SALDO
    let balanceQuery = `SELECT type, SUM(amount) as total FROM transactions WHERE profile_id = ?`;
    let balanceParams: any[] = [profileId];
    
    let whereBalance = ` AND (date <= ? OR is_paid = 1)`; 
    
    if (balanceMode === 'monthly') {
        whereBalance += ` AND strftime('%Y-%m', date) = ?`;
        balanceParams.push(today, monthStr);
    } else {
        balanceParams.push(today);
    }
    
    const balanceResult = db.getAllSync(balanceQuery + whereBalance + ` GROUP BY type`, balanceParams) as {type: string, total: number}[];
    let realizedBalance = 0;
    balanceResult.forEach(r => realizedBalance += (r.type === 'income' ? r.total : -r.total));

    // 2. DETALHAMENTO DO MÊS
    const breakdown = db.getAllSync(
        `SELECT type, is_paid, SUM(amount) as total, COUNT(*) as count
         FROM transactions 
         WHERE profile_id = ? AND strftime('%Y-%m', date) = ? 
         GROUP BY type, is_paid`,
        [profileId, monthStr]
    ) as { type: string; is_paid: number; total: number; count: number }[];

    let income = { total: 0, received: 0, pending: 0, count: 0 };
    let expense = { total: 0, paid: 0, pending: 0, count: 0 };

    breakdown.forEach(row => {
        const val = row.total || 0;
        const qtd = row.count || 0;

        if (row.type === 'income') {
            income.total += val;
            income.count += qtd;
            if (row.is_paid === 1) income.received += val;
            else income.pending += val;
        } else if (row.type === 'expense') {
            expense.total += val;
            expense.count += qtd;
            if (row.is_paid === 1) expense.paid += val;
            else expense.pending += val;
        }
    });

    return { balance: realizedBalance, income, expense };
};

export const getOverdueTransactions = (profileId: number): Transaction[] => {
    const today = new Date().toISOString().split('T')[0];
    return db.getAllSync(
        `SELECT * FROM transactions 
         WHERE profile_id = ? AND is_paid = 0 AND type = 'expense' AND date < ?
         ORDER BY date ASC`,
        [profileId, today]
    ) as Transaction[];
};

export const markAsPaid = (id: number): void => {
    db.runSync(`UPDATE transactions SET is_paid = 1 WHERE id = ?`, [id]);
};

export const getForecastData = (profileId: number, monthStr: string): { type: string, total: number }[] => {
    return db.getAllSync(
        `SELECT type, SUM(amount) as total FROM transactions 
         WHERE profile_id = ? AND strftime('%Y-%m', date) = ? 
         GROUP BY type`,
        [profileId, monthStr]
    ) as { type: string, total: number }[];
};

export const addTransaction = (tx: Transaction): void => {
  const { profile_id, amount, type, category, description, date, is_paid, repeat_months = 1, is_fixed = 0 } = tx;
  
  const groupId = (repeat_months > 1 || is_fixed) ? Date.now().toString() : null;
  const [year, month, day] = date.split('-').map(Number);
  const baseDateObj = new Date(year, month - 1, day); 

  const loops = is_fixed ? 1 : repeat_months;
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
        profile_id, amount, type, category, desc || '', dateStr, dateStr, statusToSave,
        is_fixed, groupId, is_fixed ? -1 : repeat_months, i + 1
      ]
    );
  }
};

// --- CRUD & UTILS ---

export const getTransactionById = (id: string | number): Transaction | null => {
    return db.getFirstSync(`SELECT * FROM transactions WHERE id = ?`, [id]) as Transaction | null;
};

export const updateTransaction = (id: string | number, tx: Partial<Transaction>): void => {
    const statusToSave = (tx.is_paid !== undefined && tx.is_paid !== null) ? tx.is_paid : 1;
    
    db.runSync(
        `UPDATE transactions SET amount = ?, category = ?, description = ?, date = ?, is_paid = ? WHERE id = ?`,
        [tx.amount || 0, tx.category || '', tx.description || '', tx.date || '', statusToSave, id]
    );
};

export const toggleTransactionStatus = (id: number, currentStatus: number): number => {
    const newStatus = currentStatus === 1 ? 0 : 1;
    db.runSync(`UPDATE transactions SET is_paid = ? WHERE id = ?`, [newStatus, id]);
    return newStatus;
};

export const getRecurringAndFixedGroups = (profileId: number): any[] => {
    return db.getAllSync(`
      SELECT repeat_group_id, description, category, amount, type, is_fixed, COUNT(*) as count 
      FROM transactions 
      WHERE profile_id = ? AND repeat_group_id IS NOT NULL 
      GROUP BY repeat_group_id
    `, [profileId]);
};

export const deleteTransactionGroup = (groupId: string): void => {
    db.runSync(`DELETE FROM transactions WHERE repeat_group_id = ? AND is_paid = 0`, [groupId]);
};

export const getTransactions = (profileId: number, monthStr?: string): Transaction[] => {
    if (monthStr) {
      return db.getAllSync(`SELECT * FROM transactions WHERE profile_id = ? AND strftime('%Y-%m', date) = ? ORDER BY date DESC`, [profileId, monthStr]) as Transaction[];
    }
    return db.getAllSync(`SELECT * FROM transactions WHERE profile_id = ? ORDER BY date DESC LIMIT 100`, [profileId]) as Transaction[];
};

export const getTransactionsByDate = (profileId: number, dateStr: string): Transaction[] => {
    return db.getAllSync(`SELECT * FROM transactions WHERE profile_id = ? AND date = ?`, [profileId, dateStr]) as Transaction[];
};

export const getMonthTransactionsByType = (profileId: number, monthStr: string, type: string): Transaction[] => {
    return db.getAllSync(
        `SELECT * FROM transactions WHERE profile_id = ? AND strftime('%Y-%m', date) = ? AND type = ? ORDER BY date`, 
        [profileId, monthStr, type]
    ) as Transaction[];
};

export const getAllTimeTotals = (profileId: number): { income: number, expense: number, balance: number } => {
    const result = db.getAllSync(
        `SELECT type, SUM(amount) as total FROM transactions 
         WHERE profile_id = ? 
         GROUP BY type`,
        [profileId]
    ) as { type: string, total: number }[];
    
    let income = 0;
    let expense = 0;
    
    result.forEach(row => {
        if (row.type === 'income') income = row.total;
        if (row.type === 'expense') expense = row.total;
    });

    return { income, expense, balance: income - expense };
};

export const clearAllProfileTransactions = (profileId: number): void => {
    db.runSync(`DELETE FROM transactions WHERE profile_id = ?`, [profileId]);
};