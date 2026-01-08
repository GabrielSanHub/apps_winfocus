import * as SQLite from 'expo-sqlite';
import * as Crypto from 'expo-crypto';
import { format, subMonths, parseISO, setDate, lastDayOfMonth } from 'date-fns';

const db = SQLite.openDatabaseSync('financeiro.db');

// --- INTERFACES ---
export interface Profile {
  id: number;
  name: string;
  type: string; // 'personal' | 'business'
  settings_share_categories?: number; // 0 ou 1
  settings_balance_mode?: 'total' | 'monthly'; // 'total' = acumulado, 'monthly' = vira o mês zerado
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
  // --- ADICIONE ESTAS LINHAS TEMPORARIAMENTE PARA RESETAR O BANCO ---
  // db.execSync('DROP TABLE IF EXISTS transactions');
  // db.execSync('DROP TABLE IF EXISTS categories');
  // db.execSync('DROP TABLE IF EXISTS profiles');
  // ------------------------------------------------------------------

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
      name TEXT NOT NULL,
      type TEXT DEFAULT 'personal',
      settings_share_categories INTEGER DEFAULT 0,
      settings_balance_mode TEXT DEFAULT 'monthly'
    );
    
    INSERT OR IGNORE INTO profiles (id, name, type) VALUES (1, 'Pessoal', 'personal');

    -- CATEGORIAS PADRÃO (is_default = 1)
    -- Nenhuma (Para onde vão as orfãs)
    INSERT OR IGNORE INTO categories (name, type, icon, is_default, profile_id) 
    SELECT 'Nenhuma', 'both', 'dots-horizontal', 1, 1 WHERE NOT EXISTS (SELECT 1 FROM categories WHERE name = 'Nenhuma');

    -- Receitas Padrão
    INSERT OR IGNORE INTO categories (name, type, icon, is_default, profile_id) 
    SELECT 'Salário', 'income', 'cash', 1, 1 WHERE NOT EXISTS (SELECT 1 FROM categories WHERE name = 'Salário');
    INSERT OR IGNORE INTO categories (name, type, icon, is_default, profile_id) 
    SELECT 'Investimentos', 'income', 'chart-line', 1, 1 WHERE NOT EXISTS (SELECT 1 FROM categories WHERE name = 'Investimentos');

    -- Despesas Padrão
    INSERT OR IGNORE INTO categories (name, type, icon, is_default, profile_id) 
    SELECT 'Alimentação', 'expense', 'food', 1, 1 WHERE NOT EXISTS (SELECT 1 FROM categories WHERE name = 'Alimentação');
    INSERT OR IGNORE INTO categories (name, type, icon, is_default, profile_id) 
    SELECT 'Transporte', 'expense', 'bus', 1, 1 WHERE NOT EXISTS (SELECT 1 FROM categories WHERE name = 'Transporte');
    INSERT OR IGNORE INTO categories (name, type, icon, is_default, profile_id) 
    SELECT 'Moradia', 'expense', 'home', 1, 1 WHERE NOT EXISTS (SELECT 1 FROM categories WHERE name = 'Moradia');
    INSERT OR IGNORE INTO categories (name, type, icon, is_default, profile_id) 
    SELECT 'Lazer', 'expense', 'movie', 1, 1 WHERE NOT EXISTS (SELECT 1 FROM categories WHERE name = 'Lazer');
  `);
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

export const addTransactionDB = addTransaction; // Alias

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

// --- CORREÇÃO 1: SALDO e DASHBOARD ---

export const getDashboardData = (profileId: number, month?: string, mode: 'total' | 'monthly' = 'total'): DashboardDataWithCounts => {
  // 1. Dados do Mês (Para gráficos e listagens do mês)
  const txsMonth = getTransactions(profileId, month);
  
  // 2. Dados para o Saldo (Depende do modo)
  let balanceTxs: Transaction[] = [];
  
  if (mode === 'monthly' && month) {
      // Modo Mensal: Saldo considera apenas o que entrou/saiu NESTE mês
      balanceTxs = txsMonth;
  } else {
      // Modo Total (Padrão): Saldo Acumulado de todo o histórico ATÉ o fim deste mês
      // Se month for fornecido, limita até o fim dele. Se não, pega tudo.
      let query = 'SELECT * FROM transactions WHERE profile_id = ?';
      const params: any[] = [profileId];
      
      if (month) {
          // Pega tudo até o último dia do mês selecionado
          query += ' AND date <= ?';
          const lastDay = `${month}-31`; 
          params.push(lastDay);
      }
      balanceTxs = db.getAllSync<Transaction>(query, params);
  }

  // Funções Auxiliares
  const sumTotal = (list: Transaction[]) => list.reduce((acc, t) => acc + (t.amount || 0), 0);
  const sumPaid = (list: Transaction[]) => list.filter(t => t.is_paid === 1).reduce((acc, t) => acc + (t.amount || 0), 0);

  // Filtros
  const incMonth = txsMonth.filter(t => t.type.toLowerCase() === 'income');
  const expMonth = txsMonth.filter(t => t.type.toLowerCase() === 'expense');

  // Cálculo do Saldo Principal (Baseado na regra do usuário: apenas o que está PAGO/RECEBIDO conta no saldo)
  const incBalance = balanceTxs.filter(t => t.type.toLowerCase() === 'income' && t.is_paid === 1);
  const expBalance = balanceTxs.filter(t => t.type.toLowerCase() === 'expense' && t.is_paid === 1);
  const currentBalance = sumTotal(incBalance) - sumTotal(expBalance);

  return {
    income: {
      total: sumTotal(incMonth),      // Previsto no mês
      received: sumPaid(incMonth),    // Realizado no mês
      pending: sumTotal(incMonth) - sumPaid(incMonth),
      count: incMonth.length
    },
    expense: {
      total: sumTotal(expMonth),      // Previsto no mês
      paid: sumPaid(expMonth),        // Realizado no mês
      pending: sumTotal(expMonth) - sumPaid(expMonth),
      count: expMonth.length
    },
    balance: currentBalance, // Saldo ajustado (apenas realizados)
    counts: { 
        incPaid: incMonth.filter(t => t.is_paid).length, 
        incPend: incMonth.filter(t => !t.is_paid).length, 
        expPaid: expMonth.filter(t => t.is_paid).length, 
        expPend: expMonth.filter(t => !t.is_paid).length 
    }
  };
};

export const getForecastData = (profileId?: number, month?: string) => {
  const data = getDashboardData(profileId || 1, month); // Usa padrão do dash
  return [ { type: 'income', total: data.income.total }, { type: 'expense', total: data.expense.total } ];
};

export const getAllTimeTotals = (profileId: number) => {
  // Para tela de estatísticas "Geral"
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
    
    // 1. Busca TODAS as transações que são FIXAS neste perfil (independente da data)
    // Agrupamos por descrição e valor para identificar a "origem"
const fixedTemplates = db.getAllSync<Transaction>(
        `SELECT * FROM transactions 
         WHERE profile_id = ? 
         AND is_fixed = 1 
         AND strftime('%Y-%m', date) <= ?
         GROUP BY IFNULL(repeat_group_id, description || amount)`, 
        [profileId, targetMonthStr]
    );

fixedTemplates.forEach(template => {
        // Verifica se já existe uma cópia deste fixo no mês alvo
        // A verificação busca por repeat_group_id (se tiver) OU descrição+valor
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
            // Cria a nova data mantendo o dia original
            // Lógica robusta para dias finais (ex: dia 31 em Fev vira dia 28/29)
            const targetDateObj = parseISO(targetDateStr); // Data base do mês alvo
            const originalDay = parseInt(template.date.split('T')[0].slice(-2), 10);
            
            // Tenta setar o dia. Se o mês não tiver o dia (ex: 30 em Fev), o date-fns ajustaria para Março.
            // Então comparamos com o último dia do mês para travar.
            const endOfMonth = lastDayOfMonth(targetDateObj);
            const finalDay = originalDay > endOfMonth.getDate() ? endOfMonth.getDate() : originalDay;
            
            const newDateObj = setDate(targetDateObj, finalDay);
            const newDateStr = format(newDateObj, 'yyyy-MM-dd');

            addTransaction({
                ...template,
                date: newDateStr,
                is_paid: 0, // Recorrência nasce pendente
                client_uuid: Crypto.randomUUID(),
                id: undefined 
            });
            console.log(`Recorrência gerada: ${template.description} para ${newDateStr}`);
        }
    });
};

// --- FUNÇÕES DE SUPORTE ---
export const getOverdueTransactions = (profileId?: number): Transaction[] => {
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    // Busca despesas (EXPENSE) não pagas com data menor que hoje
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

  // Se share for 0, mostra do perfil OU globais. Se for 1, mostra tudo (simplificado)
  if (share !== 1 && profileId) {
      query += ' AND (profile_id = ? OR is_default = 1)';
      params.push(profileId);
  }

  // Se pedir 'income', traz 'income' + 'both'. Se 'expense', traz 'expense' + 'both'.
  if (type) {
      query += ' AND (type = ? OR type = "both")';
      params.push(type);
  }

  return db.getAllSync<Category>(query, params);
};

// Verifica se existe categoria com mesmo nome (Case Insensitive)
export const checkCategoryExists = (name: string, profileId: number): boolean => {
    const result = db.getFirstSync<{count: number}>(
        `SELECT count(*) as count FROM categories 
         WHERE LOWER(name) = LOWER(?) AND (profile_id = ? OR is_default = 1)`,
        [name.trim(), profileId]
    );
    return (result?.count || 0) > 0;
};

export const addCategory = (name: string, type: string, profileId: number) => {
  // Validação deve ser feita antes na UI usando checkCategoryExists, mas garantimos aqui
  db.runSync('INSERT INTO categories (name, type, profile_id, is_default) VALUES (?, ?, ?, 0)', [name.trim(), type, profileId]);
};

// Atualiza Categoria e reflete nas transações (simulando chave estrangeira)
export const updateCategory = (id: number, newName: string, oldName: string) => {
    db.runSync('UPDATE categories SET name = ? WHERE id = ?', [newName.trim(), id]);
    // Atualiza o histórico para manter a integridade visual
    db.runSync('UPDATE transactions SET category = ? WHERE category = ?', [newName.trim(), oldName]);
};

// Conta quantas transações usam esta categoria
export const countTransactionsByCategory = (categoryName: string, profileId: number): number => {
    const res = db.getFirstSync<{count: number}>(
        'SELECT count(*) as count FROM transactions WHERE category = ? AND profile_id = ?',
        [categoryName, profileId]
    );
    return res?.count || 0;
};

// Opção: Apagar Categoria e Transações
export const deleteCategoryAndTransactions = (id: number, categoryName: string, profileId: number) => {
    db.runSync('DELETE FROM transactions WHERE category = ? AND profile_id = ?', [categoryName, profileId]);
    db.runSync('DELETE FROM categories WHERE id = ?', [id]);
};

// Opção: Apagar Categoria e mover transações para "Nenhuma"
export const deleteCategoryAndMoveToNone = (id: number, categoryName: string, profileId: number) => {
    db.runSync("UPDATE transactions SET category = 'Nenhuma' WHERE category = ? AND profile_id = ?", [categoryName, profileId]);
    db.runSync('DELETE FROM categories WHERE id = ?', [id]);
};

// export const deleteCategory = (id: number) => {
//   db.runSync('DELETE FROM categories WHERE id = ?', [id]);
// };

// --- CONFIGURAÇÕES DE PERFIL ---

export const getProfilesDB = (): Profile[] => {
    return db.getAllSync<Profile>('SELECT * FROM profiles');
};

export const updateProfileConfig = (profileId: number, key: string, value: any) => {
    // Validação de segurança simples para evitar SQL Injection nas chaves
    const validKeys = ['settings_share_categories', 'settings_balance_mode', 'type', 'name'];
    if (!validKeys.includes(key)) return;

    db.runSync(`UPDATE profiles SET ${key} = ? WHERE id = ?`, [value, profileId]);
};


export const getRecurringAndFixedGroups = (profileId: number) => {
    // Usamos <any> aqui para permitir que o retorno tenha a propriedade 'count' extra
    // Adicionamos 'COUNT(*) as count' para satisfazer a interface RecurringGroup
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
    // Apaga transações desse grupo que ainda NÃO foram pagas (geralmente as futuras)
    // Se quiser apagar TUDO (inclusive histórico pago), remova o "AND is_paid = 0"
    db.runSync(
        'DELETE FROM transactions WHERE repeat_group_id = ? AND is_paid = 0', 
        [groupId]
    );
};

export const clearAllProfileTransactions = (profileId: number) => {
    db.runSync('DELETE FROM transactions WHERE profile_id = ?', [profileId]);
};

