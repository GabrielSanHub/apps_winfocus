import DateTimePicker from '@react-native-community/datetimepicker';
import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';
import { Button, HelperText, Menu, SegmentedButtons, Switch, Text, TextInput, useTheme } from 'react-native-paper';
import { addTransaction } from '../src/database/db';
import useFinanceStore from '../src/store/useFinanceStore';

export default function AddTransaction() {
  const router = useRouter();
  const theme = useTheme();
  const { currentProfile, notifyUpdate } = useFinanceStore();

  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState('expense');
  const [category, setCategory] = useState('Alimentação');
  
  const [date, setDate] = useState(new Date());
  const [showPicker, setShowPicker] = useState(false);
  const [isPending, setIsPending] = useState(false);

  // Lógica de Repetição
  const [repeatMonths, setRepeatMonths] = useState(1);
  const [showRepeatMenu, setShowRepeatMenu] = useState(false);

  const handleSave = async () => {
    if (!amount || !currentProfile) {
        Alert.alert("Erro", "Preencha o valor.");
        return;
    }

    const transactionData = {
      profile_id: currentProfile.id,
      amount: parseFloat(amount.replace(',', '.')),
      type,
      category,
      description,
      date: date.toISOString().split('T')[0],
      is_paid: isPending ? 0 : 1,
      repeat_months: repeatMonths
    };

    try {
      addTransaction(transactionData);

      // CORREÇÃO DA NOTIFICAÇÃO: trigger object
      if (isPending) {
        await scheduleNotification(description || category, date);
      }

      notifyUpdate();
      router.back();
    } catch (e) {
      console.error(e);
      Alert.alert("Erro", "Falha ao salvar transação.");
    }
  };

  const scheduleNotification = async (title, triggerDate) => {
    // Define horário da notificação para 9:00 AM do dia anterior
    const notifDate = new Date(triggerDate);
    notifDate.setDate(notifDate.getDate() - 1);
    notifDate.setHours(9, 0, 0, 0);

    // Se a data já passou, não agenda
    if (notifDate.getTime() <= Date.now()) return;

    await Notifications.scheduleNotificationAsync({
      content: {
        title: "Lembrete de Conta 📅",
        body: `Amanhã vence: ${title}`,
        sound: true
      },
      trigger: { 
        type: Notifications.SchedulableTriggerInputTypes.DATE, // TIPO EXPLÍCITO OBRIGATÓRIO
        date: notifDate 
      },
    });
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <ScrollView contentContainerStyle={styles.content}>
        
        <SegmentedButtons
          value={type}
          onValueChange={setType}
          buttons={[
            { value: 'income', label: 'Receita', icon: 'arrow-up' },
            { value: 'expense', label: 'Despesa', icon: 'arrow-down' },
          ]}
          style={{ marginBottom: 20 }}
        />

        <TextInput
          label="Valor"
          value={amount}
          onChangeText={setAmount}
          keyboardType="numeric"
          mode="outlined"
          left={<TextInput.Affix text="R$ " />}
          style={styles.input}
        />

        <TextInput
          label="Descrição"
          value={description}
          onChangeText={setDescription}
          mode="outlined"
          style={styles.input}
        />

        <TextInput
          label="Categoria"
          value={category}
          onChangeText={setCategory}
          mode="outlined"
          style={styles.input}
        />

        {/* Data */}
        <Button mode="outlined" onPress={() => setShowPicker(true)} style={styles.input} icon="calendar">
          Data: {date.toLocaleDateString()}
        </Button>
        {showPicker && (
          <DateTimePicker
            value={date}
            mode="date"
            display="default"
            onChange={(event, selectedDate) => {
              setShowPicker(false);
              if (selectedDate) setDate(selectedDate);
            }}
          />
        )}

        {/* Repetição (Dropdown) */}
        <View style={styles.input}>
            <Menu
                visible={showRepeatMenu}
                onDismiss={() => setShowRepeatMenu(false)}
                anchor={
                    <Button mode="outlined" onPress={() => setShowRepeatMenu(true)} icon="refresh">
                        {repeatMonths === 1 ? "Não repetir" : `Repetir por ${repeatMonths} meses`}
                    </Button>
                }
            >
                <Menu.Item onPress={() => { setRepeatMonths(1); setShowRepeatMenu(false); }} title="Não repetir" />
                <Menu.Item onPress={() => { setRepeatMonths(2); setShowRepeatMenu(false); }} title="2 meses" />
                <Menu.Item onPress={() => { setRepeatMonths(3); setShowRepeatMenu(false); }} title="3 meses" />
                <Menu.Item onPress={() => { setRepeatMonths(6); setShowRepeatMenu(false); }} title="6 meses" />
                <Menu.Item onPress={() => { setRepeatMonths(12); setShowRepeatMenu(false); }} title="12 meses (1 ano)" />
            </Menu>
        </View>

        <View style={styles.row}>
          <Text variant="bodyLarge">Agendar / Pendente?</Text>
          <Switch value={isPending} onValueChange={setIsPending} />
        </View>
        <HelperText type="info">
           Ativa notificação para 1 dia antes.
        </HelperText>

      </ScrollView>

      <View style={styles.footer}>
        <Button mode="contained" onPress={handleSave} style={styles.btn}>
          Salvar Lançamento
        </Button>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 20 },
  input: { marginBottom: 15 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginVertical: 10 },
  footer: { padding: 20, borderTopWidth: 1, borderTopColor: '#ccc' },
  btn: { paddingVertical: 6 }
});