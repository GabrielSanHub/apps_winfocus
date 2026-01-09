import express from 'express';
import cors from 'cors';
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
app.use(express.json());
app.use(cors());

// 1. Configuração da Conexão (Pool de conexões é mais eficiente)
const pool = mysql.createPool({
  host: process.env.DB_HOST || 'winfocus.com.br', // Nome do serviço no Docker ou IP da nuvem
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || 'developer_app',
  password: process.env.DB_PASS || 'wst@2023!',
  database: process.env.DB_NAME || 'hub_financeiro',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
  // Adicione isto se o banco na nuvem exigir SSL (comum em Azure/AWS/PlanetScale)
  // ssl: {
  //   rejectUnauthorized: false 
  // }
});

// 2. Rota de Sincronização (Recebe dados do App)
app.post('/api/sync', async (req, res) => {
  const { transactions, userId } = req.body;

  if (!transactions || !Array.isArray(transactions)) {
    return res.status(400).json({ error: 'Formato inválido' });
  }

  // Verificação de segurança básica
  if (!userId) {
      return res.status(400).json({ error: 'ID do usuário não fornecido.' });
  }

  pool.getConnection()
  .then(connection => {
    console.log('✅ SUCESSO: Conectado ao banco de dados externo!');
    connection.release();
  })
  .catch(err => {
    console.error('❌ ERRO CRÍTICO: Não foi possível conectar ao banco de dados.');
    console.error('Motivo:', err.message); // Vai dizer se é senha, IP, porta, etc.
    if (err.code === 'ECONNREFUSED') {
        console.error('DICA: Verifique se o IP/Host está correto e se a porta 3306 está aberta no servidor.');
    }
    if (err.code === 'ER_ACCESS_DENIED_ERROR') {
        console.error('DICA: Verifique se o usuário e senha estão corretos e se o usuário tem permissão de acesso remoto.');
    }
  });

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const syncedIds: string[] = [];

    for (const tx of transactions) {
      // CORREÇÃO: Converter type para Maiúsculo para bater com o ENUM(INCOME, EXPENSE) do banco
      // 
      const upperType = tx.type ? tx.type.toUpperCase() : 'EXPENSE';

      const query = `
        INSERT INTO transactions 
        (user_id, description, amount, type, date, category, client_uuid, last_modified_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE 
        description = VALUES(description),
        amount = VALUES(amount),
        type = VALUES(type),
        date = VALUES(date),
        category = VALUES(category),
        last_modified_at = VALUES(last_modified_at)
      `;

      await connection.execute(query, [
        userId, 
        tx.description,
        tx.amount,
        upperType, // Usando o tipo tratado
        new Date(tx.date),
        tx.category,
        tx.client_uuid,
        new Date(tx.last_modified_at || Date.now())
      ]);

      syncedIds.push(tx.client_uuid);
    }

    await connection.commit();
    console.log(`Sync sucesso: ${syncedIds.length} transações salvas para user ${userId}`);
    
    res.json({ synced: syncedIds });

  } catch (error: any) {
    await connection.rollback();
    // Importante: Isso vai mostrar no console do servidor o motivo exato (ex: FK constraint fails)
    console.error('Erro CRÍTICO no sync:', error.message); 
    res.status(500).json({ error: 'Erro ao processar sincronização: ' + error.message });
  } finally {
    connection.release();
  }
});

// Rota de Registro
app.post('/api/auth/register', async (req, res) => {
  const { name, email, password } = req.body;
  // NOTA: Em produção, usar bcrypt para hashear a senha antes de salvar!
  // Aqui estamos salvando texto plano apenas para o exemplo "simples" pedido,
  // mas o código local (app) enviará o hash se você implementar crypto no front.
  
  try {
    const [existing]: any = await pool.execute('SELECT id FROM users WHERE email = ?', [email]);
    if (existing.length > 0) {
      return res.status(409).json({ error: 'Email já cadastrado' });
    }

    const [result]: any = await pool.execute(
      'INSERT INTO users (name, email, password) VALUES (?, ?, ?)',
      [name, email, password]
    );
    
    res.json({ id: result.insertId, name, email });
  } catch (error) {
    res.status(500).json({ error: 'Erro no servidor' });
  }
});

// Rota de Login
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const [rows]: any = await pool.execute(
      'SELECT id, name, email FROM users WHERE email = ? AND password = ?', 
      [email, password]
    );

    if (rows.length > 0) {
      res.json(rows[0]);
    } else {
      res.status(401).json({ error: 'Credenciais inválidas' });
    }
  } catch (error) {
    res.status(500).json({ error: 'Erro no servidor' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Backend rodando na porta ${PORT}`);
});