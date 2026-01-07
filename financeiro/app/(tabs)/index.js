import React, { useState, useCallback } from 'react';
import { View, ScrollView, StyleSheet, TouchableOpacity, Alert, Modal, FlatList, Dimensions } from 'react-native';
import { Text, Card, FAB, useTheme, List, Chip, Divider, IconButton, Portal, Dialog, Button, SegmentedButtons } from 'react-native-paper';
import { Calendar, LocaleConfig } from 'react-native-calendars';
import { PieChart } from 'react-native-chart-kit'; // Importando Gráfico
import { useRouter, useFocusEffect } from 'expo-router';
import { format, addMonths, subMonths, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';

import useFinanceStore from '../../src/store/useFinanceStore';
import { 
    getDashboardData, getTransactionsByDate, getTransactions, 
    processFixedTransactions, getOverdueTransactions, markAsPaid, 
    getForecastData, getMonthTransactionsByType, toggleTransactionStatus 
} from '../../src/database/db';

// Configurações
LocaleConfig.locales['br'] = {
  monthNames: ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'],
  monthNamesShort: ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'],
  dayNames: ['Domingo','Segunda','Terça','Quarta','Quinta','Sexta','Sábado'],
  dayNamesShort: ['Dom','Seg','Ter','Qua','Qui','Sex','Sab'],
  today: 'Hoje'
};
LocaleConfig.defaultLocale = 'br';

const screenWidth = Dimensions.get('window').width;

export default function Dashboard() {
  const theme = useTheme();
  const router = useRouter();
  const { currentProfile, refreshKey, notifyUpdate } = useFinanceStore();
  
  // Controle de Data via Header Personalizado
  const [selectedDate, setSelectedDate] = useState(format(new Date(), 'yyyy-MM-dd')); // Data completa selecionada
  const [viewMonth, setViewMonth] = useState(new Date()); // Objeto Date controlando o Mês visualizado

  // Dados
const [data, setData] = useState({ 
      balance: 0, 
      income: {total: 0, received: 0, pending: 0, count: 0}, 
      expense: {total: 0, paid: 0, pending: 0, count: 0},
      counts: { incPaid: 0, incPend: 0, expPaid: 0, expPend: 0 }
  });
  const [markedDates, setMarkedDates] = useState({});
  const [dayTransactions, setDayTransactions] = useState([]);
  const [overdueItems, setOverdueItems] = useState([]);

  // Modals
  const [showForecast, setShowForecast] = useState(false);
  const [showOverdueModal, setShowOverdueModal] = useState(false);
  const [forecastData, setForecastData] = useState({ income: 0, expense: 0 });
  const [showDetailsType, setShowDetailsType] = useState(null); 
  const [detailsList, setDetailsList] = useState([]);

  useFocusEffect(
    useCallback(() => {
      if (currentProfile) loadData();
    }, [currentProfile, selectedDate, viewMonth, refreshKey])
  );

  const loadData = () => {
    // Usamos o mês visualizado no header (viewMonth) para carregar os dados macro
    const monthStr = format(viewMonth, 'yyyy-MM');
    
    // Processa fixos para o mês visualizado
    processFixedTransactions(currentProfile.id, format(viewMonth, 'yyyy-MM-dd'));

    const dashData = getDashboardData(currentProfile.id, monthStr, currentProfile.settings_balance_mode);
    setData(dashData);

    const fore = getForecastData(currentProfile.id, monthStr);
    let fInc = 0, fExp = 0;
    fore.forEach(r => { if(r.type === 'income') fInc = r.total; else fExp = r.total; });
    setForecastData({ income: fInc, expense: fExp });

    setOverdueItems(getOverdueTransactions(currentProfile.id));

    // Calendário
    const allMonthTrans = getTransactions(currentProfile.id, monthStr);
    
    const counts = {
        incPaid: allMonthTrans.filter(t => t.type === 'income' && t.is_paid).length,
        incPend: allMonthTrans.filter(t => t.type === 'income' && !t.is_paid).length,
        expPaid: allMonthTrans.filter(t => t.type === 'expense' && t.is_paid).length,
        expPend: allMonthTrans.filter(t => t.type === 'expense' && !t.is_paid).length,
    };

    // Atualiza o estado mesclando os dados do dashboard com as contagens
    setData({ ...dashData, counts });

    const marks = {};
    allMonthTrans.forEach(tr => {
      const dotColor = tr.type === 'income' ? '#4CAF50' : '#F44336';
      if (!marks[tr.date]) marks[tr.date] = { dots: [] };
      if (marks[tr.date].dots.length < 3) marks[tr.date].dots.push({ color: dotColor });
    });
    
    // Marca o dia selecionado (apenas se ele pertencer ao mês atual visualizado)
    if (selectedDate.startsWith(monthStr)) {
        marks[selectedDate] = { ...marks[selectedDate], selected: true, selectedColor: theme.colors.primary, selectedTextColor: '#fff' };
    }
    setMarkedDates(marks);

    // Carrega lista do dia selecionado
    setDayTransactions(getTransactionsByDate(currentProfile.id, selectedDate));
    
    if (showDetailsType) {
        setDetailsList(getMonthTransactionsByType(currentProfile.id, monthStr, showDetailsType));
    }
  };

  // --- Navegação do Mês ---
  const changeMonth = (direction) => {
    const newDate = direction === 'next' ? addMonths(viewMonth, 1) : subMonths(viewMonth, 1);
    setViewMonth(newDate);
    // Ao mudar mês, seleciona o dia 1 daquele mês por padrão
    setSelectedDate(format(newDate, 'yyyy-MM-01')); 
  };

  const handlePayOverdue = (id) => {
    markAsPaid(id);
    notifyUpdate();
  };

  const openTypeDetails = (type) => {
    const monthStr = format(viewMonth, 'yyyy-MM');
    const list = getMonthTransactionsByType(currentProfile.id, monthStr, type);
    setDetailsList(list);
    setShowDetailsType(type);
  };

  const handleToggleStatus = (item) => {
    toggleTransactionStatus(item.id, item.is_paid);
    notifyUpdate(); 
  };

  const handleEdit = (item) => {
    setShowDetailsType(null); 
    router.push({ pathname: '/add-transaction', params: { id: item.id } });
  };

  // Configuração dos Gráficos Pizza
  const chartConfig = {
    color: (opacity = 1) => `rgba(0, 0, 0, ${opacity})`,
  };

  const labelColor = theme.colors.onSurface;

// Gráfico Receita
  const incomeChartData = [
    { 
        // Adiciona (x) ao nome. A porcentagem é adicionada automaticamente pelo gráfico
        name: `Recebido (${data.counts?.incPaid || 0})`, 
        amount: data.income.received, 
        color: '#4CAF50', 
        legendFontColor: labelColor, 
        legendFontSize: 12 
    },
    { 
        name: `Pendente (${data.counts?.incPend || 0})`, 
        amount: data.income.pending, 
        color: theme.dark ? '#B0BEC5' : '#E0E0E0', // Cinza claro para contraste no modo claro/escuro
        legendFontColor: labelColor, 
        legendFontSize: 12 
    },
  ];

// Gráfico Despesa
  const expenseChartData = [
    { 
        name: `Pago (${data.counts?.expPaid || 0})`, 
        amount: data.expense.paid, 
        color: '#F44336', 
        legendFontColor: labelColor, 
        legendFontSize: 12 
    },
    { 
        name: `Pendente (${data.counts?.expPend || 0})`, 
        amount: data.expense.pending, 
        color: theme.dark ? '#B0BEC5' : '#E0E0E0', 
        legendFontColor: labelColor, 
        legendFontSize: 12 
    },
  ];

  // Evita crash de gráfico vazio
  const safeIncomeData = data.income.total > 0 ? incomeChartData : [{name:'-', amount:1, color:'#eee'}];
  const safeExpenseData = data.expense.total > 0 ? expenseChartData : [{name:'-', amount:1, color:'#eee'}];

  if (!currentProfile) return <View style={styles.loading}><Text>Carregando...</Text></View>;

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      
      {/* 1. Header Fixo: Perfil e Navegação de Mês */}
      <View style={{ backgroundColor: theme.colors.surfaceVariant, paddingTop: 20, paddingBottom: 1, elevation: 4, zIndex: 10 }}>
        
        {/* Navegação de Mês Customizada */}
        <View style={styles.monthHeader}>
            <IconButton icon="chevron-left" onPress={() => changeMonth('prev')} />
            <Text variant="headlineSmall" style={{ fontWeight: 'bold', textTransform: 'capitalize' }}>
                {format(viewMonth, "MMMM yyyy", { locale: ptBR })}
            </Text>
            <IconButton icon="chevron-right" onPress={() => changeMonth('next')} />
        </View>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 100 }}>
        
        {/* Banner de Atrasos (Se houver) */}
        {overdueItems.length > 0 && (
            <TouchableOpacity onPress={() => setShowOverdueModal(true)} style={[styles.overdueBanner, { backgroundColor: theme.colors.errorContainer }]}>
                 <Text style={{ color: theme.colors.onErrorContainer, fontWeight: 'bold' }}>
                    ! Existem {overdueItems.length} contas atrasadas. Toque para ver.
                </Text>
            </TouchableOpacity>
        )}

        <View style={styles.cardsContainer}>
          
{/* Card de Saldo */}
          <Card style={[styles.card, { backgroundColor: theme.colors.secondaryContainer }]}>
            {/* 1. Redução do padding vertical para compactar a altura */}
            <Card.Content style={{ paddingVertical: 12 }}>
              
              <View style={{ alignItems: 'center' }}>
                  <Text variant="labelLarge" style={{ marginBottom: 4 }}>Saldo Disponível (Realizado)</Text>
                  
                  {/* 2. Texto do valor levemente reduzido (de displaySmall para headlineLarge) */}
                  <Text variant="headlineLarge" style={{ fontWeight: 'bold', color: theme.colors.onSecondaryContainer }}>
                    R$ {data.balance.toFixed(2)}
                  </Text>
              </View>
              
              {/* Divider com margem reduzida */}
              <Divider style={{ marginVertical: 8, backgroundColor: theme.colors.outlineVariant }} />
              
              {/* Botões (já com a lógica de ícones implementada anteriormente) */}
              <View style={{ flexDirection: 'row', justifyContent: 'space-around' }}>
                  <Button 
                    mode="text" 
                    icon="chart-line" 
                    compact 
                    onPress={() => setShowForecast(true)}
                  >
                    Ver Previsão
                  </Button>
                  
                  <Button 
                    mode="text" 
                    icon="clock-alert-outline" 
                    compact 
                    textColor={theme.colors.error} 
                    onPress={() => setShowOverdueModal(true)}
                  >
                    Atrasadas ({overdueItems.length})
                  </Button>
              </View>
            </Card.Content>
          </Card>
          
{/* Card Receita */}
          <Card style={[styles.card, { backgroundColor: theme.dark ? '#1b3a1b' : '#E8F5E9' }]} onPress={() => openTypeDetails('income')}>
            {/* Reduzi o padding vertical interno do Card */}
            <Card.Content style={{ paddingVertical: 2 }}> 
                
                {/* 1. Cabeçalho Compacto */}
                <View style={{ marginBottom: 0 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Text variant="titleMedium" style={{ color: theme.dark ? '#81c784' : '#2E7D32', fontWeight: 'bold' }}>Receitas</Text>
                        <Text variant="titleMedium" style={{ fontWeight: 'bold' }}>R$ {data.income.total.toFixed(2)}</Text>
                    </View>
                    <Divider style={{ marginVertical: 5, backgroundColor: theme.dark ? '#2E7D32' : '#C8E6C9' }} />
                </View>

                {/* 2. Corpo Compacto */}
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    
                    {/* ESQUERDA: Valores e Legenda */}
                    <View style={{ flex: 1, marginRight: 8 }}>
                         <View style={{ marginBottom: 2 }}>
                            <Text variant="bodyMedium" style={{ color: theme.dark ? '#81c784' : '#2E7D32', marginBottom: 0, lineHeight: 20 }}>
                                Recebido: <Text style={{fontWeight:'bold'}}>R$ {data.income.received.toFixed(2)}</Text>
                            </Text>
                            <Text variant="bodyMedium" style={{ opacity: 0.7, lineHeight: 20 }}>
                                A Receber: R$ {data.income.pending.toFixed(2)}
                            </Text>
                         </View>

                         {/* Legenda mais justa */}
                         <View>
                            {safeIncomeData.map((item, index) => (
                                <View key={index} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 1 }}>
                                    <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: item.color, marginRight: 6 }} />
                                    <Text variant="labelSmall" style={{ color: theme.colors.onSurface }}>
                                        {item.name}: {((item.amount / (data.income.total || 1)) * 100).toFixed(0)}%
                                    </Text>
                                </View>
                            ))}
                         </View>
                    </View>

                    {/* DIREITA: Gráfico */}
                    <View style={{ alignItems: 'center' }}>
                        <PieChart
                            data={safeIncomeData}
                            width={100} 
                            height={100}
                            chartConfig={chartConfig}
                            accessor={"amount"}
                            backgroundColor={"transparent"}
                            paddingLeft={"25"} 
                            center={[0, 0]}
                            hasLegend={false} 
                        />
                    </View>

                </View>
            </Card.Content>
          </Card>

          {/* Card Despesa */}
          <Card style={[styles.card, { backgroundColor: theme.dark ? '#3e1b1b' : '#FFEBEE' }]} onPress={() => openTypeDetails('expense')}>
             <Card.Content style={{ paddingVertical: 2 }}>
                {/* 1. Cabeçalho Compacto */}
                <View style={{ marginBottom: 0 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Text variant="titleMedium" style={{ color: theme.dark ? '#e57373' : '#C62828', fontWeight: 'bold' }}>Despesas</Text>
                        <Text variant="titleMedium" style={{ fontWeight: 'bold' }}>R$ {data.expense.total.toFixed(2)}</Text>
                    </View>
                    <Divider style={{ marginVertical: 5, backgroundColor: theme.dark ? '#C62828' : '#FFCDD2' }} />
                </View>

                {/* 2. Corpo Compacto */}
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    
                    {/* ESQUERDA */}
                    <View style={{ flex: 1, marginRight: 8 }}>
                         <View style={{ marginBottom: 6 }}>
                            <Text variant="bodyMedium" style={{ color: theme.dark ? '#e57373' : '#C62828', marginBottom: 0, lineHeight: 20 }}>
                                Pago: <Text style={{fontWeight:'bold'}}>R$ {data.expense.paid.toFixed(2)}</Text>
                            </Text>
                            <Text variant="bodyMedium" style={{ opacity: 0.7, lineHeight: 20 }}>
                                A Pagar: R$ {data.expense.pending.toFixed(2)}
                            </Text>
                         </View>

                         {/* Legenda */}
                         <View>
                            {safeExpenseData.map((item, index) => (
                                <View key={index} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 1 }}>
                                    <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: item.color, marginRight: 6 }} />
                                    <Text variant="labelSmall" style={{ color: theme.colors.onSurface }}>
                                        {item.name}: {((item.amount / (data.expense.total || 1)) * 100).toFixed(0)}%
                                    </Text>
                                </View>
                            ))}
                         </View>
                    </View>

                    {/* DIREITA */}
                    <View style={{ alignItems: 'center' }}>
                        <PieChart
                            data={safeExpenseData}
                            width={100}
                            height={100}
                            chartConfig={chartConfig}
                            accessor={"amount"}
                            backgroundColor={"transparent"}
                            paddingLeft={"25"}
                            center={[0, 0]}
                            hasLegend={false}
                        />
                    </View>

                </View>
            </Card.Content>
          </Card>

        </View>

        {/* Calendário (Sem Header Padrão) */}
        <Card style={styles.calendarCard}>
          <Calendar
            // Usa a data do header (viewMonth) como referência
            current={format(viewMonth, 'yyyy-MM-dd')} 
            
            // Oculta o header padrão pois criamos um customizado no topo
            renderHeader={() => null} 
            
            onDayPress={day => {
                // Se clicar num dia de outro mês, muda a view também
                const dayDate = new Date(day.timestamp); // ajustado para evitar timezone bug básico
                const dayStr = day.dateString;
                
                if (dayStr.substring(0,7) !== format(viewMonth, 'yyyy-MM')) {
                    setViewMonth(new Date(dayStr));
                }
                setSelectedDate(dayStr);
            }}
            markingType={'multi-dot'}
            markedDates={markedDates}
theme={{
              // DESIGN ADAPTATIVO (Usa cores do tema)
              calendarBackground: theme.colors.elevation.level1, // Fundo correto no dark/light
              textSectionTitleColor: theme.colors.onSurfaceVariant,
              dayTextColor: theme.colors.onSurface,
              todayTextColor: theme.colors.primary,
              selectedDayBackgroundColor: theme.colors.primary,
              selectedDayTextColor: theme.colors.onPrimary,
              arrowColor: theme.colors.primary,
              monthTextColor: theme.colors.onSurface,
              indicatorColor: theme.colors.primary,
              textDisabledColor: theme.colors.surfaceDisabled,
              'stylesheet.calendar.header': {
                header: { height: 0, opacity: 0 }
              }
            }}
          />
        </Card>

        {/* Lista do Dia */}
        <View style={styles.transactionsContainer}>
          <Text variant="titleMedium" style={{ marginBottom: 10 }}>
            Movimentações em {format(new Date(selectedDate), "dd 'de' MMMM", { locale: ptBR })}
          </Text>
          {dayTransactions.length === 0 ? (
            <Text style={{ textAlign: 'center', color: theme.colors.outline, marginTop: 10 }}>
              Nenhuma movimentação neste dia.
            </Text>
          ) : (
            dayTransactions.map((item) => (
              <List.Item
                key={item.id}
                title={item.description || item.category}
                description={item.category}
                onPress={() => handleEdit(item)}
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

      <FAB icon="plus" label="" style={[styles.fab, { backgroundColor: theme.colors.primary }]} color="white" onPress={() => router.push('/add-transaction')} />

{/* Modal Previsão */}
      <Portal>
        <Dialog visible={showForecast} onDismiss={() => setShowForecast(false)}>
            {/* ADICIONADO: { locale: ptBR } para traduzir o mês */}
            <Dialog.Title>Previsão {format(viewMonth, 'MMMM', { locale: ptBR })}</Dialog.Title>
            
            <Dialog.Content>
                <Text>Valores projetados (Pago + Pendente):</Text>
                <Divider style={{ marginVertical: 10 }} />
                <View style={styles.rowBetween}><Text style={{ color: 'green' }}>Receita Total:</Text><Text>R$ {forecastData.income.toFixed(2)}</Text></View>
                <View style={styles.rowBetween}><Text style={{ color: 'red' }}>Despesa Total:</Text><Text>R$ {forecastData.expense.toFixed(2)}</Text></View>
                <Divider style={{ marginVertical: 10 }} />
                <View style={styles.rowBetween}><Text>Saldo Projetado:</Text><Text style={{fontWeight:'bold'}}>R$ {(forecastData.income - forecastData.expense).toFixed(2)}</Text></View>
            </Dialog.Content>
            <Dialog.Actions><Button onPress={() => setShowForecast(false)}>Ok</Button></Dialog.Actions>
        </Dialog>
      </Portal>

      {/* Modal Atrasadas */}
      <Modal visible={showOverdueModal} animationType="slide" transparent={true} onRequestClose={() => setShowOverdueModal(false)}>
        <View style={styles.modalFull}>
            <View style={[styles.modalBody, { backgroundColor: theme.colors.background }]}>
                <Text variant="headlineSmall" style={{ padding: 16, color: theme.colors.error }}>Contas Atrasadas</Text>
                {overdueItems.length === 0 ? <Text style={{padding:20}}>Nenhuma conta atrasada.</Text> : (
                    <FlatList
                        data={overdueItems}
                        keyExtractor={item => item.id.toString()}
                        renderItem={({item}) => (
                            <List.Item
                                title={item.description}
                                description={`Venceu em: ${format(new Date(item.date), 'dd/MM/yyyy')}`}
                                left={props => <List.Icon {...props} icon="alert-circle" color="red" />}
                                right={() => <Button mode="contained-tonal" compact onPress={() => { handlePayOverdue(item.id); setShowOverdueModal(false); }}>Pagar</Button>}
                            />
                        )}
                    />
                )}
                <Button onPress={() => setShowOverdueModal(false)} style={{ margin: 16 }}>Fechar</Button>
            </View>
        </View>
      </Modal>

      {/* Modal Lista Detalhada (Inalterado) */}
      <Modal visible={!!showDetailsType} animationType="slide" transparent={true} onRequestClose={() => setShowDetailsType(null)}>
        <View style={styles.modalFull}>
            <View style={[styles.modalBody, { backgroundColor: theme.colors.background }]}>
                <Text variant="headlineSmall" style={{ padding: 16 }}>
                    {showDetailsType === 'income' ? 'Receitas' : 'Despesas'} do Mês
                </Text>
                <FlatList
                    data={detailsList}
                    keyExtractor={item => item.id.toString()}
                    renderItem={({item}) => {
                        const isPaid = item.is_paid === 1;
                        let iconName = isPaid ? 'cash-check' : 'checkbox-blank-circle-outline';
                        let iconColor = isPaid ? (item.type==='income'?'green':'red') : theme.colors.outline;
                        
                        return (
                            <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, backgroundColor: theme.colors.surface, marginBottom: 1, paddingVertical: 8 }}>
                                <TouchableOpacity onPress={() => handleToggleStatus(item)} style={{ padding: 8, alignItems: 'center' }}>
                                    <IconButton icon={iconName} iconColor={iconColor} size={28} style={{ margin: 0 }} />
                                    <Text style={{ fontSize: 9, color: iconColor }}>{isPaid ? 'Ok' : 'Pago'}</Text>
                                </TouchableOpacity>
                                <View style={{ flex: 1, marginLeft: 8 }}>
                                    <Text variant="bodyLarge" style={{ fontWeight: 'bold' }}>{item.description}</Text>
                                    <Text variant="bodySmall">{format(new Date(item.date), 'dd/MM')} - {item.category}</Text>
                                </View>
                                <Text style={{ fontWeight: 'bold', marginRight: 10 }}>R$ {item.amount.toFixed(2)}</Text>
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
  monthHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 5 },
  cardsContainer: { padding: 16 },
  card: { marginBottom: 12 },
  calendarCard: { marginHorizontal: 16, borderRadius: 12, overflow: 'hidden', elevation: 2 },
  transactionsContainer: { padding: 16 },
  fab: { position: 'absolute', margin: 16, right: 0, bottom: 20 },
  overdueBanner: { padding: 10, marginHorizontal: 16, marginTop: 10, borderRadius: 8, alignItems: 'center' },
  linkButton: { padding: 5 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 },
  modalFull: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalBody: { height: '85%', borderTopLeftRadius: 20, borderTopRightRadius: 20 }
});