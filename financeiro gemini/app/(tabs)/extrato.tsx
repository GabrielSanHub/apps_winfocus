import { format } from 'date-fns';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { Chip, Divider, List, Searchbar, Text, useTheme } from 'react-native-paper';
import { getTransactions, Transaction } from '../../src/database/db';
import { useFinanceStore } from '../../src/store/useFinanceStore';

export default function Extrato() {
  const theme = useTheme();
  const { currentProfile } = useFinanceStore();
  
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'income' | 'expense'>('all');

  useFocusEffect(
    useCallback(() => {
      if (currentProfile) {
        // Pega transações do mês atual (ou expandir para lógica de scroll infinito depois)
        // Por simplificação, vamos pegar o mês atual. Para extrato completo, removeria o filtro de mês da query SQL.
        const today = new Date().toISOString().slice(0, 7);
        const data = getTransactions(currentProfile.id, today);
        setTransactions(data);
      }
    }, [currentProfile])
  );

  const filteredData = transactions.filter(item => {
    const desc = item.description || '';
    const cat = item.category || '';
    
    const matchesSearch = desc.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          cat.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesType = filterType === 'all' ? true : item.type === filterType;
    return matchesSearch && matchesType;
  });

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <View style={styles.header}>
        <Text variant="headlineSmall" style={{ marginBottom: 10 }}>Extrato: {currentProfile?.name}</Text>
        <Searchbar
          placeholder="Buscar transações..."
          onChangeText={setSearchQuery}
          value={searchQuery}
          style={{ marginBottom: 10, backgroundColor: theme.colors.surface }}
        />
        <View style={styles.filters}>
          <Chip 
            selected={filterType === 'all'} 
            onPress={() => setFilterType('all')} 
            style={styles.chip}
          >
            Todos
          </Chip>
          <Chip 
            selected={filterType === 'income'} 
            onPress={() => setFilterType('income')} 
            icon="arrow-up" 
            style={styles.chip}
          >
            Entradas
          </Chip>
          <Chip 
            selected={filterType === 'expense'} 
            onPress={() => setFilterType('expense')} 
            icon="arrow-down" 
            style={styles.chip}
          >
            Saídas
          </Chip>
        </View>
      </View>

      <FlatList
        data={filteredData}
        keyExtractor={item => String(item.id)}
        contentContainerStyle={{ paddingBottom: 20 }}
        renderItem={({ item }) => (
          <View>
            <List.Item
              title={item.description || "Sem descrição"}
              description={`${format(new Date(item.date), 'dd/MM/yyyy')} • ${item.category}`}
              left={props => <List.Icon {...props} icon={item.type === 'income' ? 'cash-plus' : 'cash-minus'} color={item.type === 'income' ? 'green' : 'red'} />}
              right={() => (
                <View style={{ justifyContent: 'center', alignItems: 'flex-end' }}>
                  <Text variant="bodyLarge" style={{ color: item.type === 'income' ? 'green' : 'red', fontWeight: 'bold' }}>
                    {item.type === 'income' ? '+ ' : '- '}R$ {item.amount.toFixed(2)}
                  </Text>
                  {item.is_paid === 0 && <Text variant="labelSmall" style={{color: 'orange'}}>Pendente</Text>}
                </View>
              )}
            />
            <Divider />
          </View>
        )}
        ListEmptyComponent={<Text style={{ textAlign: 'center', marginTop: 30, color: theme.colors.outline }}>Nenhuma transação encontrada.</Text>}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { padding: 16, paddingBottom: 0 },
  filters: { flexDirection: 'row', gap: 8, marginVertical: 10 },
  chip: { flex: 1 },
});