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
  Profile, registerUserLocal, loginUserLocal, updateUserSyncPref, User, getUserByEmail
} from '../database/db';

const SERVER_IP: string = '192.168.15.11'; 

const API_URL = Platform.OS === 'android' && SERVER_IP === 'localhost' 
    ? 'http://10.0.2.2:3000/api' 
    : `http://${SERVER_IP}:3000/api`;

interface FinanceStore {
  transactions: Transaction[];
  profiles: Profile[]; 
  currentProfile: Profile | null;

  user: User | null;
  syncStatus: 'synced' | 'pending' | 'error' | 'offline';
  
  login: (email: string, pass: string) => Promise<boolean>;
  register: (name: string, email: string, pass: string) => Promise<boolean>;
  logout: () => void;
  setSyncPreference: (pref: 'cloud' | 'local' | 'ask') => Promise<void>;
  checkSyncStatus: () => void;

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

  user: null,
  syncStatus: 'offline',

// Em financeiro/src/store/useFinanceStore.ts

  login: async (email, password) => {
    // 1. Tenta Login Online
    try {
      const res = await fetch(`${API_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      
      if (res.ok) {
        const serverUser = await res.json();
        
        // Sucesso Online: Atualiza ou cria localmente
        let localUser = getUserByEmail(email);
        if (!localUser) {
           localUser = registerUserLocal(serverUser.name, email, password, serverUser.id);
        } else {
           updateUserSyncPref(localUser.id, localUser.sync_preference, serverUser.id);
           localUser = { ...localUser, server_id: serverUser.id }; 
        }

        set({ user: localUser, syncStatus: 'synced' });
        get().loadProfiles(); 

        console.log("Login sucesso: Iniciando sincronização de pendências antigas...");
        // Não usamos await aqui para não travar a tela de login, deixa rodar em background
        get().syncData();

        return true;
      }
    } catch (e) {
      console.log('Login Online falhou (sem rede ou servidor off). Tentando local...', e);
    }

    // 2. Fallback Login Offline (COM PROTEÇÃO)
    const localUser = loginUserLocal(email, password);
    if (localUser) {
      // --- AQUI ESTÁ A PROTEÇÃO ---
      // Se o usuário existe localmente, mas não tem ID do servidor,
      // significa que o registro dele nunca chegou no banco. Bloqueie!
      if (!localUser.server_id) {
          console.error("Login bloqueado: Usuário inconsistente (sem ID do servidor).");
          alert("Erro de Sincronização: Sua conta não foi confirmada no servidor. Conecte-se à internet e tente se registrar novamente."); 
          return false;
      }

      set({ user: localUser, syncStatus: 'offline' });
      get().loadProfiles();
      get().checkSyncStatus(); 
      return true;
    }

    return false;
  },

  register: async (name, email, password) => {
    let serverId = undefined;
    
    // 1. Tenta Registrar no Servidor (OBRIGATÓRIO AGORA)
    try {
      const res = await fetch(`${API_URL}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password })
      });

      if (!res.ok) {
        const errorData = await res.text();
        console.error("Erro no registro do servidor:", errorData);
        // Se o servidor rejeitou (ex: email duplicado ou erro de banco), PARE.
        return false; 
      }

      const data = await res.json();
      serverId = data.id; // Pegamos o ID gerado pelo MySQL

    } catch (e) {
      console.error('Falha de conexão no registro:', e);
      // Se não conseguiu falar com o servidor, PARE.
      // Não queremos criar usuários fantasmas locais.
      alert("Sem conexão com o servidor. O cadastro requer internet.");
      return false;
    }

    // 2. Só salva no SQLite se tivermos o serverId
    try {
      if (serverId) {
        const newUser = registerUserLocal(name, email, password, serverId);
        set({ user: newUser });
        // Cria perfil padrão, etc...
        return true;
      }
    } catch (e) {
      console.error("Erro ao salvar localmente:", e);
      return false;
    }
    
    return false;
  },

  setSyncPreference: async (pref) => {
    const { user, syncData } = get();
    if (!user) return;
    
    updateUserSyncPref(user.id, pref);
    set({ user: { ...user, sync_preference: pref } });

    if (pref === 'cloud') {
      await syncData(); // Força sincronização imediata
    }
    get().checkSyncStatus();
  },

  checkSyncStatus: () => {
    const pending = getPendingTransactionsDB();
    const { user } = get();
    
    if (!user) return;
    
    if (user.sync_preference === 'ask') {
        // Cor Cinza é gerida pelo componente visual se status for null ou especifico
    } else if (pending.length > 0) {
        set({ syncStatus: 'pending' }); // Amarelo
    } else {
        set({ syncStatus: 'synced' }); // Verde
    }
  },
  
  logout: () => {
    set({ user: null, currentProfile: null, transactions: [] });
  },

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
    // 1. Preparação dos dados
    const client_uuid = Crypto.randomUUID();
    const profileId = get().currentProfile?.id || 1;
    const txData = { 
        ...newTx, 
        client_uuid, 
        profile_id: profileId,
        type: newTx.type || 'expense' // Garante padrão 'expense'
    };

    // 2. Salva Localmente (OFFLINE FIRST)
    // Isso garante que o dado exista no celular instantaneamente
    addTransactionDB(txData);
    
    // Atualiza a UI para o usuário ver a transação nova
    get().loadTransactions();

    // 3. AUTO-SYNC: Tenta enviar imediatamente para a nuvem
    const { user } = get();
    
    // Se o usuário tem ID do servidor, significa que está logado/sincronizado
    if (user?.server_id) {
      console.log('🔄 Tentando envio automático da nova transação...');
      try {
        // Chama a função de sincronização que já temos
        await get().syncData();
        
        // Se der certo, o syncData já atualiza o status de PENDING para SYNCED
        // e recarrega a lista, fazendo o ícone ficar verde.
      } catch (e) {
        // Se falhar (ex: sem internet momentânea), não faz nada.
        // A transação continua salva localmente como 'PENDING' (amarelo)
        // e será enviada na próxima vez.
        console.log('⚠️ Envio automático falhou (sem rede?), mantendo offline por enquanto.');
      }
    }
  },

syncData: async () => {
    try {
      const pending = getPendingTransactionsDB();
      if (pending.length === 0) return;

      const { user } = get();
      const targetUserId = user?.server_id;

      // CORREÇÃO: Evita o erro se o usuário for offline ou o registro falhou anteriormente
      if (!targetUserId) {
        console.log("Sync ignorado: Usuário offline ou sem ID do servidor vinculado.");
        return; 
      }

      console.log(`Iniciando sincronização para user ${targetUserId} com ${pending.length} itens.`);

      const response = await fetch(`${API_URL}/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
            transactions: pending, 
            userId: targetUserId 
        }),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.synced?.length > 0) {
          markAsSyncedDB(data.synced);
          get().loadTransactions();
          get().checkSyncStatus(); 
          console.log('Sincronização concluída com sucesso.');
        }
      } else {
        const errorText = await response.text();
        console.error('Erro no Backend:', errorText);
      }
    } catch (e) {
      console.error('Erro de Conexão/Sync:', e);
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