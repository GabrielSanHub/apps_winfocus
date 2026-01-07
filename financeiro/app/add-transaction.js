import React, { useState, useEffect } from 'react';
import { View, StyleSheet, ScrollView, Alert, Modal, FlatList, TouchableOpacity } from 'react-native';
import { TextInput, Button, SegmentedButtons, HelperText, useTheme, Switch, Text, Menu, List, Divider } from 'react-native-paper';
import DateTimePicker from '@react-native-community/datetimepicker'; 
import { useRouter, useLocalSearchParams } from 'expo-router';
import useFinanceStore from '../src/store/useFinanceStore';
import { addTransaction, getCategories, getTransactionById, updateTransaction } from '../src/database/db';
import * as Notifications from 'expo-notifications';

export default function AddTransaction() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const theme = useTheme();
  const { currentProfile, notifyUpdate } = useFinanceStore();

  const isEditing = !!params.id;

  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState('expense');
  const [category, setCategory] = useState('');
  const [categoriesList, setCategoriesList] = useState([]);
  const [showCatModal, setShowCatModal] = useState(false);
  const [date, setDate] = useState(new Date());
  const [showPicker, setShowPicker] = useState(false);
  
  // --- MUDANÇA PRINCIPAL AQUI ---
  // isDone = true -> Conta Paga/Recebida.
  // isDone = false -> Conta Pendente.
  // Estado inicial = false (Pendente por padrão).
  const [isDone, setIsDone] = useState(false); 
  
  const [repeatMonths, setRepeatMonths] = useState(1);
  const [isFixed, setIsFixed] = useState(false);
  const [showRepeatMenu, setShowRepeatMenu] = useState(false);

  // Carregar dados na Edição
  useEffect(() => {
    if (isEditing && params.id) {
        const tx = getTransactionById(params.id);
        if (tx) {
            setAmount(tx.amount.toString());
            setDescription(tx.description);
            setType(tx.type);
            setCategory(tx.category);
            setDate(new Date(tx.date));
            // Se is_paid for 1 no banco, ativamos o switch
            setIsDone(tx.is_paid === 1);
            if (tx.is_fixed) setIsFixed(true);
        }
    }
  }, [params.id]);

  // Carregar Categorias
  useEffect(() => {
    if (currentProfile) {
        const cats = getCategories(currentProfile.id, type, currentProfile.settings_share_categories);
        setCategoriesList(cats);
        // Seleciona padrão se não estiver editando ou se categoria estiver vazia
        if (!isEditing && cats.length > 0) setCategory(cats[0].name);
        else if (isEditing && !category && cats.length > 0) setCategory(cats[0].name);
    }
  }, [type, currentProfile]);

  const handleSave = async () => {
    if (!amount || !currentProfile) return Alert.alert("Erro", "Preencha o valor.");

    // Lógica Invertida: Se o switch estiver ON (isDone), is_paid = 1. Senão 0.
    const finalStatus = isDone ? 1 : 0;

    const transactionData = {
      profile_id: currentProfile.id,
      amount: parseFloat(amount.replace(',', '.')),
      type,
      category,
      description: description || category,
      date: date.toISOString().split('T')[0],
      is_paid: finalStatus, 
    };

    try {
      if (isEditing) {
        updateTransaction(params.id, transactionData);
        Alert.alert("Sucesso", "Transação atualizada!");
      } else {
        const newTx = {
            ...transactionData,
            repeat_months: isFixed ? 1 : repeatMonths,
            is_fixed: isFixed ? 1 : 0
        };
        addTransaction(newTx);
        
        // Se NÃO estiver marcada como feita (Pendente), agenda notificação
        if (!isDone) {
            await scheduleNotification(newTx.description, date);
        }
      }

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
    
    // Só agenda se a data for futura
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
          disabled={isEditing} 
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

        <TouchableOpacity onPress={() => setShowCatModal(true)}>
            <TextInput
            label="Categoria"
            value={category}
            mode="outlined"
            editable={false}
            right={<TextInput.Icon icon="chevron-down" />}
            style={styles.input}
            />
        </TouchableOpacity>

        <TextInput
          label="Descrição"
          value={description}
          onChangeText={setDescription}
          mode="outlined"
          style={styles.input}
        />

        <Button mode="outlined" onPress={() => setShowPicker(true)} style={styles.input} icon="calendar">
          Data: {date.toLocaleDateString()}
        </Button>
        {showPicker && (
            <DateTimePicker value={date} mode="date" display="default" onChange={(evt, d) => { setShowPicker(false); if(d) setDate(d); }} />
        )}

        {/* Opções de Recorrência (escondidas na edição simples) */}
        {!isEditing && (
            <>
                <View style={styles.row}>
                    <Text variant="bodyLarge">Transação Fixa (Mensal)?</Text>
                    <Switch value={isFixed} onValueChange={(val) => { setIsFixed(val); if(val) setRepeatMonths(1); }} />
                </View>

                {!isFixed && (
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
                            {[1, 2, 3, 6, 12, 24].map(m => (
                                <Menu.Item key={m} onPress={() => { setRepeatMonths(m); setShowRepeatMenu(false); }} title={m === 1 ? "Não repetir" : `${m} meses`} />
                            ))}
                        </Menu>
                    </View>
                )}
            </>
        )}

        <Divider style={{ marginVertical: 10 }} />

        {/* --- Switch de Status --- */}
        <View style={styles.row}>
          <Text variant="titleMedium" style={{ color: isDone ? theme.colors.primary : theme.colors.onSurface }}>
             {type === 'income' ? "Lançar como RECEBIDO" : "Lançar como PAGO"}
          </Text>
          <Switch value={isDone} onValueChange={setIsDone} />
        </View>
        <HelperText type="info" style={{ marginBottom: 20 }}>
            {isDone 
                ? "Entrará no saldo e no extrato como concluído." 
                : "Ficará PENDENTE (ícone laranja) para baixar depois."}
        </HelperText>

      </ScrollView>

      <View style={styles.footer}>
        <Button mode="contained" onPress={handleSave} style={styles.btn}>
            {isEditing ? "Atualizar Transação" : "Salvar Transação"}
        </Button>
      </View>

      {/* Modal de Categoria */}
      <Modal visible={showCatModal} animationType="slide" transparent={true}>
        <View style={styles.modalOverlay}>
            <View style={[styles.modalContent, { backgroundColor: theme.colors.elevation.level3 }]}>
                <Text variant="titleMedium" style={{ padding: 16, textAlign: 'center' }}>Escolha a Categoria</Text>
                <Divider />
                <FlatList
                    data={categoriesList}
                    keyExtractor={item => item.id.toString()}
                    renderItem={({ item }) => (
                        <List.Item 
                            title={item.name} 
                            left={props => <List.Icon {...props} icon={item.icon || 'tag'} />} 
                            onPress={() => { setCategory(item.name); setShowCatModal(false); }} 
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
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginVertical: 5 },
  footer: { padding: 20, borderTopWidth: 1, borderTopColor: '#ccc' },
  btn: { paddingVertical: 6 },
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  modalContent: { height: '50%', borderTopLeftRadius: 20, borderTopRightRadius: 20 }
});