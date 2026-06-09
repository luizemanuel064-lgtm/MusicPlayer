 MusicPlayer — Streaming de Música Inteligente
O MusicPlayer é uma plataforma de streaming de música desenvolvida como uma Single Page Application (SPA). A proposta principal foi unir os conceitos de Programação Orientada a Objetos (POO) no backend com uma interface de usuário rica, moderna e fluida no frontend, consumindo os dados reais da API pública do Deezer.

Ao entrar no app, o usuário tem uma experiência completa estilo Spotify: pode explorar os charts do momento, buscar músicas, criar playlists personalizadas, ouvir prévias de áudio de 30 segundos e acompanhar seu histórico recente.

 O que a aplicação faz? (Funcionalidades)
Autenticação Segura: Sistema de cadastro e login com senhas criptografadas. Para conveniência do usuário, ao se cadastrar, uma playlist de "Favoritos" é gerada automaticamente. As sessões são persistentes e protegidas contra acessos não autorizados.

Busca Otimizada com Deezer: Na tela inicial, o usuário já se depara com o Top Charts Global. A busca por músicas, artistas ou álbuns conta com um mecanismo de debounce (espera o usuário parar de digitar por 450ms antes de disparar a requisição), economizando processamento. Além disso, há um sistema de fallback inteligente para evitar bloqueios de CORS.

Player de Áudio Avançado: Desenvolvido com a Web Audio API nativa, oferece controles de reprodução (Play, Pause, Avançar, Voltar, Volume) e uma barra de progresso interativa. Visualmente, a interface reage à música com um efeito de vinil girando, brilho colorido dinâmico baseado na capa do álbum e um equalizador animado na faixa ativa.

Gerenciamento de Playlists & Histórico: O usuário cria e deleta suas playlists à vontade (protegendo a de Favoritos), controla músicas duplicadas e acompanha suas últimas 50 reproduções na aba "Recentes", que se organiza dinamicamente jogando os sons tocados por último para o topo.

 A Tecnologia por Trás
Backend (O Motor)
Construído em Python (3.10+) com o micro-framework Flask. A persistência de dados utiliza o SQLite, o que torna a aplicação leve e independente de configurações complexas de infraestrutura na hora de rodar. A segurança de senhas é feita via hash com o Werkzeug.

Frontend (A Experiência)
Uma SPA construída puramente com HTML5, CSS3 e JavaScript Moderno (ES2022), sem a dependência de frameworks pesados (como React ou Vue). O estilo aposta em um tema escuro (dark mode) elegante, fundos com gradientes animados e fontes modernas do Google Fonts (Syne e DM Sans), além de skeleton loadings que dão a sensação de carregamento instantâneo.

 Estrutura e Arquitetura do Código
Plaintext


MusicPlayer/
├── app.py               # Servidor Flask e rotas da API REST
├── static/              # O coração do Frontend (index.html, style.css, app.js)
├── requirements.txt     # Dependências do Python
└── .env                 # Configurações sensíveis (chaves e ambiente)
No Frontend, a lógica do app.js é controlada por um objeto global de estado (state) que monitora em tempo real qual música está tocando, o progresso do player e as playlists do usuário logado.

No Backend, o app.py brilha ao aplicar conceitos fundamentais de POO através de três estruturas principais:

Classe Musica: Modela a faixa musical, tratando seus atributos (título, artista, álbum, link da prévia) e facilitando sua conversão para JSON (to_dict).

Classe Playlist: Reúne coleções de músicas com métodos dedicados para adicionar, remover e listar faixas. Utiliza a sobrecarga de operadores (__len__) para retornar a quantidade de músicas de forma elegante.

Classe BuscadorMusica: Funciona como uma fábrica utilitária (Factory Pattern), instanciando objetos de música e playlists a partir dos dados crus recebidos do banco de dados ou da API.

 Estrutura da API REST
A comunicação entre a interface e o servidor é feita de forma limpa através de endpoints que trafegam dados em formato JSON:

Autenticação: POST /api/register, POST /api/login, POST /api/logout e GET /api/me (para checar se o usuário já está logado ao atualizar a página).

Playlists: GET e POST para /api/playlists, além de rotas dinâmicas como DELETE /api/playlists/<id> e controle de faixas internas (/api/playlists/<id>/tracks).

Histórico: GET e POST para /api/recentes.

 Como Rodar o Projeto
Clonar e Entrar: Crie uma cópia local do repositório e acesse a pasta.

Ambiente Virtual: Ative seu ambiente virtual Python (venv).

Instalar Dependências: Execute pip install -r requirements.txt.

Variáveis de Ambiente: Crie o arquivo .env com base no .env.example e defina uma chave secreta segura (FLASK_SECRET_KEY).

Iniciar: Execute python app.py.
