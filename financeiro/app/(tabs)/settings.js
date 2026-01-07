import { useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet } from 'react-native';
import { Divider, IconButton, List, Switch, Text, useTheme } from 'react-native-paper';
import { deleteTransactionGroup, getRecurringGroups } from '../../src/database/db';
import useFinanceStore from '../../src/store/useFinanceStore';

export default function Settings() {
  const theme = useTheme();
  const { themeMode, setThemeMode, currentProfile, refreshKey, notifyUpdate } = useFinanceStore();
  const [recurringGroups, setRecurringGroups] = useState([]);

  useEffect(() => {
    if (currentProfile) {
        const groups = getRecurringGroups(currentProfile.id);
        setRecurringGroups(groups);
    }
  }, [currentProfile, refreshKey]);

  const handleDeleteGroup = (groupId) => {
    Alert.alert(
      "Remover Recorrência",
      "Isso apagará TODAS as parcelas futuras e passadas deste lançamento. Confirmar?",
      [
        { text: "Cancelar", style: "cancel" },
        { 
          text: "Apagar Tudo", 
          style: 'destructive',
          onPress: () => {
            deleteTransactionGroup(groupId);
            notifyUpdate(); // Atualiza a lista
          }
        }
      ]
    );
  };

  return (
    <ScrollView style={[styles.container, { backgroundColor: theme.colors.background }]}>
      
      <List.Section>
        <List.Subheader>Aparência</List.Subheader>
        <List.Item
          title="Modo Escuro"
          description="Ativar tema dark"
          right={() => <Switch value={themeMode === 'dark'} onValueChange={(val) => setThemeMode(val ? 'dark' : 'light')} />}
        />
      </List.Section>
      
      <Divider />

      <List.Section>
        <List.Subheader>Gestão de Recorrências</List.Subheader>
        {recurringGroups.length === 0 ? (
            <Text style={{ padding: 16, color: theme.colors.outline }}>Nenhuma conta parcelada ou recorrente.</Text>
        ) : (
            recurringGroups.map((group) => (
                <List.Item
                    key={group.repeat_group_id}
                    title={`${group.description || group.category}`}
                    description={`${group.count} parcelas - R$ ${group.amount.toFixed(2)}`}
                    left={props => <List.Icon {...props} icon="refresh" />}
                    right={props => (
                        <IconButton 
                            icon="trash-can-outline" 
                            iconColor={theme.colors.error} 
                            onPress={() => handleDeleteGroup(group.repeat_group_id)} 
                        />
                    )}
                />
            ))
        )}
      </List.Section>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
});