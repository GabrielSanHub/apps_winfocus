import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { IconButton, Modal, Portal, Button, useTheme } from 'react-native-paper';
import { useRouter } from 'expo-router'; // Adicionado
import { useFinanceStore } from '../src/store/useFinanceStore';
import { ThemedText } from './themed-text';

export const SyncIndicator = () => {
  const theme = useTheme();
  const router = useRouter(); // Hook de navegação
  const { user, syncStatus, setSyncPreference } = useFinanceStore();
  const [visible, setVisible] = useState(false);

  // Lógica de Cores e Texto
  const getStatusColor = () => {
    if (!user) return 'gray'; // Usuário não logado
    if (user.sync_preference === 'ask') return 'gray';
    if (user.sync_preference === 'local') return 'gray';
    if (syncStatus === 'synced') return 'green';
    if (syncStatus === 'pending') return '#FFC107'; // Amarelo
    if (syncStatus === 'error') return '#F44336'; // Vermelho
    return 'gray';
  };

  const getStatusText = () => {
    if (!user) return 'Login necessário';
    if (user.sync_preference === 'ask') return 'Sincronização pendente';
    if (user.sync_preference === 'local') return 'Apenas Local';
    if (syncStatus === 'synced') return 'Dados Salvos na Nuvem';
    if (syncStatus === 'pending') return 'Sincronizando...';
    return 'Erro de Conexão';
  };

  const handleSyncDecision = (pref: 'cloud' | 'local') => {
    if (pref === 'cloud') {
        if (!user) {
            // Se quer nuvem e não tem usuário, vai para login
            setVisible(false);
            router.push('/auth');
            return;
        }
    }
    
    // Se já tem usuário ou escolheu local, segue fluxo normal
    setSyncPreference(pref);
    setVisible(false);
  };

  return (
    <>
      <TouchableOpacity 
        style={styles.container} 
        onPress={() => setVisible(true)}
      >
        <Text style={[styles.text, { color: theme.colors.onSurfaceVariant }]}>
          {user?.sync_preference === 'ask' ? 'Configurar Nuvem' : getStatusText()}
        </Text>
        <IconButton 
          icon="cloud-sync" 
          iconColor={getStatusColor()} 
          size={24} 
        />
      </TouchableOpacity>

      <Portal>
        <Modal visible={visible} onDismiss={() => setVisible(false)} contentContainerStyle={[styles.modal, { backgroundColor: theme.colors.surface }]}>
          <ThemedText type="subtitle">Sincronização na Nuvem</ThemedText>
          <Text style={{ marginVertical: 10, color: theme.colors.onSurface }}>
            {!user 
              ? 'Para salvar seus dados na nuvem, você precisa criar uma conta ou fazer login.'
              : user.sync_preference === 'ask' 
                ? 'Deseja fazer backup dos seus dados na nuvem? Se escolher "Não", seus dados ficarão apenas neste dispositivo.' 
                : 'Status da sua conexão com o servidor.'
            }
          </Text>
          
          <View style={styles.actions}>
            <Button mode="outlined" onPress={() => handleSyncDecision('local')}>
              Manter Local
            </Button>
            <Button mode="contained" onPress={() => handleSyncDecision('cloud')} style={{ marginLeft: 10 }}>
              {!user ? 'Fazer Login' : 'Sincronizar'}
            </Button>
          </View>
        </Modal>
      </Portal>
    </>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingRight: 10,
  },
  text: {
    fontSize: 12,
    marginRight: -5,
    textAlign: 'right',
    maxWidth: 100,
  },
  modal: {
    padding: 20,
    margin: 20,
    borderRadius: 8,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 20,
  }
});