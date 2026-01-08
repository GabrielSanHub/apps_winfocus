# financeiro/Dockerfile

# Estágio de Build
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
# Comando para exportar a versão Web do Expo (gera pasta dist ou web-build)
RUN npx expo export --platform web

# Estágio de Servidor (Nginx)
FROM nginx:alpine
# Copia o build estático para o diretório do Nginx
COPY --from=builder /app/dist /usr/share/nginx/html
# Copia nossa configuração customizada do Nginx (criaremos a seguir)
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]