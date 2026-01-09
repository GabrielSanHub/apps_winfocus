import React, { useState } from 'react';
import { View, StyleSheet, Alert, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { TextInput, Button, Text, useTheme, IconButton, Surface } from 'react-native-paper';
import { useRouter } from 'expo-router';
import { useFinanceStore } from '../src/store/useFinanceStore';
import { IconSymbol } from '../components/ui/icon-symbol';

export default function AuthScreen() {
  const router = useRouter();
  const theme = useTheme();
  const { login, register } = useFinanceStore();
  
  const [isLogin, setIsLogin] = useState(true);
  const [loading, setLoading] = useState(false);
  
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleAuth = async () => {
    if (!email || !password) {
      Alert.alert('Atenção', 'Preencha todos os campos obrigatórios.');
      return;
    }
    if (!isLogin && !name) {
      Alert.alert('Atenção', 'Preencha o nome para cadastro.');
      return;
    }

    setLoading(true);
    let success = false;

    if (isLogin) {
      success = await login(email, password);
    } else {
      success = await register(name, email, password);
    }

    setLoading(false);

    if (success) {
      // Fecha o modal e volta para a tela anterior (o app)
      if (router.canGoBack()) {
        router.back();
      } else {
        router.replace('/(tabs)');
      }
    } else {
      Alert.alert('Erro', isLogin ? 'Email ou senha incorretos.' : 'Falha ao criar conta. Tente outro email.');
    }
  };

  const handleClose = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)');
  };

  return (
    <Surface style={[styles.container, { backgroundColor: theme.colors.background }]}>
      {/* Botão de Fechar */}
      <View style={styles.appBar}>
        <IconButton 
          icon="close" 
          size={28} 
          onPress={handleClose} 
          iconColor={theme.colors.onSurface}
        />
      </View>

      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          
          <View style={styles.header}>
            <View style={[styles.iconContainer, { backgroundColor: theme.colors.secondaryContainer }]}>
               <IconSymbol name="cloud.fill" size={40} color={theme.colors.primary} />
            </View>
            <Text variant="headlineMedium" style={{ fontWeight: 'bold', color: theme.colors.primary, marginTop: 16 }}>
              {isLogin ? 'Bem-vindo de volta' : 'Crie sua conta'}
            </Text>
            <Text variant="bodyLarge" style={{ color: theme.colors.onSurfaceVariant, textAlign: 'center', marginTop: 8 }}>
              {isLogin 
                ? 'Sincronize seus dados e acesse de qualquer lugar.' 
                : 'Comece a salvar suas finanças na nuvem hoje mesmo.'}
            </Text>
          </View>

          <View style={styles.form}>
            {!isLogin && (
              <TextInput
                label="Nome Completo"
                value={name}
                onChangeText={setName}
                mode="outlined"
                style={styles.input}
                left={<TextInput.Icon icon="account" />}
              />
            )}
            <TextInput
              label="Email"
              value={email}
              onChangeText={setEmail}
              mode="outlined"
              autoCapitalize="none"
              keyboardType="email-address"
              style={styles.input}
              left={<TextInput.Icon icon="email" />}
            />
            <TextInput
              label="Senha"
              value={password}
              onChangeText={setPassword}
              mode="outlined"
              secureTextEntry
              style={styles.input}
              left={<TextInput.Icon icon="lock" />}
            />

            <Button 
              mode="contained" 
              onPress={handleAuth} 
              loading={loading}
              contentStyle={{ height: 50 }}
              style={styles.button}
            >
              {isLogin ? 'Entrar' : 'Cadastrar'}
            </Button>

            <View style={styles.footer}>
              <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
                {isLogin ? 'Não tem uma conta?' : 'Já possui conta?'}
              </Text>
              <Button 
                mode="text" 
                onPress={() => setIsLogin(!isLogin)}
                compact
              >
                {isLogin ? 'Cadastre-se' : 'Faça Login'}
              </Button>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Surface>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  appBar: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingTop: Platform.OS === 'android' ? 40 : 10,
    paddingHorizontal: 10,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingBottom: 40,
  },
  header: {
    alignItems: 'center',
    marginBottom: 40,
  },
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },
  form: {
    width: '100%',
  },
  input: {
    marginBottom: 16,
  },
  button: {
    marginTop: 10,
    borderRadius: 8,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 20,
  }
});