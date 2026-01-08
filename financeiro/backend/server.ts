// backend/server.ts
import express, { Request, Response } from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';

const app = express();
const PORT = 3000;

// Permite que seu celular e o navegador acessem este servidor
app.use(cors());
app.use(bodyParser.json());

// Interface genérica para o que vier no sync
interface Task {
  [key: string]: any;
}

// Banco de dados falso (em memória RAM)
let tasksBackup: Task[] = [];

// Rota de Teste
app.get('/', (req: Request, res: Response) => {
    res.send('Servidor Backend rodando perfeitamente!');
});

// Rota para receber tarefas do App (Sincronização)
app.post('/sync', (req: Request, res: Response) => {
    const { tasks } = req.body;
    
    if (!tasks || !Array.isArray(tasks)) {
        res.status(400).json({ message: 'Formato inválido. Esperado array de tasks.' });
        return;
    }

    console.log('Recebi tarefas do App:', tasks);
    tasksBackup = tasks; // Salva na memória do servidor
    res.json({ message: 'Dados sincronizados com sucesso!', count: tasks.length });
});

app.listen(PORT, () => {
    console.log(`🚀 Servidor rodando na porta ${PORT}`);
});