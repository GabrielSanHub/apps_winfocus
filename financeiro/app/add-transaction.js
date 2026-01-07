import DateTimePicker from '@react-native-community/datetimepicker';
import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, FlatList, Modal, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Button, Divider, List, Menu, SegmentedButtons, Switch, Text, TextInput, useTheme } from 'react-native-paper';
import { addTransaction, getCategories } from '../src/database/db'; // Importe getCategories
import useFinanceStore from '../src/store/useFinanceStore';

export default function AddTransaction() {
  const router = useRouter();
  const theme = useTheme();
  const { currentProfile, notifyUpdate } = useFinanceStore();

  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState('expense');
  
  // Categorias
  const [category, setCategory] = useState('');
  const [categoriesList, setCategoriesList] = useState([]);
  const [showCatModal, setShowCatModal] = useState(false);

  const [date, setDate] = useState(new Date());
  const [showPicker, setShowPicker] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [repeatMonths, setRepeatMonths] = useState(1);
  const [showRepeatMenu, setShowRepeatMenu] = useState(false);

  // Carregar categorias quando o tipo (Receita/Despesa) mudar
  useEffect(() => {
    const cats = getCategories(type);
    setCategoriesList(cats);
    if (cats.length > 0) setCategory(cats[0].name); // Seleciona a primeira por padrão
  }, [type]);

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
      description: description || category, // Se não tiver descrição, usa o nome da categoria
      date: date.toISOString().split('T')[0],
      is_paid: isPending ? 0 : 1,
      repeat_months: repeatMonths
    };

    try {
      addTransaction(transactionData);
      if (isPending) await scheduleNotification(transactionData.description, date);
      notifyUpdate();
      router.back();
    } catch (e) {
      console.error(e);
      Alert.alert("Erro", "Falha ao salvar.");
    }
  };

  const scheduleNotification = async (title, triggerDate) => {
    const notifDate = new Date(triggerDate);
    notifDate.setDate(notifDate.getDate() - 1);
    notifDate.setHours(9, 0, 0, 0);
    if (notifDate.getTime() <= Date.now()) return;

    await Notifications.scheduleNotificationAsync({
      content: { title: "Lembrete Financeiro", body: `Vencimento amanhã: ${title}` },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: notifDate },
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

        {/* Seletor de Categoria */}
        <TouchableOpacity onPress={() => setShowCatModal(true)}>
            <TextInput
            label="Categoria"
            value={category}
            mode="outlined"
            editable={false} // Bloqueia digitação, obriga clique
            right={<TextInput.Icon icon="chevron-down" />}
            style={styles.input}
            />
        </TouchableOpacity>

        <TextInput
          label="Descrição (Opcional)"
          value={description}
          onChangeText={setDescription}
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
            onChange={(evt, selectedDate) => {
              setShowPicker(false);
              if (selectedDate) setDate(selectedDate);
            }}
          />
        )}

        {/* Repetição */}
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
                {[1, 2, 3, 6, 12].map(m => (
                    <Menu.Item key={m} onPress={() => { setRepeatMonths(m); setShowRepeatMenu(false); }} title={m === 1 ? "Não repetir" : `${m} meses`} />
                ))}
            </Menu>
        </View>

        <View style={styles.row}>
          <Text variant="bodyLarge">Pendente / Agendado?</Text>
          <Switch value={isPending} onValueChange={setIsPending} />
        </View>

      </ScrollView>

      <View style={styles.footer}>
        <Button mode="contained" onPress={handleSave} style={styles.btn}>
          Salvar
        </Button>
      </View>

      {/* Modal de Seleção de Categoria */}
      <Modal visible={showCatModal} animationType="slide" transparent={true}>
        <View style={styles.modalOverlay}>
            <View style={[styles.modalContent, { backgroundColor: theme.colors.elevation.level3 }]}>
                <Text variant="titleMedium" style={{ padding: 16 }}>Selecione uma Categoria</Text>
                <FlatList
                    data={categoriesList}
                    keyExtractor={item => item.id.toString()}
                    renderItem={({ item }) => (
                        <List.Item
                            title={item.name}
                            left={props => <List.Icon {...props} icon={item.icon || 'tag'} />}
                            onPress={() => {
                                setCategory(item.name);
                                setShowCatModal(false);
                            }}
                        />
                    )}
                    ItemSeparatorComponent={Divider}
                />
                <Button onPress={() => setShowCatModal(false)} style={{ margin: 10 }}>Cancelar</Button>
            </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 20 },
  input: { marginBottom: 15 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginVertical: 10 },
  footer: { padding: 20, borderTopWidth: 1, borderTopColor: '#ccc' },
  btn: { paddingVertical: 6 },
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  modalContent: { height: '50%', borderTopLeftRadius: 20, borderTopRightRadius: 20 }
});