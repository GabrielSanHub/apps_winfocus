import { create } from 'zustand';
import { getProfiles, updateProfileSettings, Profile } from '../database/db';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface FinanceState {
  profiles: Profile[];
  currentProfile: Profile | null;
  refreshKey: number;
  themeMode: 'system' | 'light' | 'dark';
  
  loadProfiles: () => void;
  setCurrentProfile: (profile: Profile) => void;
  updateProfileConfig: (field: string, value: any) => void;
  notifyUpdate: () => void;
  setThemeMode: (mode: 'system' | 'light' | 'dark') => Promise<void>;
  loadTheme: () => Promise<void>;
}

const useFinanceStore = create<FinanceState>((set, get) => ({
  profiles: [],
  currentProfile: null,
  refreshKey: 0,
  themeMode: 'system',

  loadProfiles: () => {
    const data = getProfiles();
    // Tenta manter o perfil atual se existir
    const current = get().currentProfile;
    if (current) {
        const updatedCurrent = data.find(p => p.id === current.id);
        set({ profiles: data, currentProfile: updatedCurrent || data[0] });
    } else {
        set({ profiles: data, currentProfile: data[0] });
    }
  },

  setCurrentProfile: (profile) => set({ currentProfile: profile }),

  updateProfileConfig: (field, value) => {
    const { currentProfile, loadProfiles, notifyUpdate } = get();
    if (!currentProfile) return;
    updateProfileSettings(currentProfile.id, field, value);
    loadProfiles(); // Recarrega para atualizar o objeto currentProfile
    notifyUpdate();
  },

  notifyUpdate: () => set((state) => ({ refreshKey: state.refreshKey + 1 })),

  setThemeMode: async (mode) => {
    set({ themeMode: mode });
    await AsyncStorage.setItem('themeMode', mode);
  },

  loadTheme: async () => {
    const saved = await AsyncStorage.getItem('themeMode');
    if (saved === 'light' || saved === 'dark' || saved === 'system') {
        set({ themeMode: saved });
    }
  }
}));

export default useFinanceStore;