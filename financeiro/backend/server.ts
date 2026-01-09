import express from 'express';
import cors from 'cors';
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import bcrypt from 'bcrypt';

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

  if (!userId) {
      return res.status(400).json({ error: 'ID do usuário não fornecido.' });
  }

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();
    const syncedIds: string[] = [];

    for (const tx of transactions) {
      const upperType = tx.type ? tx.type.toUpperCase() : 'EXPENSE';
      
      // --- CORREÇÃO DE DADOS (PROTEÇÃO) ---
      // 1. Garante data válida (se falhar, usa data de hoje)
      let finalDate = new Date(tx.date);
      if (isNaN(finalDate.getTime())) {
          console.warn(`Data inválida recebida para tx ${tx.description}. Usando data atual.`);
          finalDate = new Date();
      }

      // 2. Garante categoria padrão
      const finalCategory = tx.category || 'Geral';
      // ------------------------------------

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
        upperType, 
        finalDate,     // Usa a data tratada
        finalCategory, // Usa a categoria tratada
        tx.client_uuid,
        new Date(tx.last_modified_at || Date.now())
      ]);

      syncedIds.push(tx.client_uuid);
    }

    await connection.commit();
    console.log(`Sync sucesso: ${syncedIds.length} transações processadas para user ${userId}`);
    res.json({ synced: syncedIds });

  } catch (error: any) {
    await connection.rollback();
    console.error('❌ ERRO NO SYNC:', error.message); 
    // Retorna erro detalhado para o app saber o que houve
    res.status(500).json({ error: 'Erro no Sync: ' + error.message });
  } finally {
    connection.release();
  }
});

// Rota de Registro (COM HASH)
app.post('/api/auth/register', async (req, res) => {
  const { name, email, password } = req.body;
  
  try {
    const [existing]: any = await pool.execute('SELECT id FROM users WHERE email = ?', [email]);
    if (existing.length > 0) {
      return res.status(409).json({ error: 'Email já cadastrado' });
    }

    // 1. Criptografa a senha antes de salvar
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    const [result]: any = await pool.execute(
      'INSERT INTO users (name, email, password) VALUES (?, ?, ?)',
      [name, email, passwordHash] // Salva o hash, não a senha pura
    );
    
    res.json({ id: result.insertId, name, email });
  } catch (error: any) {
    console.error('❌ ERRO NO REGISTRO:', error.message); 
    res.status(500).json({ error: 'Erro no servidor: ' + error.message });
  }
});

// Rota de Login (COM COMPARAÇÃO DE HASH)
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    // Busca o usuário e a senha criptografada (hash)
    const [rows]: any = await pool.execute(
      'SELECT id, name, email, password FROM users WHERE email = ?', 
      [email]
    );

    if (rows.length === 0) {
      return res.status(401).json({ error: 'Credenciais inválidas' });
    }

    const user = rows[0];

    // 2. Compara a senha enviada com o hash do banco
    const match = await bcrypt.compare(password, user.password);

    if (match) {
      // Remove a senha do objeto antes de devolver para o app
      const { password, ...userWithoutPass } = user;
      res.json(userWithoutPass);
    } else {
      res.status(401).json({ error: 'Credenciais inválidas' });
    }
  } catch (error: any) {
    console.error('❌ ERRO NO LOGIN:', error.message);
    res.status(500).json({ error: 'Erro no servidor' });
  }
});

const startServer = async () => {
  try {
    const connection = await pool.getConnection();
    console.log('✅ BANCO DE DADOS CONECTADO COM SUCESSO!');
    connection.release();

    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
      console.log(`🚀 Servidor rodando na porta ${PORT}`);
      console.log(`👉 Aguardando requisições do App...`);
    });

  } catch (err: any) {
    console.error('❌ ERRO FATAL: O servidor não iniciou porque o banco de dados falhou.');
    console.error('MOTIVO:', err.message);
    process.exit(1);
  }
};

startServer();