import { create } from 'zustand';
import * as Crypto from 'expo-crypto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { 
  addTransactionDB, 
  getTransactionsDB, 
  initDB, 
  Transaction, 
  getPendingTransactionsDB, 
  markAsSyncedDB,
  getProfilesDB,
  Profile 
} from '../database/db';

const SERVER_IP: string = '192.168.15.11'; 

const API_URL = Platform.OS === 'android' && SERVER_IP === 'localhost' 
    ? 'http://10.0.2.2:3000/api' 
    : `http://${SERVER_IP}:3000/api`;

interface FinanceStore {
  transactions: Transaction[];
  profiles: Profile[]; 
  currentProfile: Profile | null; 
  
  loadTransactions: () => void;
  addTransaction: (transaction: Omit<Transaction, 'id' | 'client_uuid' | 'sync_status'>) => Promise<void>;
  syncData: () => Promise<void>;
  
  notifyUpdate: () => void; 

  themeMode: 'light' | 'dark' | 'system';
  
  loadProfiles: () => Promise<void>;
  setCurrentProfile: (profile: Profile) => void;
  // --- NOVA FUNÇÃO ---
  updateCurrentProfileLocal: (key: string, value: any) => void;
  
  loadTheme: () => Promise<void>;
  setThemeMode: (mode: 'light' | 'dark' | 'system') => void;
}

export const useFinanceStore = create<FinanceStore>((set, get) => ({
  transactions: [],
  profiles: [],
  currentProfile: null,
  themeMode: 'system',

  loadTransactions: () => {
    try {
      initDB();
      const currentProfileId = get().currentProfile?.id;
      const data = getTransactionsDB(currentProfileId); 
      set({ transactions: data });
    } catch (e) {
      console.error("Erro ao carregar transações", e);
    }
  },

  notifyUpdate: () => {
    get().loadTransactions();
  },

  addTransaction: async (newTx) => {
    const client_uuid = Crypto.randomUUID();
    const profileId = get().currentProfile?.id || 1;
    const txData = { ...newTx, client_uuid, profile_id: profileId };

    addTransactionDB(txData);
    get().loadTransactions();
    get().syncData(); 
  },

  syncData: async () => {
    try {
      const pending = getPendingTransactionsDB();
      if (pending.length === 0) return;

      const response = await fetch(`${API_URL}/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transactions: pending, userId: 1 }),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.synced?.length > 0) {
          markAsSyncedDB(data.synced);
          get().loadTransactions();
        }
      }
    } catch {
      console.log('Modo Offline: Dados salvos localmente.');
    }
  },

  loadProfiles: async () => {
    try {
        initDB(); 
        const profilesFromDB = getProfilesDB();
        
        if (profilesFromDB.length > 0) {
            set({ 
                profiles: profilesFromDB,
                currentProfile: get().currentProfile || profilesFromDB[0] 
            });
        }
    } catch (e) {
        console.error("Erro ao carregar perfis", e);
    }
    get().loadTransactions();
  },

  setCurrentProfile: (profile: Profile) => {
      set({ currentProfile: profile });
      get().loadTransactions(); 
  },

  // --- NOVA AÇÃO: Atualiza o perfil localmente para refletir switches na hora ---
  updateCurrentProfileLocal: (key: string, value: any) => {
      const current = get().currentProfile;
      if (current) {
          const updated = { ...current, [key]: value };
          set({ currentProfile: updated });
          // Opcional: Atualiza também na lista de profiles para consistência
          const updatedList = get().profiles.map(p => p.id === current.id ? updated : p);
          set({ profiles: updatedList });
      }
  },

  loadTheme: async () => {
    const savedTheme = await AsyncStorage.getItem('user_theme');
    if (savedTheme) {
      set({ themeMode: savedTheme as 'light' | 'dark' | 'system' });
    }
  },

  setThemeMode: async (mode) => {
    await AsyncStorage.setItem('user_theme', mode);
    set({ themeMode: mode });
  }
}));