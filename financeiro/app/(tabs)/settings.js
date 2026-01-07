import { useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';
import { Button, Dialog, Divider, IconButton, List, Portal, SegmentedButtons, Switch, TextInput, useTheme } from 'react-native-paper';
import { addCategory, deleteCategory, deleteTransactionGroup, getCategories, getRecurringGroups } from '../../src/database/db';
import useFinanceStore from '../../src/store/useFinanceStore';

export default function Settings() {
  const theme = useTheme();
  const { themeMode, setThemeMode, currentProfile, refreshKey, notifyUpdate } = useFinanceStore();
  
  const [recurringGroups, setRecurringGroups] = useState([]);
  const [categories, setCategories] = useState([]);
  
  // Controle de Criação de Categoria
  const [visibleCatDialog, setVisibleCatDialog] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [newCatType, setNewCatType] = useState('expense');

  useEffect(() => {
    loadSettingsData();
  }, [currentProfile, refreshKey]);

  const loadSettingsData = () => {
    if (currentProfile) {
        setRecurringGroups(getRecurringGroups(currentProfile.id));
        setCategories(getCategories()); // Pega todas as categorias
    }
  };

  const handleDeleteGroup = (groupId) => {
    Alert.alert("Confirmar", "Apagar todas as parcelas?", [
        { text: "Não" },
        { text: "Sim", onPress: () => { deleteTransactionGroup(groupId); notifyUpdate(); } }
    ]);
  };

  const handleAddCategory = () => {
    if (!newCatName.trim()) return;
    addCategory(newCatName, newCatType);
    setVisibleCatDialog(false);
    setNewCatName('');
    notifyUpdate(); // Atualiza a lista na tela
  };

  const handleDeleteCategory = (id, isDefault) => {
    if (isDefault) {
        Alert.alert("Aviso", "Categorias padrão não podem ser excluídas.");
        return;
    }
    deleteCategory(id);
    notifyUpdate();
  };

  return (
    <View style={{ flex: 1 }}>
    <ScrollView style={[styles.container, { backgroundColor: theme.colors.background }]}>
      
      <List.Section>
        <List.Subheader>Aparência</List.Subheader>
        <List.Item
          title="Modo Escuro"
          right={() => <Switch value={themeMode === 'dark'} onValueChange={(val) => setThemeMode(val ? 'dark' : 'light')} />}
        />
      </List.Section>
      
      <Divider />

      {/* Seção de Categorias */}
      <List.Section>
        <List.Subheader>Gerenciar Categorias</List.Subheader>
        <Button mode="outlined" icon="plus" onPress={() => setVisibleCatDialog(true)} style={{ marginHorizontal: 16, marginBottom: 10 }}>
            Nova Categoria
        </Button>
        {categories.map((cat) => (
             <List.Item
                key={cat.id}
                title={cat.name}
                description={cat.type === 'income' ? 'Receita' : 'Despesa'}
                left={props => <List.Icon {...props} icon={cat.icon || 'tag'} />}
                right={props => !cat.is_default && (
                    <IconButton icon="trash-can-outline" iconColor={theme.colors.error} onPress={() => handleDeleteCategory(cat.id, cat.is_default)} />
                )}
             />
        ))}
      </List.Section>

      <Divider />

      <List.Section>
        <List.Subheader>Contas Recorrentes</List.Subheader>
        {recurringGroups.map((group) => (
            <List.Item
                key={group.repeat_group_id}
                title={group.description}
                description={`${group.count} parcelas restantes`}
                right={() => <IconButton icon="trash-can-outline" onPress={() => handleDeleteGroup(group.repeat_group_id)} />}
            />
        ))}
      </List.Section>
      
      <View style={{ height: 50 }} />
    </ScrollView>

    {/* Dialog para Nova Categoria */}
    <Portal>
        <Dialog visible={visibleCatDialog} onDismiss={() => setVisibleCatDialog(false)}>
            <Dialog.Title>Nova Categoria</Dialog.Title>
            <Dialog.Content>
                <SegmentedButtons
                    value={newCatType}
                    onValueChange={setNewCatType}
                    buttons={[
                        { value: 'income', label: 'Receita' },
                        { value: 'expense', label: 'Despesa' },
                    ]}
                    style={{ marginBottom: 15 }}
                />
                <TextInput
                    label="Nome da Categoria"
                    value={newCatName}
                    onChangeText={setNewCatName}
                    mode="outlined"
                />
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