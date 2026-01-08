# Guia de Referência: Boilerplate React Native + Expo + Node.js

=================================================================
1. Preparação do Ambiente (Configuração Única)
=================================================================
Antes de começar a trabalhar, garanta que sua máquina tenha as ferramentas básicas.

=================================================================
A. Instalações Obrigatórias
=================================================================
1. Node.js (LTS): Baixe a versão Long Term Support em nodejs.org. É o motor que roda tudo.
2. Conta Expo: Crie em expo.dev e faça login.
3. App no Celular: Instale o Expo Go (Android/iOS) e logue com sua conta.
4. VS Code: Instale as extensões essenciais:
   4. 1. ESLint (Corrige erros).
   4. 2. Prettier (Formata código).
   4. 3. Expo Tools (Ajuda com comandos).
   4. 4. Material Icon Theme (Organização visual).

=================================================================
B. Criando o Projeto (Terminal)
=================================================================
Abra o terminal na sua pasta de projetos e rode sequencialmente:

# 1. Cria o App (Template Blank)
npx create-expo-app@latest meu-app

# 2. Entra na pasta (MUITO IMPORTANTE: Garanta que entrou na pasta certa!)
cd meu-app

# 3. Instala o "Coração" do App (Navegação, Banco, UI, Estado)
npx expo install expo-router expo-sqlite zustand react-native-paper react-native-safe-area-context react-native-screens expo-linking expo-constants expo-status-bar react-native-vector-icons

# 4. Cria o Backend (Servidor)
mkdir backend
cd backend
npm init -y
npm install express cors body-parser
cd ..

=================================================================
2. Governança e Versionamento (SVN)
=================================================================
Como usamos TortoiseSVN, precisamos impedir que arquivos temporários e pesados poluam o servidor.

=================================================================
A. Lista de Exclusão (Ignore List)
=================================================================

Nunca versione pastas geradas automaticamente.

Botão direito na pasta raiz do projeto > TortoiseSVN > Properties.
New > Advanced.
Property name: svn:ignore.
Cole o conteúdo abaixo:

node_modules
.expo
dist
.web-build
.DS_Store
*.log
.vscode

=================================================================
B. Limpeza Visual no VS Code
=================================================================
Para não ver essas pastas "chatas" no seu editor (mas mantê-las existindo):

1. Crie uma pasta .vscode na raiz.
2. Crie um arquivo settings.json dentro dela e cole:

{
    "files.exclude": {
        "**/node_modules": true,
        "**/.expo": true,
        "**/dist": true
    }
}

=================================================================
3. Arquitetura: Onde fica cada coisa?
=================================================================
Entenda a responsabilidade de cada pasta para não se perder.

/meu-app
│
├── /backend              # O "CÉREBRO REMOTO"
│   └── server.js         # O servidor que recebe dados do celular.
│
├── /app                  # O "ROSTO" (Frontend/Telas)
│   ├── _layout.js        # Configurações globais (Temas, Navegação).
│   └── index.js          # A tela inicial que o usuário vê.
│
├── /src                  # A "INTELIGÊNCIA" (Lógica pura)
│   ├── /database         # O "CADERNO" (SQLite)
│   │   └── db.js         # Comandos SQL (Criar tabela, Inserir, Ler).
│   │
│   ├── /store            # A "MEMÓRIA RAM" (Zustand)
│   │   └── useTaskStore.js  # Gerencia os dados vivos na tela.
│   │
│   └── /services         # O "MENSAGEIRO"
│       └── api.js        # Configuração de IP para falar com o Backend.
│
├── package.json          # Identidade do projeto e lista de peças instaladas.
└── app.json              # Configurações do Expo (Nome do app, ícone, etc).

=================================================================
4. Fluxo de Trabalho (Dia a Dia)
=================================================================

A. Como Rodar o Projeto
Você sempre precisará de dois terminais abertos.

# Terminal 1 (Backend):
cd backend
node server.js
<!-- Objetivo: Deixar o servidor de pé para ouvir requisições. -->

# Terminal 2 (Frontend/App):
npx expo start
<!-- Objetivo: Gerar o QR Code para ler no celular ou abrir no navegador (pressionando w). -->


B. Como Conectar Celular e PC (O Pulo do Gato)
O celular não entende "localhost". Ele precisa do endereço real do seu PC na rede.

1. Abra o terminal e digite: ipconfig.
2. Copie o Endereço IPv4 (ex: 192.168.0.15).
3. No seu código (src/services/api.js ou onde estiver a chamada), use esse IP: http://192.168.0.15:3000
4. Requisito: Celular e PC devem estar no mesmo Wi-Fi.

=================================================================
5. Resumo Técnico para Desenvolvedores
=================================================================
Se alguém perguntar "como esse app funciona?", aqui está a resposta técnica:

1. Frontend: Construído em React Native com Expo Router (navegação baseada em arquivos).
2. UI Kit: Utiliza React Native Paper para componentes visuais prontos (Botões, Cards, Inputs).
3. Estado Global: Gerenciado pelo Zustand. Ele evita o "prop drilling" (passar dados de pai para filho infinitamente). É ele quem chama o banco de dados e atualiza a tela.
4. Persistência Local: Usa Expo SQLite. Os dados ficam salvos no aparelho do usuário, funcionando 100% offline.
5. Sincronização: Quando há internet, o app envia os dados locais para um backend Node.js/Express via requisição HTTP POST.

# console 1
npx expo start --clear

# console 2
node backend/server.js

=================================================================
6. Comandos do Docker
=================================================================

# Buildar e Subir:
docker compose up --build -d
<!-- O -d roda em background. -->

docker compose build --no-cache backend

# Verificar Logs:
docker compose logs -f backend

# Parar
docker compose down

# Acessar 
Abra http://localhost:8080. O Frontend carregará. Requisições para /api/... serão roteadas internamente para o backend.