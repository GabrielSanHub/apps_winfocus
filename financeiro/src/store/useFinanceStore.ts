import { create } from 'zustand';
import { 
  addTransactionDB, 
  getTransactionsDB, 
  initDB, 
  Transaction, 
  getPendingTransactionsDB, 
  markAsSyncedDB 
} from '../database/db';
import * as Crypto from 'expo-crypto'; // Instale: npx expo install expo-crypto

// URL da API (Ajuste para seu IP local se estiver testando no celular ou localhost no emulador)
// Emulador Android usa 10.0.2.2. Web usa localhost.
const API_URL = 'http://localhost:8080/api'; 

interface FinanceStore {
  transactions: Transaction[];
  loadTransactions: () => void;
  addTransaction: (transaction: Omit<Transaction, 'id' | 'client_uuid' | 'sync_status'>) => Promise<void>;
  syncData: () => Promise<void>; // Nova ação
}

export const useFinanceStore = create<FinanceStore>((set, get) => ({
  transactions: [],

  loadTransactions: () => {
    initDB();
    const data = getTransactionsDB();
    set({ transactions: data });
  },

  addTransaction: async (newTx) => {
    // 1. Gera UUID único para esta transação
    const client_uuid = Crypto.randomUUID();

    // 2. Prepara objeto completo
    const txData = {
      ...newTx,
      client_uuid,
    };

    // 3. Salva no SQLite (Offline first)
    addTransactionDB(txData);

    // 4. Atualiza UI imediatamente
    get().loadTransactions();

    // 5. Tenta sincronizar com a nuvem (Fire and Forget)
    // Se falhar (sem net), fica no SQLite como 'PENDING'
    get().syncData(); 
  },

  syncData: async () => {
    try {
      // 1. Busca pendentes
      const pending = getPendingTransactionsDB();
      if (pending.length === 0) return;

      console.log(`Tentando sincronizar ${pending.length} itens...`);

      // 2. Envia para o Backend
      const response = await fetch(`${API_URL}/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          transactions: pending,
          userId: 1 // Hardcoded para teste
        }),
      });

      if (response.ok) {
        const data = await response.json();
        // 3. Marca como sincronizado no SQLite
        if (data.synced && data.synced.length > 0) {
          markAsSyncedDB(data.synced);
          console.log('Sincronização concluída!');
          // Atualiza lista na UI para refletir status (se quiser mostrar ícone de check)
          get().loadTransactions();
        }
      }
    } catch (error) {
      console.log('Sem conexão ou erro no servidor. Dados mantidos localmente.');
    }
  }
}));