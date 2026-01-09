import * as Notifications from 'expo-notifications';
import { Stack } from 'expo-router';
import { useEffect } from 'react';
import { useColorScheme } from 'react-native';
import { MD3DarkTheme, MD3LightTheme, PaperProvider, MD3Theme } from 'react-native-paper';
import { initDB } from '../src/database/db';
import { useFinanceStore } from '../src/store/useFinanceStore';
import { SyncIndicator } from '../components/SyncIndicator';

// Configuração do Handler de Notificações
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

const customLight: MD3Theme = { ...MD3LightTheme, colors: { ...MD3LightTheme.colors, primary: '#006C4C', secondary: '#4C6357' } };
const customDark: MD3Theme = { ...MD3DarkTheme, colors: { ...MD3DarkTheme.colors, primary: '#5DDBBC', secondary: '#B3CCBE' } };

export default function RootLayout() {
  const systemScheme = useColorScheme();
  const { loadProfiles, themeMode, loadTheme } = useFinanceStore();

  useEffect(() => {
    initDB();
    loadProfiles();
    loadTheme();
  }, []);

  // Lógica de Tema
  let activeTheme = customLight;
  if (themeMode === 'dark') activeTheme = customDark;
  else if (themeMode === 'light') activeTheme = customLight;
  else activeTheme = systemScheme === 'dark' ? customDark : customLight;

  return (
    <PaperProvider theme={activeTheme}>
      <Stack>
        {/* A ordem importa! O index.tsx (que redireciona para tabs) será o padrão.
          Definimos (tabs) primeiro para garantir que seja a base da pilha.
        */}
        
        {/* 1. Rotas Principais */}
        <Stack.Screen 
          name="(tabs)" 
          options={{ 
            headerShown: true,
            title: 'Visão Geral',
            headerRight: () => <SyncIndicator />,
            headerStyle: { backgroundColor: activeTheme.colors.surface },
            headerTintColor: activeTheme.colors.onSurface
          }}
        />

        {/* 2. Tela de Login (MODAL) */}
        <Stack.Screen 
          name="auth" 
          options={{ 
            presentation: 'modal', // Faz a tela deslizar de baixo para cima
            headerShown: false,    // O cabeçalho será customizado dentro da tela
          }} 
        />

        {/* 3. Tela Modal de Nova Transação */}
        <Stack.Screen 
          name="add-transaction" 
          options={{ 
            presentation: 'modal', 
            title: 'Nova Transação',
            headerStyle: { backgroundColor: activeTheme.colors.surface },
            headerTintColor: activeTheme.colors.onSurface
          }} 
        />
      </Stack>
    </PaperProvider>
  );
}