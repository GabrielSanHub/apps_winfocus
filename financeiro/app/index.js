// app/index.js
import React, { useEffect, useState } from 'react';
import { View, FlatList, StyleSheet, Alert, Platform } from 'react-native';
import { Appbar, TextInput, Button, Card, Text } from 'react-native-paper';
import { useTaskStore } from '../src/store/useTaskStore';

export default function Home() {
  // Pega as funções e o estado do nosso Store (Zustand)
  const { tasks, loadTasks, addNewTask } = useTaskStore();
  const [text, setText] = useState(''); // Estado local para o input

  // useEffect: Roda uma vez quando a tela abre
  useEffect(() => {
    loadTasks();
  }, []);

  const handleAdd = () => {
    if (text.trim() === '') {
      Alert.alert("Erro", "Digite uma tarefa!");
      return;
    }
    addNewTask(text); // Salva no banco e atualiza a tela
    setText(''); // Limpa o campo
  };

  const handleSync = async () => {
    // ATENÇÃO: Se rodar no celular, 'localhost' não funciona. 
    // Troque pelo IP do seu PC (ex: 192.168.1.15)
    // Se for Web, localhost funciona.
    const apiUrl = Platform.OS === 'web' 
        ? 'http://localhost:3000/sync' 
        : 'http://192.168.1.106:3000/sync'; // <--- TROQUE O XX PELO SEU IP

    try {
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tasks })
      });
      const data = await response.json();
      Alert.alert("Sucesso", data.message);
    } catch (error) {
      Alert.alert("Erro de Conexão", "Verifique se o backend está rodando.");
      console.log(error);
    }
  };

  return (
    <View style={styles.container}>
      <Appbar.Header>
        <Appbar.Content title="Minhas Tarefas (Boilerplate)" />
        <Appbar.Action icon="cloud-upload" onPress={handleSync} />
      </Appbar.Header>

      <View style={styles.content}>
        <TextInput
          label="Nova Tarefa"
          value={text}
          onChangeText={setText}
          mode="outlined"
          style={styles.input}
        />
        <Button mode="contained" onPress={handleAdd} style={styles.button}>
          Adicionar
        </Button>

        <FlatList
          data={tasks}
          keyExtractor={(item) => item.id.toString()}
          renderItem={({ item }) => (
            <Card style={styles.card}>
              <Card.Content>
                <Text variant="bodyLarge">{item.title}</Text>
              </Card.Content>
            </Card>
          )}
          ListEmptyComponent={<Text style={{textAlign:'center', marginTop:20}}>Nenhuma tarefa ainda...</Text>}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  content: { padding: 20, flex: 1 },
  input: { marginBottom: 10, backgroundColor: 'white' },
  button: { marginBottom: 20 },
  card: { marginBottom: 10, backgroundColor: 'white' }
});