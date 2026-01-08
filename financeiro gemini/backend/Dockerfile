# Estágio de Build (compilar TypeScript)
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
# Instala dependências (incluindo devDependencies para compilar TS)
RUN npm ci 
COPY . .
RUN npm run build

# Estágio de Produção (Imagem leve)
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
# Instala apenas dependências de produção
RUN npm ci --only=production
# Copia o build do estágio anterior
COPY --from=builder /app/dist ./dist

# Expõe a porta (ajuste conforme seu server.ts)
EXPOSE 3000

# Define o usuário node por segurança
USER node

CMD ["node", "dist/server.js"]