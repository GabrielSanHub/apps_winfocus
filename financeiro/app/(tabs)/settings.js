import React, { useState, useEffect } from 'react';
import { View, ScrollView, Alert, StyleSheet } from 'react-native';
import { List, Switch, Text, Button, Divider, useTheme, IconButton, TextInput, Dialog, Portal, SegmentedButtons } from 'react-native-paper';
import useFinanceStore from '../../src/store/useFinanceStore';
import { getRecurringAndFixedGroups, deleteTransactionGroup, getCategories, addCategory, deleteCategory, clearAllProfileTransactions } from '../../src/database/db';

export default function Settings() {
  const theme = useTheme();
  const { themeMode, setThemeMode, currentProfile, setCurrentProfile, profiles, refreshKey, notifyUpdate, updateProfileConfig } = useFinanceStore();  
  
  const [recurringGroups, setRecurringGroups] = useState([]);
  const [categories, setCategories] = useState([]);
  const [visibleCatDialog, setVisibleCatDialog] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [newCatType, setNewCatType] = useState('expense');

  useEffect(() => {
    if (currentProfile) {
        setRecurringGroups(getRecurringAndFixedGroups(currentProfile.id));
        setCategories(getCategories(currentProfile.id, null, currentProfile.settings_share_categories));
    }
  }, [currentProfile, refreshKey]);

  const loadSettingsData = () => {
    if (currentProfile) {
        setRecurringGroups(getRecurringAndFixedGroups(currentProfile.id));
        // Passa o share_categories do perfil para saber o que listar
        setCategories(getCategories(currentProfile.id, null, currentProfile.settings_share_categories));
    }
  };

  const handleDeleteGroup = (groupId) => {
    Alert.alert(
      "Parar Recorrência",
      "Isso apagará apenas os lançamentos FUTUROS ou pendentes. Histórico pago será mantido.",
      [
        { text: "Cancelar" },
        { 
          text: "Confirmar", 
          style: 'destructive',
          onPress: () => {
            deleteTransactionGroup(groupId);
            notifyUpdate();
          }
        }
      ]
    );
  };

  const handleClearAll = () => {
    Alert.alert(
        "CUIDADO: Limpar Tudo", 
        `Tem certeza que deseja apagar TODAS as transações do perfil "${currentProfile?.name}"? Isso não pode ser desfeito.`,
        [
            { text: "Cancelar", style: 'cancel' },
            { 
                text: "SIM, APAGAR TUDO", 
                style: 'destructive', 
                onPress: () => {
                    clearAllProfileTransactions(currentProfile.id);
                    notifyUpdate();
                    Alert.alert("Concluído", "Histórico limpo com sucesso.");
                }
            }
        ]
    );
  };

  const handleAddCategory = () => {
    if (!newCatName.trim()) return;
    addCategory(newCatName, newCatType, currentProfile.id);
    setVisibleCatDialog(false);
    setNewCatName('');
    notifyUpdate();
  };

  const handleDeleteCategory = (id, isDefault) => {
    if (isDefault) return Alert.alert("Aviso", "Categorias padrão não podem ser excluídas.");
    deleteCategory(id);
    notifyUpdate();
  };

    const handleSwitchProfileType = (type) => {
    // Encontra o primeiro perfil que corresponda ao tipo (personal ou business)
    const targetProfile = profiles.find(p => p.type === type);
    if (targetProfile) {
        setCurrentProfile(targetProfile);
        notifyUpdate();
    } else {
        Alert.alert("Aviso", `Nenhum perfil do tipo '${type === 'personal' ? 'Pessoal' : 'Empresa'}' encontrado.`);
    }
  };

  return (
    <View style={{ flex: 1 }}>
    <ScrollView style={[styles.container, { backgroundColor: theme.colors.background }]}>
      
    {/* NOVO SELETOR DE PERFIL (PESSOAL | EMPRESA) */}
      <View style={{ padding: 16 }}>
        <Text variant="titleMedium" style={{ marginBottom: 10, textAlign: 'center' }}>Perfil Ativo</Text>
        <SegmentedButtons
          value={currentProfile?.type || 'personal'}
          onValueChange={handleSwitchProfileType}
          buttons={[
            {
              value: 'personal',
              label: 'Pessoal',
              icon: 'account',
            },
            {
              value: 'business',
              label: 'Empresa',
              icon: 'briefcase',
            },
          ]}
        />
      </View>

      <Divider />

      <List.Section>
        <List.Subheader>Preferências ({currentProfile?.name})</List.Subheader>
        <List.Item
          title="Modo Escuro"
          right={() => <Switch value={themeMode === 'dark'} onValueChange={(val) => setThemeMode(val ? 'dark' : 'light')} />}
        />
        <Divider />
        <List.Item
          title="Compartilhar Categorias"
          description="Ver categorias de outros perfis"
          right={() => <Switch value={!!currentProfile?.settings_share_categories} onValueChange={(val) => updateProfileConfig('settings_share_categories', val ? 1 : 0)} />}
        />
        <Divider />
        <List.Item
            title="Modo de Saldo"
            description={currentProfile?.settings_balance_mode === 'accumulated' ? "Soma de todo o histórico" : "Apenas fluxo do mês"}
            right={() => <Switch value={currentProfile?.settings_balance_mode === 'accumulated'} onValueChange={(val) => updateProfileConfig('settings_balance_mode', val ? 'accumulated' : 'monthly')} />}
        />
      </List.Section>
      
      <Divider />

      <List.Section>
        <List.Subheader>Gerenciar Categorias</List.Subheader>
        <Button mode="outlined" icon="plus" onPress={() => setVisibleCatDialog(true)} style={{ marginHorizontal: 16, marginBottom: 10 }}>
            Nova Categoria
        </Button>
        {categories.map((cat) => (
             <List.Item
                key={cat.id}
                title={cat.name}
                description={cat.is_default ? "Padrão (Global)" : "Personalizada"}
                left={props => <List.Icon {...props} icon={cat.icon || 'tag'} />}
                right={props => !cat.is_default && (
                    <IconButton icon="trash-can-outline" iconColor={theme.colors.error} onPress={() => handleDeleteCategory(cat.id, cat.is_default)} />
                )}
             />
        ))}
      </List.Section>

      <Divider />

      <List.Section>
        <List.Subheader>Fixos e Recorrentes</List.Subheader>
        {recurringGroups.length === 0 ? <Text style={{padding: 16, color: theme.colors.outline}}>Nada agendado.</Text> : recurringGroups.map((group) => (
            <List.Item
                key={group.repeat_group_id}
                title={group.description}
                description={group.is_fixed ? "Fixo Mensal" : `${group.count} parcelas restantes`}
                left={props => <List.Icon {...props} icon={group.is_fixed ? "pin" : "refresh"} />}
                right={() => <IconButton icon="trash-can-outline" onPress={() => handleDeleteGroup(group.repeat_group_id)} />}
            />
        ))}
      </List.Section>
      
      <Divider />

      <List.Section>
        <List.Subheader style={{ color: theme.colors.error }}>Zona de Perigo</List.Subheader>
        <List.Item
            title="Limpar todas as contas"
            description="Apaga todas as transações deste perfil"
            titleStyle={{ color: theme.colors.error, fontWeight: 'bold' }}
            left={props => <List.Icon {...props} icon="close-circle" color={theme.colors.error} />}
            onPress={handleClearAll}
        />
      </List.Section>

      <View style={{ height: 50 }} />
    </ScrollView>

    <Portal>
        <Dialog visible={visibleCatDialog} onDismiss={() => setVisibleCatDialog(false)}>
            <Dialog.Title>Nova Categoria</Dialog.Title>
            <Dialog.Content>
                <SegmentedButtons
                    value={newCatType}
                    onValueChange={setNewCatType}
                    buttons={[ { value: 'income', label: 'Receita' }, { value: 'expense', label: 'Despesa' } ]}
                    style={{ marginBottom: 15 }}
                />
                <TextInput label="Nome" value={newCatName} onChangeText={setNewCatName} mode="outlined" />
            </Dialog.Content>
            <Dialog.Actions>
                <Button onPress={() => setVisibleCatDialog(false)}>Cancelar</Button>
                <Button onPress={handleAddCategory}>Criar</Button>
            </Dialog.Actions>
        </Dialog>
    </Portal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
});