import React, { useState, useEffect } from 'react';
import { View, ScrollView, Alert, StyleSheet, ActivityIndicator } from 'react-native';
import { List, Switch, Text, Button, Divider, useTheme, IconButton, TextInput, Dialog, Portal, SegmentedButtons } from 'react-native-paper';
import { useRouter } from 'expo-router'; 
import { useFinanceStore } from '../../src/store/useFinanceStore';
import { 
  getRecurringAndFixedGroups, 
  deleteTransactionGroup, 
  deleteTransactionGroupLegacy, 
  getCategories, 
  addCategory, 
  updateCategory,
  deleteCategoryAndTransactions,
  deleteCategoryAndMoveToNone,
  checkCategoryExists,
  countTransactionsByCategory,
  updateProfileConfig,
  clearAllProfileTransactions,
  Category 
} from '../../src/database/db';

interface RecurringGroup {
    id: number;
    repeat_group_id: string;
    description: string;
    category: string;
    amount: number;
    type: string;
    is_fixed: number;
    count: number;
}

export default function Settings() {
  const theme = useTheme();
  const router = useRouter();
  const { 
    themeMode, 
    setThemeMode,
    profiles,
    currentProfile, 
    setCurrentProfile,
    notifyUpdate,
    updateCurrentProfileLocal,
    user,   // <--- Adicionado
    logout  // <--- Adicionado
  } = useFinanceStore();  
  
  const [recurringGroups, setRecurringGroups] = useState<RecurringGroup[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  
  const [visibleCatDialog, setVisibleCatDialog] = useState(false);
  const [catName, setCatName] = useState('');
  const [catType, setCatType] = useState('expense');
  const [editingCat, setEditingCat] = useState<Category | null>(null);

  const [isResetting, setIsResetting] = useState(false);

  const loadSettingsData = () => {
    if (currentProfile) {
        const groups = getRecurringAndFixedGroups(currentProfile.id) as any[]; 
        setRecurringGroups(groups);
        
        const cats = getCategories(currentProfile.id, undefined, currentProfile.settings_share_categories ? 1 : 0);
        setCategories(cats);
    }
  };

  useEffect(() => {
    loadSettingsData();
  }, [currentProfile]);

  // --- LÓGICA DE LOGOUT (NOVO) ---
  const handleLogout = () => {
    Alert.alert(
      "Sair da Conta",
      `Deseja desconectar a conta de ${user?.name}? Seus dados locais serão mantidos, mas a sincronização será pausada.`,
      [
        { text: "Cancelar", style: "cancel" },
        { 
          text: "Sair", 
          style: "destructive",
          onPress: () => {
             logout();
             // Redireciona para a raiz para que o Layout decida o fluxo (provavelmente modo offline)
             router.replace('/'); 
          }
        }
      ]
    );
  };

  // --- LÓGICA DE CATEGORIAS ---
  const openAddCategory = () => {
      setEditingCat(null);
      setCatName('');
      setCatType('expense');
      setVisibleCatDialog(true);
  };

  const openEditCategory = (cat: Category) => {
      setEditingCat(cat);
      setCatName(cat.name);
      setCatType(cat.type);
      setVisibleCatDialog(true);
  };

  const handleSaveCategory = () => {
    if (!catName.trim() || !currentProfile) return;
    
    const isNameChanged = editingCat && editingCat.name.toLowerCase() !== catName.trim().toLowerCase();
    const isNew = !editingCat;

    if (isNew || isNameChanged) {
        const exists = checkCategoryExists(catName, currentProfile.id);
        if (exists) {
            return Alert.alert("Erro", "Já existe uma categoria (ou padrão) com este nome.");
        }
    }

    if (editingCat) {
        updateCategory(editingCat.id, catName, editingCat.name);
    } else {
        addCategory(catName, catType, currentProfile.id);
    }

    setVisibleCatDialog(false);
    setCatName('');
    notifyUpdate();
    loadSettingsData();
  };

  const handleDeleteCategoryRequest = (cat: Category) => {
    if (cat.is_default === 1) {
        return Alert.alert("Ação Negada", "Categorias padrão não podem ser excluídas.");
    }
    if (!currentProfile) return;

    const count = countTransactionsByCategory(cat.name, currentProfile.id);

    Alert.alert(
        "Excluir Categoria",
        `Esta categoria possui ${count} transações associadas. O que deseja fazer?`,
        [
            { text: "Cancelar", style: 'cancel' },
            { 
                text: "Apagar Categoria e Histórico", 
                style: 'destructive',
                onPress: () => {
                    deleteCategoryAndTransactions(cat.id, cat.name, currentProfile.id);
                    notifyUpdate();
                    loadSettingsData();
                }
            },
            {
                text: "Apagar Categoria (Mover para 'Nenhuma')",
                onPress: () => {
                    deleteCategoryAndMoveToNone(cat.id, cat.name, currentProfile.id);
                    notifyUpdate();
                    loadSettingsData();
                }
            }
        ]
    );
  };

  // --- OUTRAS FUNÇÕES ---
  const handleDeleteGroup = (group: RecurringGroup) => {
    Alert.alert(
      "Parar Recorrência",
      "Isso apagará apenas os lançamentos FUTUROS ou pendentes. Histórico pago será mantido.",
      [
        { text: "Cancelar" },
        { 
          text: "Confirmar", style: 'destructive',
          onPress: () => { 
              if (group.repeat_group_id) {
                  deleteTransactionGroup(group.repeat_group_id); 
              } else if (currentProfile) {
                  deleteTransactionGroupLegacy(group.description, group.amount, currentProfile.id);
              }
              notifyUpdate(); 
              loadSettingsData(); 
          }
        }
      ]
    );
  };

  const handleClearAll = () => {
    if (!currentProfile) return;
    Alert.alert(
        "CUIDADO: Reset Total", 
        `Tem certeza que deseja apagar TODAS as transações do perfil "${currentProfile.name}"? Isso não pode ser desfeito e o app será reiniciado.`,
        [
            { text: "Cancelar", style: 'cancel' },
            { 
                text: "SIM, APAGAR TUDO", style: 'destructive', 
                onPress: () => {
                    setIsResetting(true);
                    clearAllProfileTransactions(currentProfile.id);
                    setTimeout(() => {
                        notifyUpdate();
                        setIsResetting(false);
                        router.replace("./(tabs)/"); 
                    }, 2000);
                }
            }
        ]
    );
  };

  const handleSwitchProfileType = (type: string) => {
    const targetProfile = profiles.find(p => p.type === type);
    if (targetProfile) setCurrentProfile(targetProfile);
    else Alert.alert("Aviso", `Nenhum perfil do tipo '${type}' encontrado.`);
  };

  const handleUpdateConfig = (key: string, value: any) => {
      if(!currentProfile) return;
      updateCurrentProfileLocal(key, value);
      updateProfileConfig(currentProfile.id, key, value);
      notifyUpdate();
  };

  if (isResetting) {
      return (
          <View style={{ flex: 1, backgroundColor: theme.colors.background, justifyContent: 'center', alignItems: 'center' }}>
              <ActivityIndicator size="large" color={theme.colors.primary} />
              <Text variant="titleLarge" style={{ marginTop: 20 }}>Reiniciando aplicação...</Text>
              <Text variant="bodyMedium">Limpando banco de dados...</Text>
          </View>
      );
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
        <ScrollView style={styles.container}>
        
        <View style={{ padding: 16 }}>
            <Text variant="titleMedium" style={{ marginBottom: 10, textAlign: 'center' }}>Perfil Ativo</Text>
            <SegmentedButtons
            value={currentProfile?.type || 'personal'}
            onValueChange={handleSwitchProfileType}
            buttons={[
                { value: 'personal', label: 'Pessoal', icon: 'account' },
                { value: 'business', label: 'Empresa', icon: 'briefcase' },
            ]}
            />
        </View>

        <Divider />

        <List.Section>
            <List.Subheader>Preferências</List.Subheader>
            <List.Item
                title="Modo Escuro"
                left={props => <List.Icon {...props} icon="theme-light-dark" />}
                right={() => <Switch value={themeMode === 'dark'} onValueChange={(val) => setThemeMode(val ? 'dark' : 'light')} />}
            />
            <Divider />
            <List.Item
                title="Compartilhar Categorias"
                description="Ver categorias de outros perfis"
                left={props => <List.Icon {...props} icon="folder-account" />}
                right={() => <Switch value={!!currentProfile?.settings_share_categories} onValueChange={(val) => handleUpdateConfig('settings_share_categories', val ? 1 : 0)} />}
            />
            <Divider />
            <List.Item
                title="Modo de Saldo"
                description={currentProfile?.settings_balance_mode === 'total' ? "Soma de todo o histórico" : "Apenas fluxo do mês"}
                left={props => <List.Icon {...props} icon="scale-balance" />}
                right={() => <Switch value={currentProfile?.settings_balance_mode === 'total'} onValueChange={(val) => handleUpdateConfig('settings_balance_mode', val ? 'total' : 'monthly')} />}
            /> 
        </List.Section>
        
        <Divider />

        <List.Section>
            <List.Subheader>Gerenciar Categorias</List.Subheader>
            <Button mode="outlined" icon="plus" onPress={openAddCategory} style={{ marginHorizontal: 16, marginBottom: 10 }}>
                Nova Categoria
            </Button>
            {categories.map((cat) => (
                <List.Item
                    key={cat.id}
                    title={cat.name}
                    description={cat.is_default ? "Padrão (Fixo)" : (cat.type === 'both' ? 'Receita e Despesa' : (cat.type === 'income' ? 'Receita' : 'Despesa'))}
                    left={props => <List.Icon {...props} icon={cat.icon || 'tag'} />}
                    right={() => (
                        <View style={{ flexDirection: 'row' }}>
                            {!cat.is_default && (
                                <IconButton icon="pencil" onPress={() => openEditCategory(cat)} />
                            )}
                            {!cat.is_default ? (
                                <IconButton icon="trash-can-outline" iconColor={theme.colors.error} onPress={() => handleDeleteCategoryRequest(cat)} />
                            ) : (
                                <IconButton icon="lock" disabled />
                            )}
                        </View>
                    )}
                />
            ))}
        </List.Section>

        <Divider />
        
         <List.Section>
            <List.Subheader>Fixos e Recorrentes</List.Subheader>
            {recurringGroups.length === 0 ? 
                <Text style={{padding: 16, color: theme.colors.outline, textAlign: 'center'}}>Nenhuma recorrência ativa.</Text> 
                : recurringGroups.map((group, index) => (
                <List.Item
                    key={`${group.repeat_group_id || 'grp'}-${group.id || index}`}
                    title={group.description}
                    description={group.is_fixed ? "Fixo Mensal" : `${group.count} parcelas restantes`}
                    left={props => <List.Icon {...props} icon={group.is_fixed ? "pin" : "refresh"} />}
                    right={() => <IconButton icon="trash-can-outline" onPress={() => handleDeleteGroup(group)} />}
                />
            ))}
        </List.Section>

        <Divider />

        <List.Section>
            <List.Subheader style={{ color: theme.colors.error }}>Zona de Perigo</List.Subheader>
            
            <List.Item
                title="Limpar todas as contas"
                description="Apaga tudo deste perfil e reinicia"
                titleStyle={{ color: theme.colors.error, fontWeight: 'bold' }}
                left={props => <List.Icon {...props} icon="alert-decagram" color={theme.colors.error} />}
                onPress={handleClearAll}
            />

            {/* --- BOTÃO DE LOGOUT ADICIONADO AQUI --- */}
            {user && (
                <View style={{ marginTop: 20, paddingHorizontal: 16 }}>
                    <Button 
                        mode="outlined" 
                        icon="logout" 
                        textColor={theme.colors.primary}
                        onPress={handleLogout}
                        style={{ borderColor: theme.colors.primary }}
                    >
                        Sair da Conta ({user.name})
                    </Button>
                </View>
            )}
        </List.Section>

        <View style={{ height: 50 }} />
        </ScrollView>

        <Portal>
            <Dialog visible={visibleCatDialog} onDismiss={() => setVisibleCatDialog(false)}>
                <Dialog.Title>{editingCat ? 'Editar Categoria' : 'Nova Categoria'}</Dialog.Title>
                <Dialog.Content>
                    <SegmentedButtons
                        value={catType}
                        onValueChange={setCatType}
                        buttons={[ 
                            { value: 'income', label: 'Receita' }, 
                            { value: 'both', label: 'Ambas' }, 
                            { value: 'expense', label: 'Despesa' } 
                        ]}
                        style={{ marginBottom: 15 }}
                    />
                    <TextInput label="Nome" value={catName} onChangeText={setCatName} mode="outlined" autoFocus />
                </Dialog.Content>
                <Dialog.Actions>
                    <Button onPress={() => setVisibleCatDialog(false)}>Cancelar</Button>
                    <Button onPress={handleSaveCategory}>{editingCat ? 'Salvar' : 'Criar'}</Button>
                </Dialog.Actions>
            </Dialog>
        </Portal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
});