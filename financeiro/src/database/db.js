// src/database/db.js
import * as SQLite from 'expo-sqlite';

// Abre (ou cria) o banco de dados 'minhas_tarefas.db'
const db = SQLite.openDatabaseSync('minhas_tarefas.db');

export const initDB = () => {
  // Cria a tabela se ela não existir
  // id: número único, title: texto da tarefa
  try {
    db.execSync(`
      CREATE TABLE IF NOT EXISTS tasks (
        id INTEGER PRIMARY KEY AUTOINCREMENT, 
        title TEXT NOT NULL
      );
    `);
    console.log("📂 Banco de dados inicializado.");
  } catch (error) {
    console.error("Erro ao iniciar DB:", error);
  }
};

// Função para adicionar tarefa
export const addTaskToDB = (title) => {
  try {
    const result = db.runSync('INSERT INTO tasks (title) VALUES (?)', [title]);
    return result.lastInsertRowId; // Retorna o ID criado
  } catch (error) {
    console.error("Erro ao inserir:", error);
  }
};

// Função para ler todas as tarefas
export const getTasksFromDB = () => {
  try {
    const allRows = db.getAllSync('SELECT * FROM tasks');
    return allRows;
  } catch (error) {
    console.error("Erro ao ler:", error);
    return [];
  }
};