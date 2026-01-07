import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { getProfiles } from '../database/db';

const useFinanceStore = create((set) => ({
  profiles: [],
  currentProfile: null,
  refreshKey: 0,
  themeMode: 'system', // 'system', 'light', 'dark'

  loadProfiles: () => {
    const data = getProfiles();
    set({ profiles: data, currentProfile: data[0] });
  },

  setCurrentProfile: (profile) => set({ currentProfile: profile }),

  notifyUpdate: () => set((state) => ({ refreshKey: state.refreshKey + 1 })),

  setThemeMode: async (mode) => {
    set({ themeMode: mode });
    await AsyncStorage.setItem('themeMode', mode);
  },

  loadTheme: async () => {
    const saved = await AsyncStorage.getItem('themeMode');
    if (saved) set({ themeMode: saved });
  }
}));

export default useFinanceStore;