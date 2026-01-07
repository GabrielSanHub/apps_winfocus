import React, { useState, useCallback } from 'react';
import { View, ScrollView, StyleSheet, TouchableOpacity, Alert, Modal, FlatList } from 'react-native';
import { Text, Card, FAB, useTheme, List, Chip, Divider, IconButton, Portal, Dialog, Button } from 'react-native-paper';
import { Calendar, LocaleConfig } from 'react-native-calendars';
import { useRouter, useFocusEffect } from 'expo-router';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

import useFinanceStore from '../../src/store/useFinanceStore';
import { 
    getDashboardData, getTransactionsByDate, getTransactions, 
    processFixedTransactions, getOverdueTransactions, markAsPaid, 
    getForecastData, getMonthTransactionsByType, toggleTransactionStatus 
} from '../../src/database/db';
import ProfileSelector from '../../components/ProfileSelector';

// Configuração PT-BR do Calendário
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
  const { currentProfile, refreshKey, notifyUpdate } = useFinanceStore();
  
  // Estados de Dados
  const [selectedDate, setSelectedDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [data, setData] = useState({ balance: 0, income: {count: 0, total: 0}, expense: {count: 0, total: 0} });
  const [markedDates, setMarkedDates] = useState({});
  const [dayTransactions, setDayTransactions] = useState([]);
  const [overdueItems, setOverdueItems] = useState([]);

  // Estados de Modais
  const [showForecast, setShowForecast] = useState(false);
  const [forecastData, setForecastData] = useState({ income: 0, expense: 0 });
  const [showDetailsType, setShowDetailsType] = useState(null); // 'income' ou 'expense'
  const [detailsList, setDetailsList] = useState([]);

  // Carrega dados sempre que a tela ganha foco ou o perfil/refreshKey muda
  useFocusEffect(
    useCallback(() => {
      if (currentProfile) loadData();
    }, [currentProfile, selectedDate, refreshKey])
  );

  const loadData = () => {
    const monthStr = selectedDate.substring(0, 7); // YYYY-MM
    
    // 1. Processar Transações Fixas (Garante que existam no mês)
    processFixedTransactions(currentProfile.id, selectedDate);

    // 2. Dados do Dashboard (Saldo Realizado + Stats do Mês)
    const dashData = getDashboardData(currentProfile.id, monthStr, currentProfile.settings_balance_mode);
    setData(dashData);

    // 3. Previsão (Forecast) para o Modal
    const fore = getForecastData(currentProfile.id, monthStr);
    let fInc = 0, fExp = 0;
    fore.forEach(r => { if(r.type === 'income') fInc = r.total; else fExp = r.total; });
    setForecastData({ income: fInc, expense: fExp });

    // 4. Contas Atrasadas
    setOverdueItems(getOverdueTransactions(currentProfile.id));

    // 5. Calendário (Pontos Coloridos)
    const allMonthTrans = getTransactions(currentProfile.id, monthStr);
    const marks = {};
    allMonthTrans.forEach(tr => {
      const dotColor = tr.type === 'income' ? '#4CAF50' : '#F44336';
      if (!marks[tr.date]) marks[tr.date] = { dots: [] };
      // Limita a 3 dots para não quebrar layout
      if (marks[tr.date].dots.length < 3) marks[tr.date].dots.push({ color: dotColor });
    });
    
    // Marcação do dia selecionado
    marks[selectedDate] = { 
        ...marks[selectedDate], 
        selected: true, 
        selectedColor: theme.colors.primary, 
        selectedTextColor: '#fff' 
    };
    setMarkedDates(marks);

    // 6. Lista de transações do dia selecionado
    setDayTransactions(getTransactionsByDate(currentProfile.id, selectedDate));
    
    // 7. Se o modal de detalhes estiver aberto, atualiza a lista dele também
    if (showDetailsType) {
        setDetailsList(getMonthTransactionsByType(currentProfile.id, monthStr, showDetailsType));
    }
  };

  const handlePayOverdue = (id) => {
    markAsPaid(id);
    notifyUpdate();
  };

  const openTypeDetails = (type) => {
    const list = getMonthTransactionsByType(currentProfile.id, selectedDate.substring(0, 7), type);
    setDetailsList(list);
    setShowDetailsType(type);
  };

  // Lógica de Toggle (Clicar no ícone de Pago/Recebido na lista detalhada)
  const handleToggleStatus = (item) => {
    toggleTransactionStatus(item.id, item.is_paid);
    notifyUpdate(); // Recarrega tudo para atualizar saldos
  };

  // Navegar para edição
  const handleEdit = (item) => {
    setShowDetailsType(null); // Fecha modal antes de navegar
    // Passa o ID como parâmetro
    router.push({ pathname: '/add-transaction', params: { id: item.id } });
  };

  if (!currentProfile) return <View style={styles.loading}><Text>Carregando perfil...</Text></View>;

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      
      {/* Seletor de Perfil no Topo */}
      <View style={{ backgroundColor: theme.colors.surfaceVariant, paddingBottom: 10 }}>
        <ProfileSelector />
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 120 }}>
        
        {/* Banner de Atrasos (Aparece só se tiver contas vencidas) */}
        {overdueItems.length > 0 && (
            <View style={[styles.overdueContainer, { backgroundColor: theme.colors.errorContainer }]}>
                <Text style={{ color: theme.colors.onErrorContainer, fontWeight: 'bold', marginBottom: 5 }}>
                    ! Pagamento Atrasado ({overdueItems.length})
                </Text>
                {overdueItems.map(item => (
                    <TouchableOpacity 
                        key={item.id} 
                        onPress={() => Alert.alert("Pagar?", `Confirmar pagamento de ${item.description}?`, [{text: "Não"}, {text: "Sim, Pagar", onPress: () => handlePayOverdue(item.id)}])}
                    >
                        <View style={styles.overdueItem}>
                            <Text style={{flex: 1, color: theme.colors.onErrorContainer}}>
                                {format(new Date(item.date), 'dd/MM')} - {item.description}
                            </Text>
                            <Text style={{fontWeight: 'bold', color: theme.colors.onErrorContainer}}>
                                R$ {item.amount.toFixed(2)}
                            </Text>
                        </View>
                    </TouchableOpacity>
                ))}
            </View>
        )}

        {/* Cards Principais */}
        <View style={styles.cardsContainer}>
          {/* Card de Saldo */}
          <Card style={[styles.card, { backgroundColor: theme.colors.secondaryContainer }]}>
            <Card.Content>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text variant="labelLarge">Saldo (Realizado)</Text>
                <TouchableOpacity onPress={() => setShowForecast(true)} style={{flexDirection: 'row', alignItems: 'center'}}>
                    <IconButton icon="chart-line" size={20} />
                    <Text variant="labelSmall" style={{textDecorationLine: 'underline'}}>Previsão</Text>
                </TouchableOpacity>
              </View>
              <Text variant="displaySmall" style={{ fontWeight: 'bold', color: theme.colors.onSecondaryContainer }}>
                R$ {data.balance.toFixed(2)}
              </Text>
              <Text variant="labelSmall" style={{ opacity: 0.6 }}>
                {currentProfile.settings_balance_mode === 'accumulated' ? 'Acumulado Total' : 'Fluxo do Mês'}
              </Text>
            </Card.Content>
          </Card>
          
          {/* Cards de Receita e Despesa (Clicáveis) */}
          <View style={styles.rowCards}>
            <TouchableOpacity style={[styles.miniCardTouch, { backgroundColor: '#E8F5E9' }]} onPress={() => openTypeDetails('income')}>
              <View style={{ padding: 16 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Text style={{ color: '#2E7D32' }}>Receitas</Text>
                    <Chip compact textStyle={{fontSize: 10}}>{data.income.count} itens</Chip>
                </View>
                <Text variant="titleMedium" style={{ marginTop: 5 }}>R$ {data.income.total.toFixed(2)}</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity style={[styles.miniCardTouch, { backgroundColor: '#FFEBEE' }]} onPress={() => openTypeDetails('expense')}>
              <View style={{ padding: 16 }}>
                 <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Text style={{ color: '#C62828' }}>Despesas</Text>
                    <Chip compact textStyle={{fontSize: 10}}>{data.expense.count} itens</Chip>
                </View>
                <Text variant="titleMedium" style={{ marginTop: 5 }}>R$ {data.expense.total.toFixed(2)}</Text>
              </View>
            </TouchableOpacity>
          </View>
        </View>

        {/* Calendário */}
        <Card style={styles.calendarCard}>
          <Calendar
            current={selectedDate}
            onDayPress={day => setSelectedDate(day.dateString)}
            onMonthChange={month => setSelectedDate(month.dateString)}
            markingType={'multi-dot'}
            markedDates={markedDates}
            theme={{
              calendarBackground: theme.colors.surface,
              textSectionTitleColor: theme.colors.onSurface,
              dayTextColor: theme.colors.onSurface,
              monthTextColor: theme.colors.onSurface,
              todayTextColor: theme.colors.primary,
              arrowColor: theme.colors.primary,
            }}
          />
        </Card>

        {/* Lista de Movimentações do Dia Selecionado */}
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
                onPress={() => handleEdit(item)} // Clique rápido para editar
                left={props => <List.Icon {...props} icon={item.type === 'income' ? 'arrow-up-circle' : 'arrow-down-circle'} color={item.type === 'income' ? 'green' : 'red'} />}
                right={() => (
                  <View style={{ alignItems: 'flex-end', justifyContent: 'center' }}>
                    <Text variant="bodyLarge" style={{ fontWeight: 'bold', color: item.type === 'income' ? 'green' : 'red' }}>
                      R$ {item.amount.toFixed(2)}
                    </Text>
                    {item.is_paid === 0 && <Chip textStyle={{fontSize: 10}} style={{height: 20}}>Pendente</Chip>}
                    {item.is_fixed === 1 && <Chip icon="pin" textStyle={{fontSize: 10}} style={{height: 20, marginTop: 2}}>Fixo</Chip>}
                  </View>
                )}
                style={{ backgroundColor: theme.colors.surface, marginBottom: 5, borderRadius: 8 }}
              />
            ))
          )}
        </View>
      </ScrollView>

      {/* Botão Flutuante (FAB) */}
      <FAB
        icon="plus"
        label="Lançar"
        style={[styles.fab, { backgroundColor: theme.colors.primary }]}
        color="white"
        onPress={() => router.push('/add-transaction')}
      />

      {/* Modal de Previsão */}
      <Portal>
        <Dialog visible={showForecast} onDismiss={() => setShowForecast(false)}>
            <Dialog.Title>Previsão do Mês</Dialog.Title>
            <Dialog.Content>
                <Text>Considerando todos os lançamentos (pagos e pendentes) deste mês:</Text>
                <Divider style={{ marginVertical: 10 }} />
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Text style={{ color: 'green' }}>Receita Prevista:</Text>
                    <Text style={{ fontWeight: 'bold' }}>R$ {forecastData.income.toFixed(2)}</Text>
                </View>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 }}>
                    <Text style={{ color: 'red' }}>Despesa Prevista:</Text>
                    <Text style={{ fontWeight: 'bold' }}>R$ {forecastData.expense.toFixed(2)}</Text>
                </View>
                <Divider style={{ marginVertical: 10 }} />
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Text>Saldo Previsto:</Text>
                    <Text style={{ fontWeight: 'bold' }}>R$ {(forecastData.income - forecastData.expense).toFixed(2)}</Text>
                </View>
            </Dialog.Content>
            <Dialog.Actions>
                <Button onPress={() => setShowForecast(false)}>Fechar</Button>
            </Dialog.Actions>
        </Dialog>
      </Portal>

      {/* Modal de Lista Detalhada (Gestão de Pagamentos) */}
      <Modal visible={!!showDetailsType} animationType="slide" transparent={true} onRequestClose={() => setShowDetailsType(null)}>
        <View style={styles.modalFull}>
            <View style={[styles.modalBody, { backgroundColor: theme.colors.background }]}>
                <Text variant="headlineSmall" style={{ padding: 16 }}>
                    {showDetailsType === 'income' ? 'Receitas' : 'Despesas'} - Gerenciar
                </Text>
                
                <FlatList
                    data={detailsList}
                    keyExtractor={item => item.id.toString()}
                    renderItem={({item}) => {
                        // Lógica de Ícones
                        const isPaid = item.is_paid === 1;
                        // Se Receita: Pago = Check Verde. Não Pago = Outline.
                        // Se Despesa: Pago = Check Vermelho. Não Pago = Outline.
                        
                        let iconName = 'checkbox-blank-circle-outline';
                        let iconColor = theme.colors.outline;
                        
                        if (isPaid) {
                            iconName = 'cash-check'; 
                            iconColor = item.type === 'income' ? 'green' : 'red';
                        }

                        return (
                            <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, backgroundColor: theme.colors.surface, marginBottom: 1, paddingVertical: 8 }}>
                                {/* Botão de Toggle Status */}
                                <TouchableOpacity onPress={() => handleToggleStatus(item)} style={{ padding: 8, alignItems: 'center' }}>
                                    <IconButton 
                                        icon={iconName} 
                                        iconColor={iconColor} 
                                        size={28} 
                                        style={{ margin: 0 }}
                                    />
                                    <Text style={{ fontSize: 10, textAlign: 'center', color: iconColor }}>
                                        {isPaid ? (item.type==='income'?'Recebido':'Pago') : (item.type==='income'?'Receber':'Pagar')}
                                    </Text>
                                </TouchableOpacity>

                                {/* Dados da Transação */}
                                <View style={{ flex: 1, marginLeft: 8 }}>
                                    <Text variant="bodyLarge" style={{ fontWeight: 'bold' }}>{item.description}</Text>
                                    <Text variant="bodySmall">{format(new Date(item.date), 'dd/MM')} - {item.category}</Text>
                                </View>

                                <Text style={{ fontWeight: 'bold', marginRight: 10 }}>R$ {item.amount.toFixed(2)}</Text>

                                {/* Botão Editar */}
                                <IconButton icon="pencil" size={20} onPress={() => handleEdit(item)} />
                            </View>
                        );
                    }}
                    ItemSeparatorComponent={Divider}
                />
                <Button mode="contained" onPress={() => setShowDetailsType(null)} style={{ margin: 16 }}>Fechar</Button>
            </View>
        </View>
      </Modal>

    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  loading: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  cardsContainer: { padding: 16 },
  card: { marginBottom: 10 },
  rowCards: { flexDirection: 'row', justifyContent: 'space-between' },
  miniCardTouch: { flex: 0.48, borderRadius: 12, overflow: 'hidden' },
  calendarCard: { marginHorizontal: 16, borderRadius: 12, overflow: 'hidden', elevation: 2 },
  transactionsContainer: { padding: 16 },
  fab: { position: 'absolute', margin: 16, right: 0, bottom: 20 },
  overdueContainer: { padding: 10, margin: 16, borderRadius: 8 },
  overdueItem: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  modalFull: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalBody: { height: '80%', borderTopLeftRadius: 20, borderTopRightRadius: 20 }
});