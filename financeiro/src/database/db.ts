import * as SQLite from 'expo-sqlite';

const db = SQLite.openDatabaseSync('financeiro.db');

export interface Transaction {
  id: number;
  client_uuid: string; // Novo campo
  amount: number;
  date: string;
  description: string;
  type: 'INCOME' | 'EXPENSE';
  category?: string;
  sync_status: 'PENDING' | 'SYNCED'; // Novo campo
}

export const initDB = () => {
  // ATENÇÃO: Para aplicar a nova estrutura, talvez precise reinstalar o app ou limpar dados
  // pois estamos mudando a estrutura da tabela.
  db.execSync(`
    CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_uuid TEXT NOT NULL UNIQUE,
      amount REAL NOT NULL,
      date TEXT NOT NULL,
      description TEXT NOT NULL,
      type TEXT NOT NULL,
      category TEXT,
      sync_status TEXT DEFAULT 'PENDING'
    );
  `);
};

export const addTransactionDB = (tx: Omit<Transaction, 'id' | 'sync_status'>) => {
  const result = db.runSync(
    `INSERT INTO transactions (client_uuid, amount, date, description, type, category, sync_status) VALUES (?, ?, ?, ?, ?, ?, 'PENDING')`,
    [tx.client_uuid, tx.amount, tx.date, tx.description, tx.type, tx.category || '']
  );
  return result.lastInsertRowId;
};

export const getTransactionsDB = (): Transaction[] => {
  return db.getAllSync<Transaction>('SELECT * FROM transactions ORDER BY date DESC');
};

// Nova função para pegar o que precisa subir pra nuvem
export const getPendingTransactionsDB = (): Transaction[] => {
  return db.getAllSync<Transaction>("SELECT * FROM transactions WHERE sync_status = 'PENDING'");
};

// Nova função para marcar como 'SYNCED' após sucesso
export const markAsSyncedDB = (client_uuids: string[]) => {
  if (client_uuids.length === 0) return;
  
  const placeholders = client_uuids.map(() => '?').join(',');
  db.runSync(
    `UPDATE transactions SET sync_status = 'SYNCED' WHERE client_uuid IN (${placeholders})`,
    client_uuids
  );
};