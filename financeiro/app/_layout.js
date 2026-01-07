// app/_layout.js
import { Slot } from 'expo-router';
import { PaperProvider, MD3LightTheme } from 'react-native-paper';
import { SafeAreaProvider } from 'react-native-safe-area-context';

// Tema personalizado simples (Cores)
const theme = {
  ...MD3LightTheme,
  colors: {
    ...MD3LightTheme.colors,
    primary: '#6200ee',
    secondary: '#03dac6',
  },
};

export default function Layout() {
  return (
    // SafeAreaProvider: Evita que o app fique "embaixo" do notch do iPhone
    <SafeAreaProvider>
      <PaperProvider theme={theme}>
         {/* Slot é onde as telas (index.js) serão renderizadas */}
        <Slot />
      </PaperProvider>
    </SafeAreaProvider>
  );
}