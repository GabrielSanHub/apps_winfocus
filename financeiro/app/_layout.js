import * as Notifications from 'expo-notifications';
import { Stack, useRouter, useSegments } from 'expo-router';
import { useEffect } from 'react';
import { useColorScheme } from 'react-native';
import { MD3DarkTheme, MD3LightTheme, PaperProvider } from 'react-native-paper';
import { initDB } from '../src/database/db';
import useFinanceStore from '../src/store/useFinanceStore';

// Configuração do Handler de Notificações
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

const customLight = { ...MD3LightTheme, colors: { ...MD3LightTheme.colors, primary: '#006C4C', secondary: '#4C6357' } };
const customDark = { ...MD3DarkTheme, colors: { ...MD3DarkTheme.colors, primary: '#5DDBBC', secondary: '#B3CCBE' } };

export default function RootLayout() {
  const systemScheme = useColorScheme();
  const { loadProfiles, currentProfile, themeMode, loadTheme } = useFinanceStore();
  const router = useRouter();
  const segments = useSegments();

  useEffect(() => {
    initDB();
    loadProfiles();
    loadTheme();
  }, []);

  useEffect(() => {
    if (!currentProfile && segments.length === 0) return;
    if (currentProfile && segments.length === 0) {
      router.replace('/(tabs)');
    }
  }, [currentProfile, segments]);

  // Lógica de Tema
  let activeTheme = customLight;
  if (themeMode === 'dark') activeTheme = customDark;
  else if (themeMode === 'light') activeTheme = customLight;
  else activeTheme = systemScheme === 'dark' ? customDark : customLight;

  return (
    <PaperProvider theme={activeTheme}>
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
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