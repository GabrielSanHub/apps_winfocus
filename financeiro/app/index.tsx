import { Redirect } from 'expo-router';

export default function Index() {
  // Redireciona imediatamente para as abas principais
  return <Redirect href="/(tabs)" />;
}