// src/store/useTaskStore.js
import { create } from 'zustand';
import { getTasksFromDB, addTaskToDB, initDB } from '../database/db';

// Hook: useTaskStore
export const useTaskStore = create((set) => ({
  tasks: [], // Estado inicial: lista vazia

  // Ação: Carregar dados do banco ao abrir o app
  loadTasks: () => {
    initDB(); // Garante que a tabela existe
    const tasksFromDb = getTasksFromDB();
    set({ tasks: tasksFromDb });
  },

  // Ação: Adicionar nova tarefa
  addNewTask: (title) => {
    const newId = addTaskToDB(title); // Salva no SQLite
    if (newId) {
      // Atualiza o estado visual adicionando o novo item
      set((state) => ({ 
        tasks: [...state.tasks, { id: newId, title }] 
      }));
    }
  }
}));