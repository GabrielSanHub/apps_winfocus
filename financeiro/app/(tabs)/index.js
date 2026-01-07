import { format } from 'date-fns';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Calendar, LocaleConfig } from 'react-native-calendars';
import { Card, Chip, FAB, List, Text, useTheme } from 'react-native-paper';

import ProfileSelector from '../../components/ProfileSelector';
import { getDashboardTotals, getTransactions, getTransactionsByDate } from '../../src/database/db';
import useFinanceStore from '../../src/store/useFinanceStore';

// Configuração do Calendário (PT-BR)
LocaleConfig.locales['br'] = {
  monthNames: ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'],
  monthNamesShort: ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'],
  dayNames: ['Domingo','Segunda','Terça','Quarta','Quinta','Sexta','Sábado'],
  dayNamesShort: ['Dom','Seg','Ter','Qua','Qui','Sex','Sab'],
  today: 'Hoje'
};
LocaleConfig.defaultLocale = 'br';

export default function Dashboard() {
  const theme = useTheme();
  const router = useRouter();
  const { currentProfile, refreshKey } = useFinanceStore();
  
  const [selectedDate, setSelectedDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [totals, setTotals] = useState({ income: 0, expense: 0, balance: 0 });
  const [markedDates, setMarkedDates] = useState({});
  const [dayTransactions, setDayTransactions] = useState([]);

  useFocusEffect(
    useCallback(() => {
      if (currentProfile) loadData();
    }, [currentProfile, selectedDate, refreshKey])
  );

  const loadData = () => {
    const monthStr = selectedDate.substring(0, 7);
    
    // 1. Totais
    setTotals(getDashboardTotals(currentProfile.id, monthStr));

    // 2. Marcas do Calendário
    const allMonthTrans = getTransactions(currentProfile.id, monthStr);
    const marks = {};
    allMonthTrans.forEach(tr => {
      const dotColor = tr.type === 'income' ? '#4CAF50' : '#F44336';
      if (!marks[tr.date]) marks[tr.date] = { dots: [] };
      // Evita muitos dots no mesmo dia visualmente
      if (marks[tr.date].dots.length < 3) {
         marks[tr.date].dots.push({ color: dotColor });
      }
    });

    // Marcação do dia selecionado
    marks[selectedDate] = { 
      ...marks[selectedDate], 
      selected: true, 
      selectedColor: theme.colors.primary,
      selectedTextColor: '#fff'
    };
    setMarkedDates(marks);

    // 3. Lista do dia
    setDayTransactions(getTransactionsByDate(currentProfile.id, selectedDate));
  };

  if (!currentProfile) return <View style={styles.loading}><Text>Carregando...</Text></View>;

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      {/* Seletor de Perfil no Topo */}
      <View style={{ backgroundColor: theme.colors.surfaceVariant, paddingBottom: 10 }}>
        <ProfileSelector />
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 80 }}>
        {/* Resumo Financeiro */}
        <View style={styles.cardsContainer}>
          <Card style={[styles.card, { backgroundColor: theme.colors.secondaryContainer }]}>
            <Card.Content>
              <Text variant="labelLarge">Saldo Atual ({currentProfile.name})</Text>
              <Text variant="displaySmall" style={{ fontWeight: 'bold', color: theme.colors.onSecondaryContainer }}>
                R$ {totals.balance.toFixed(2)}
              </Text>
            </Card.Content>
          </Card>
          
          <View style={styles.rowCards}>
            <Card style={[styles.miniCard, { backgroundColor: '#E8F5E9' }]}>
              <Card.Content>
                <Text style={{ color: '#2E7D32' }}>Receitas</Text>
                <Text variant="titleMedium">R$ {totals.income.toFixed(2)}</Text>
              </Card.Content>
            </Card>
            <Card style={[styles.miniCard, { backgroundColor: '#FFEBEE' }]}>
              <Card.Content>
                <Text style={{ color: '#C62828' }}>Despesas</Text>
                <Text variant="titleMedium">R$ {totals.expense.toFixed(2)}</Text>
              </Card.Content>
            </Card>
          </View>
        </View>

        {/* Calendário */}
        <Card style={styles.calendarCard}>
          <Calendar
            current={selectedDate}
            // Atualiza a data selecionada ao clicar num dia
            onDayPress={day => setSelectedDate(day.dateString)}
            // CORREÇÃO CRÍTICA: Atualiza os dados quando o usuário troca o mês (setinhas ou slide)
            onMonthChange={month => setSelectedDate(month.dateString)}
            
            markingType={'multi-dot'}
            markedDates={markedDates}
            theme={{
              calendarBackground: theme.colors.surface,
              textSectionTitleColor: theme.colors.onSurface,
              dayTextColor: theme.colors.onSurface,
              monthTextColor: theme.colors.onSurface, // Garante que o título do mês fique visível
              todayTextColor: theme.colors.primary,
              selectedDayBackgroundColor: theme.colors.primary,
              selectedDayTextColor: theme.colors.onPrimary,
              arrowColor: theme.colors.primary,
              dotStyle: { width: 6, height: 6, marginTop: 2 } // Ajuste visual dos pontos
            }}
          />
        </Card>

        {/* Detalhes do Dia */}
        <View style={styles.transactionsContainer}>
          <Text variant="titleMedium" style={{ marginBottom: 10 }}>
            Movimentações em {format(new Date(selectedDate), "dd/MM")}
          </Text>
          
          {dayTransactions.length === 0 ? (
            <Text style={{ textAlign: 'center', color: theme.colors.outline, marginTop: 10 }}>
              Nada lançado neste dia.
            </Text>
          ) : (
            dayTransactions.map((item) => (
              <List.Item
                key={item.id}
                title={item.description || item.category}
                description={item.category}
                left={props => <List.Icon {...props} icon={item.type === 'income' ? 'arrow-up-circle' : 'arrow-down-circle'} color={item.type === 'income' ? 'green' : 'red'} />}
                right={() => (
                  <View style={{ alignItems: 'flex-end', justifyContent: 'center' }}>
                    <Text variant="bodyLarge" style={{ fontWeight: 'bold', color: item.type === 'income' ? 'green' : 'red' }}>
                      R$ {item.amount.toFixed(2)}
                    </Text>
                    {item.is_paid === 0 && <Chip textStyle={{fontSize: 10}} style={{height: 20}}>Pendente</Chip>}
                  </View>
                )}
                style={{ backgroundColor: theme.colors.surface, marginBottom: 5, borderRadius: 8 }}
              />
            ))
          )}
        </View>
      </ScrollView>

      <FAB
        icon="plus"
        label="Lançar"
        style={[styles.fab, { backgroundColor: theme.colors.primary }]}
        color="white"
        onPress={() => router.push('/add-transaction')}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  loading: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  cardsContainer: { padding: 16 },
  card: { marginBottom: 10 },
  rowCards: { flexDirection: 'row', justifyContent: 'space-between' },
  miniCard: { flex: 0.48 },
  calendarCard: { marginHorizontal: 16, borderRadius: 12, overflow: 'hidden', elevation: 2 },
  transactionsContainer: { padding: 16 },
  fab: { position: 'absolute', margin: 16, right: 0, bottom: 0 },
});