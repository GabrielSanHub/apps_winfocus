import React, { useState, useCallback } from 'react';
import { View, ScrollView, StyleSheet, Dimensions } from 'react-native';
import { Text, Card, useTheme, SegmentedButtons, Divider } from 'react-native-paper';
import { PieChart } from 'react-native-chart-kit';
import { useFocusEffect } from 'expo-router';
import { format } from 'date-fns';
import useFinanceStore from '../../src/store/useFinanceStore';
import { getDashboardData, getAllTimeTotals } from '../../src/database/db';

const screenWidth = Dimensions.get('window').width;

export default function Statistics() {
  const theme = useTheme();
  const { currentProfile, refreshKey } = useFinanceStore();
  
  const [viewMode, setViewMode] = useState('monthly'); // 'monthly' | 'alltime'
  const [stats, setStats] = useState({ income: 0, expense: 0, balance: 0 });

  useFocusEffect(
    useCallback(() => {
      if (currentProfile) loadStats();
    }, [currentProfile, viewMode, refreshKey])
  );

  const loadStats = () => {
    if (viewMode === 'monthly') {
        // Pega dados do mês atual
        const monthStr = format(new Date(), 'yyyy-MM');
        const data = getDashboardData(currentProfile.id, monthStr, 'monthly');
        
        // getDashboardData retorna { balance, income: {total...}, expense: {total...} }
        setStats({
            income: data.income.total,
            expense: data.expense.total,
            balance: data.income.total - data.expense.total
        });
    } else {
        // Pega dados gerais
        const data = getAllTimeTotals(currentProfile.id);
        setStats(data);
    }
  };

  const chartData = [
    {
      name: 'Receitas',
      amount: stats.income,
      color: '#4CAF50',
      legendFontColor: theme.colors.onSurface,
      legendFontSize: 15,
    },
    {
      name: 'Despesas',
      amount: stats.expense,
      color: '#F44336',
      legendFontColor: theme.colors.onSurface,
      legendFontSize: 15,
    },
  ];

  // Tratamento para gráfico vazio
  const hasData = stats.income > 0 || stats.expense > 0;
  const graphData = hasData ? chartData : [{ name: 'Sem dados', amount: 100, color: '#e0e0e0', legendFontColor: '#7F7F7F', legendFontSize: 15 }];

  // Mensagem de Feedback
  const getFeedbackMessage = () => {
    if (!hasData) return "Sem movimentações para analisar.";
    
    if (stats.balance >= 0) {
        return `Tudo certo! Você ainda tem R$ ${stats.balance.toFixed(2)} de saldo positivo ${viewMode === 'monthly' ? 'neste mês' : 'acumulado'}.`;
    } else {
        const deficit = Math.abs(stats.balance);
        return `Atenção! Faltam R$ ${deficit.toFixed(2)} para cobrir as despesas ${viewMode === 'monthly' ? 'deste mês' : 'do total'}.`;
    }
  };

  const isPositive = stats.balance >= 0;

  return (
    <ScrollView style={[styles.container, { backgroundColor: theme.colors.background }]}>
      
      <View style={{ padding: 16 }}>
        <Text variant="headlineMedium" style={{ marginBottom: 16, textAlign: 'center' }}>
            Análise Financeira
        </Text>

        <SegmentedButtons
            value={viewMode}
            onValueChange={setViewMode}
            buttons={[
                { value: 'monthly', label: 'Este Mês' },
                { value: 'alltime', label: 'Todo o Período' },
            ]}
            style={{ marginBottom: 20 }}
        />

        <Card style={styles.card}>
            <Card.Content>
                <Text variant="titleMedium" style={{ textAlign: 'center' }}>
                    Receita vs Despesa ({viewMode === 'monthly' ? 'Mensal' : 'Geral'})
                </Text>
                
                <PieChart
                    data={graphData}
                    width={screenWidth - 64}
                    height={220}
                    chartConfig={{
                        color: (opacity = 1) => `rgba(0, 0, 0, ${opacity})`,
                    }}
                    accessor={"amount"}
                    backgroundColor={"transparent"}
                    paddingLeft={"15"}
                    center={[10, 0]}
                    absolute // Mostra valores absolutos ou tire para porcentagem
                />
            </Card.Content>
        </Card>

        <Card style={[styles.card, { marginTop: 16, backgroundColor: isPositive ? '#E8F5E9' : '#FFEBEE' }]}>
            <Card.Content>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <Text variant="titleLarge" style={{ marginRight: 10 }}>
                        {isPositive ? '😊' : '🚨'}
                    </Text>
                    <View style={{ flex: 1 }}>
                        <Text variant="bodyLarge" style={{ fontWeight: 'bold', color: isPositive ? '#2E7D32' : '#C62828' }}>
                            {getFeedbackMessage()}
                        </Text>
                    </View>
                </View>
            </Card.Content>
        </Card>

        {/* Detalhes Numéricos */}
        <View style={{ marginTop: 20 }}>
            <Text variant="titleMedium">Detalhes:</Text>
            <View style={styles.row}>
                <Text>Total Receitas:</Text>
                <Text style={{ color: 'green', fontWeight: 'bold' }}>R$ {stats.income.toFixed(2)}</Text>
            </View>
            <Divider />
            <View style={styles.row}>
                <Text>Total Despesas:</Text>
                <Text style={{ color: 'red', fontWeight: 'bold' }}>R$ {stats.expense.toFixed(2)}</Text>
            </View>
            <Divider />
            <View style={styles.row}>
                <Text style={{ fontWeight: 'bold' }}>Resultado:</Text>
                <Text style={{ fontWeight: 'bold', color: isPositive ? 'green' : 'red' }}>
                    R$ {stats.balance.toFixed(2)}
                </Text>
            </View>
        </View>

      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  card: { borderRadius: 12 },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 12 }
});