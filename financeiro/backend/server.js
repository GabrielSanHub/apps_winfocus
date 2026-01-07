// backend/server.js
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');

const app = express();
const PORT = 3000;

// Permite que seu celular e o navegador acessem este servidor
app.use(cors());
app.use(bodyParser.json());

// Banco de dados falso (em memória RAM)
let tasksBackup = [];

// Rota de Teste
app.get('/', (req, res) => {
    res.send('Servidor Backend rodando perfeitamente!');
});

// Rota para receber tarefas do App (Sincronização)
app.post('/sync', (req, res) => {
    const { tasks } = req.body;
    console.log('Recebi tarefas do App:', tasks);
    tasksBackup = tasks; // Salva na memória do servidor
    res.json({ message: 'Dados sincronizados com sucesso!', count: tasks.length });
});

app.listen(PORT, () => {
    console.log(`🚀 Servidor rodando na porta ${PORT}`);
});