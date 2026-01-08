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

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const syncedIds: string[] = [];

    for (const tx of transactions) {
      // Lógica "Upsert": Se o UUID já existe, atualiza. Se não, cria.
      // Isso evita duplicidade se o usuário enviar a mesma transação 2x por falha de rede.
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
        userId || 1, // Temporário: Em produção pegue do token de auth
        tx.description,
        tx.amount,
        tx.type,
        new Date(tx.date),
        tx.category,
        tx.client_uuid,
        new Date(tx.last_modified_at || Date.now())
      ]);

      syncedIds.push(tx.client_uuid);
    }

    await connection.commit();
    
    // Retorna para o App quais UUIDs foram salvos com sucesso
    res.json({ synced: syncedIds });

  } catch (error) {
    await connection.rollback();
    console.error('Erro no sync:', error);
    res.status(500).json({ error: 'Erro ao processar sincronização' });
  } finally {
    connection.release();
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Backend rodando na porta ${PORT}`);
});