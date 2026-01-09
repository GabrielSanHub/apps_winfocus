import * as SQLite from 'expo-sqlite';
import * as Crypto from 'expo-crypto';
import { format, subMonths, parseISO, setDate, lastDayOfMonth } from 'date-fns';

const db = SQLite.openDatabaseSync('financeiro.db');

// --- INTERFACES ---

export interface User {
  id: number;
  name: string;
  email: string;
  password_hash?: string; // Armazenado localmente para login offline
  server_id?: number; // ID no MySQL
  sync_preference: 'cloud' | 'local' | 'ask';
}

export interface Profile {
  id: number;
  name: string;
  type: string; 
  settings_share_categories?: number;
  settings_balance_mode?: 'total' | 'monthly';
  email?: string;
}

export interface Transaction {
  id: number;
  client_uuid: string;
  profile_id?: number;
  amount: number;
  date: string;
  description: string;
  type: 'INCOME' | 'EXPENSE' | 'income' | 'expense';
  category?: string;
  sync_status: 'PENDING' | 'SYNCED';
  is_paid?: number;
  is_fixed?: number;
  repeat_group_id?: string;
}

export interface Category {
  id: number;
  name: string;
  icon?: string;
  type: 'income' | 'expense' | 'both';
  is_default?: number;
}

export interface DashboardDataWithCounts {
  income: { total: number; received: number; pending: number; count: number };
  expense: { total: number; paid: number; pending: number; count: number };
  balance: number;
  counts?: { incPaid: number; incPend: number; expPaid: number; expPend: number };
}

// --- INICIALIZAÇÃO ---

export const initDB = () => {

  // Tabela de Usuários
  db.execSync(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      server_id INTEGER,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      sync_preference TEXT DEFAULT 'ask' -- 'cloud', 'local', 'ask'
    );
  `);

  db.execSync(`
    CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_uuid TEXT NOT NULL UNIQUE,
      profile_id INTEGER DEFAULT 1,
      amount REAL NOT NULL,
      date TEXT NOT NULL,
      description TEXT NOT NULL,
      type TEXT NOT NULL,
      category TEXT,
      sync_status TEXT DEFAULT 'PENDING',
      is_paid INTEGER DEFAULT 0,
      is_fixed INTEGER DEFAULT 0,
      repeat_group_id TEXT
    );

    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      profile_id INTEGER DEFAULT 1,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      icon TEXT,
      is_default INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS profiles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER, 
      name TEXT NOT NULL,
      type TEXT DEFAULT 'personal',
      settings_share_categories INTEGER DEFAULT 0,
      settings_balance_mode TEXT DEFAULT 'monthly',
      FOREIGN KEY(user_id) REFERENCES users(id)
    );
    
    INSERT OR IGNORE INTO profiles (id, name, type) VALUES (1, 'Pessoal', 'personal');

    -- CATEGORIAS PADRÃO
    INSERT OR IGNORE INTO categories (name, type, icon, is_default, profile_id) 
    SELECT 'Nenhuma', 'both', 'dots-horizontal', 1, 1 WHERE NOT EXISTS (SELECT 1 FROM categories WHERE name = 'Nenhuma');
    INSERT OR IGNORE INTO categories (name, type, icon, is_default, profile_id) 
    SELECT 'Salário', 'income', 'cash', 1, 1 WHERE NOT EXISTS (SELECT 1 FROM categories WHERE name = 'Salário');
    INSERT OR IGNORE INTO categories (name, type, icon, is_default, profile_id) 
    SELECT 'Investimentos', 'income', 'chart-line', 1, 1 WHERE NOT EXISTS (SELECT 1 FROM categories WHERE name = 'Investimentos');
    INSERT OR IGNORE INTO categories (name, type, icon, is_default, profile_id) 
    SELECT 'Alimentação', 'expense', 'food', 1, 1 WHERE NOT EXISTS (SELECT 1 FROM categories WHERE name = 'Alimentação');
    INSERT OR IGNORE INTO categories (name, type, icon, is_default, profile_id) 
    SELECT 'Transporte', 'expense', 'bus', 1, 1 WHERE NOT EXISTS (SELECT 1 FROM categories WHERE name = 'Transporte');
    INSERT OR IGNORE INTO categories (name, type, icon, is_default, profile_id) 
    SELECT 'Moradia', 'expense', 'home', 1, 1 WHERE NOT EXISTS (SELECT 1 FROM categories WHERE name = 'Moradia');
    INSERT OR IGNORE INTO categories (name, type, icon, is_default, profile_id) 
    SELECT 'Lazer', 'expense', 'movie', 1, 1 WHERE NOT EXISTS (SELECT 1 FROM categories WHERE name = 'Lazer');
  `);
  try {
      db.execSync("ALTER TABLE profiles ADD COLUMN user_id INTEGER;");
    } catch (e) { /* Coluna já existe */ }
  };

// --- AUTH LOCAL (SQLite) ---

export const registerUserLocal = (name: string, email: string, hash: string, serverId?: number) => {
  try {
    // 1. Verifica se o usuário já existe pelo e-mail
    const existingUser = getUserByEmail(email);

    if (existingUser) {
      // 2. Se existe, ATUALIZA os dados em vez de inserir
      let query = 'UPDATE users SET name = ?, password_hash = ?';
      const params: any[] = [name, hash];
      
      // Se veio um ID do servidor (login online), atualiza também
      if (serverId) {
        query += ', server_id = ?';
        params.push(serverId);
      }
      
      query += ' WHERE id = ?';
      params.push(existingUser.id);
      
      db.runSync(query, params);
      
      // Retorna o usuário atualizado
      return getUserByEmail(email);
    } else {
      // 3. Se NÃO existe, insere um novo (código original)
      db.runSync(
        `INSERT INTO users (name, email, password_hash, server_id, sync_preference) 
         VALUES (?, ?, ?, ?, 'ask')`,
        [name, email, hash, serverId || null]
      );
      return getUserByEmail(email);
    }
  } catch (e) {
    console.error("Erro ao registrar localmente", e);
    throw e;
  }
};

export const loginUserLocal = (email: string, hash: string): User | null => {
  return db.getFirstSync<User>(
    'SELECT * FROM users WHERE email = ? AND password_hash = ?',
    [email, hash]
  );
};

export const getUserByEmail = (email: string): User | null => {
  return db.getFirstSync<User>('SELECT * FROM users WHERE email = ?', [email]);
};

export const updateUserSyncPref = (
  userId: number, 
  pref: 'cloud' | 'local' | 'ask', 
  serverId?: number
) => {
  let query = 'UPDATE users SET sync_preference = ?';
  const params: any[] = [pref];
  
  if (serverId) {
    query += ', server_id = ?';
    params.push(serverId);
  }
  
  query += ' WHERE id = ?';
  params.push(userId);
  
  db.runSync(query, params);
};

// --- SYNC ---
export const getPendingTransactionsDB = (): Transaction[] => {
  return db.getAllSync<Transaction>("SELECT * FROM transactions WHERE sync_status = 'PENDING'");
};

export const markAsSyncedDB = (client_uuids: string[]) => {
  if (client_uuids.length === 0) return;
  const placeholders = client_uuids.map(() => '?').join(',');
  db.runSync(`UPDATE transactions SET sync_status = 'SYNCED' WHERE client_uuid IN (${placeholders})`, client_uuids);
};

// --- CRUD TRANSAÇÕES ---
export const addTransaction = (tx: Partial<Transaction>) => {
  const uuid = tx.client_uuid || Crypto.randomUUID();
  db.runSync(
    `INSERT INTO transactions (client_uuid, profile_id, amount, date, description, type, category, sync_status, is_paid, is_fixed, repeat_group_id) 
     VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDING', ?, ?, ?)`,
    [
      uuid, tx.profile_id || 1, tx.amount || 0, tx.date || new Date().toISOString(), 
      tx.description || '', tx.type || 'expense', tx.category || 'Geral', 
      tx.is_paid || 0, tx.is_fixed || 0, tx.repeat_group_id || null
    ]
  );
};

export const addTransactionDB = addTransaction; 

export const updateTransaction = (id: string | number, tx: Partial<Transaction>) => {
  db.runSync(
    `UPDATE transactions SET 
      amount = COALESCE(?, amount), description = COALESCE(?, description), date = COALESCE(?, date),
      type = COALESCE(?, type), category = COALESCE(?, category), is_paid = COALESCE(?, is_paid), sync_status = 'PENDING'
     WHERE id = ?`,
    [tx.amount ?? null, tx.description ?? null, tx.date ?? null, tx.type ?? null, tx.category ?? null, tx.is_paid ?? null, id]
  );
};

export const getTransactionById = (id: string | number): Transaction | null => {
  return db.getFirstSync<Transaction>('SELECT * FROM transactions WHERE id = ?', [id]);
};

// --- DASHBOARD E LISTAGENS ---
export const getTransactions = (profileId?: number, month?: string): Transaction[] => {
  let query = 'SELECT * FROM transactions WHERE 1=1';
  const params: any[] = [];
  
  if (profileId) {
      query += ' AND profile_id = ?';
      params.push(profileId);
  }

  if (month) {
    query += ' AND strftime("%Y-%m", date) = ?';
    params.push(month);
  }
  query += ' ORDER BY date DESC';
  return db.getAllSync<Transaction>(query, params);
};

export const getTransactionsDB = (profileId?: number, month?: string) => getTransactions(profileId, month);

export const getTransactionsByDate = (profileId: number, date: string): Transaction[] => {
  return db.getAllSync<Transaction>(
    'SELECT * FROM transactions WHERE date LIKE ? ORDER BY id DESC', 
    [`${date}%`]
  );
};

export const getMonthTransactionsByType = (profileId: number, month: string, type: string): Transaction[] => {
  return db.getAllSync<Transaction>(
    'SELECT * FROM transactions WHERE strftime("%Y-%m", date) = ? AND type = ?',
    [month, type]
  );
};

export const getDashboardData = (profileId: number, month?: string, mode: 'total' | 'monthly' = 'total'): DashboardDataWithCounts => {
  const txsMonth = getTransactions(profileId, month);
  let balanceTxs: Transaction[] = [];
  
  if (mode === 'monthly' && month) {
      balanceTxs = txsMonth;
  } else {
      let query = 'SELECT * FROM transactions WHERE profile_id = ?';
      const params: any[] = [profileId];
      if (month) {
          query += ' AND date <= ?';
          const lastDay = `${month}-31`; 
          params.push(lastDay);
      }
      balanceTxs = db.getAllSync<Transaction>(query, params);
  }

  const sumTotal = (list: Transaction[]) => list.reduce((acc, t) => acc + (t.amount || 0), 0);
  const sumPaid = (list: Transaction[]) => list.filter(t => t.is_paid === 1).reduce((acc, t) => acc + (t.amount || 0), 0);

  const incMonth = txsMonth.filter(t => t.type.toLowerCase() === 'income');
  const expMonth = txsMonth.filter(t => t.type.toLowerCase() === 'expense');

  const incBalance = balanceTxs.filter(t => t.type.toLowerCase() === 'income' && t.is_paid === 1);
  const expBalance = balanceTxs.filter(t => t.type.toLowerCase() === 'expense' && t.is_paid === 1);
  const currentBalance = sumTotal(incBalance) - sumTotal(expBalance);

  return {
    income: {
      total: sumTotal(incMonth),
      received: sumPaid(incMonth),
      pending: sumTotal(incMonth) - sumPaid(incMonth),
      count: incMonth.length
    },
    expense: {
      total: sumTotal(expMonth),
      paid: sumPaid(expMonth),
      pending: sumTotal(expMonth) - sumPaid(expMonth),
      count: expMonth.length
    },
    balance: currentBalance,
    counts: { 
        incPaid: incMonth.filter(t => t.is_paid).length, 
        incPend: incMonth.filter(t => !t.is_paid).length, 
        expPaid: expMonth.filter(t => t.is_paid).length, 
        expPend: expMonth.filter(t => !t.is_paid).length 
    }
  };
};

export const getForecastData = (profileId?: number, month?: string) => {
  const data = getDashboardData(profileId || 1, month);
  return [ { type: 'income', total: data.income.total }, { type: 'expense', total: data.expense.total } ];
};

export const getAllTimeTotals = (profileId: number) => {
  const allTxs = db.getAllSync<Transaction>('SELECT * FROM transactions WHERE profile_id = ?', [profileId]);
  const inc = allTxs.filter(t => t.type.toLowerCase() === 'income' && t.is_paid === 1);
  const exp = allTxs.filter(t => t.type.toLowerCase() === 'expense' && t.is_paid === 1);
  const totalInc = inc.reduce((acc, t) => acc + t.amount, 0);
  const totalExp = exp.reduce((acc, t) => acc + t.amount, 0);
  return { income: totalInc, expense: totalExp, balance: totalInc - totalExp };
};

// --- RECORRÊNCIA E CALENDÁRIO ---
export const processFixedTransactions = (profileId: number, targetDateStr: string) => {
    const targetMonthStr = targetDateStr.substring(0, 7); // YYYY-MM
    
    // Busca TODAS as transações que são FIXAS
    const fixedTemplates = db.getAllSync<Transaction>(
        `SELECT * FROM transactions 
         WHERE profile_id = ? 
         AND is_fixed = 1 
         AND strftime('%Y-%m', date) <= ?
         GROUP BY IFNULL(repeat_group_id, description || amount)`, 
        [profileId, targetMonthStr]
    );

    fixedTemplates.forEach(template => {
        let queryExists = `SELECT id FROM transactions WHERE profile_id = ? AND strftime('%Y-%m', date) = ?`;
        let paramsExists: any[] = [profileId, targetMonthStr];

        if (template.repeat_group_id) {
            queryExists += ` AND repeat_group_id = ?`;
            paramsExists.push(template.repeat_group_id);
        } else {
            queryExists += ` AND description = ? AND amount = ?`;
            paramsExists.push(template.description, template.amount);
        }

        const existsInTarget = db.getFirstSync(queryExists, paramsExists);

        if (!existsInTarget) {
            const targetDateObj = parseISO(targetDateStr);
            const originalDay = parseInt(template.date.split('T')[0].slice(-2), 10);
            const endOfMonth = lastDayOfMonth(targetDateObj);
            const finalDay = originalDay > endOfMonth.getDate() ? endOfMonth.getDate() : originalDay;
            
            const newDateObj = setDate(targetDateObj, finalDay);
            const newDateStr = format(newDateObj, 'yyyy-MM-dd');

            addTransaction({
                ...template,
                date: newDateStr,
                is_paid: 0, 
                client_uuid: Crypto.randomUUID(),
                id: undefined 
            });
            console.log(`Recorrência gerada: ${template.description} para ${newDateStr}`);
        }
    });
};

// --- FUNÇÕES DE SUPORTE ---
export const getOverdueTransactions = (profileId?: number): Transaction[] => {
    const today = new Date().toISOString().split('T')[0];
    return db.getAllSync<Transaction>(
        `SELECT * FROM transactions 
         WHERE profile_id = ? 
         AND (type = 'expense' OR type = 'EXPENSE') 
         AND is_paid = 0 
         AND date < ? 
         ORDER BY date ASC`,
        [profileId || 1, today]
    );
};

export const markAsPaid = (id: number) => {
  db.runSync('UPDATE transactions SET is_paid = 1, sync_status = "PENDING" WHERE id = ?', [id]);
};
export const toggleTransactionStatus = (id: number, currentStatus?: number) => {
  const newStatus = currentStatus === 1 ? 0 : 1;
  db.runSync('UPDATE transactions SET is_paid = ?, sync_status = "PENDING" WHERE id = ?', [newStatus, id]);
};

// --- CATEGORIAS ---
export const getCategories = (profileId?: number, type?: string, share?: number): Category[] => {
  let query = 'SELECT * FROM categories WHERE 1=1';
  const params: any[] = [];
  if (share !== 1 && profileId) {
      query += ' AND (profile_id = ? OR is_default = 1)';
      params.push(profileId);
  }
  if (type) {
      query += ' AND (type = ? OR type = "both")';
      params.push(type);
  }
  return db.getAllSync<Category>(query, params);
};

export const checkCategoryExists = (name: string, profileId: number): boolean => {
    const result = db.getFirstSync<{count: number}>(
        `SELECT count(*) as count FROM categories 
         WHERE LOWER(name) = LOWER(?) AND (profile_id = ? OR is_default = 1)`,
        [name.trim(), profileId]
    );
    return (result?.count || 0) > 0;
};

export const addCategory = (name: string, type: string, profileId: number) => {
  db.runSync('INSERT INTO categories (name, type, profile_id, is_default) VALUES (?, ?, ?, 0)', [name.trim(), type, profileId]);
};

export const updateCategory = (id: number, newName: string, oldName: string) => {
    db.runSync('UPDATE categories SET name = ? WHERE id = ?', [newName.trim(), id]);
    db.runSync('UPDATE transactions SET category = ? WHERE category = ?', [newName.trim(), oldName]);
};

export const countTransactionsByCategory = (categoryName: string, profileId: number): number => {
    const res = db.getFirstSync<{count: number}>(
        'SELECT count(*) as count FROM transactions WHERE category = ? AND profile_id = ?',
        [categoryName, profileId]
    );
    return res?.count || 0;
};

export const deleteCategoryAndTransactions = (id: number, categoryName: string, profileId: number) => {
    db.runSync('DELETE FROM transactions WHERE category = ? AND profile_id = ?', [categoryName, profileId]);
    db.runSync('DELETE FROM categories WHERE id = ?', [id]);
};

export const deleteCategoryAndMoveToNone = (id: number, categoryName: string, profileId: number) => {
    db.runSync("UPDATE transactions SET category = 'Nenhuma' WHERE category = ? AND profile_id = ?", [categoryName, profileId]);
    db.runSync('DELETE FROM categories WHERE id = ?', [id]);
};

// --- CONFIGURAÇÕES DE PERFIL ---
export const getProfilesDB = (): Profile[] => {
    return db.getAllSync<Profile>('SELECT * FROM profiles');
};

export const updateProfileConfig = (profileId: number, key: string, value: any) => {
    const validKeys = ['settings_share_categories', 'settings_balance_mode', 'type', 'name'];
    if (!validKeys.includes(key)) return;
    db.runSync(`UPDATE profiles SET ${key} = ? WHERE id = ?`, [value, profileId]);
};

export const getRecurringAndFixedGroups = (profileId: number) => {
    // Retorna lista agrupada. Se repeat_group_id for null, agrupa por descrição.
    return db.getAllSync<any>(
        `SELECT *, COUNT(*) as count FROM transactions 
         WHERE profile_id = ? 
         AND (is_fixed = 1 OR repeat_group_id IS NOT NULL)
         AND is_paid = 0 
         GROUP BY IFNULL(repeat_group_id, description)`, 
        [profileId]
    );
};

export const deleteTransactionGroup = (groupId: string) => {
    // Apaga pelo ID do grupo (para transações novas e corretas)
    db.runSync(
        'DELETE FROM transactions WHERE repeat_group_id = ? AND is_paid = 0', 
        [groupId]
    );
};

// --- CORREÇÃO: Função Legacy para apagar transações sem ID (bug antigo) ---
export const deleteTransactionGroupLegacy = (description: string, amount: number, profileId: number) => {
    db.runSync(
        'DELETE FROM transactions WHERE description = ? AND amount = ? AND profile_id = ? AND is_paid = 0 AND repeat_group_id IS NULL', 
        [description, amount, profileId]
    );
};
// -------------------------------------------------------------------------

export const clearAllProfileTransactions = (profileId: number) => {
    db.runSync('DELETE FROM transactions WHERE profile_id = ?', [profileId]);
};