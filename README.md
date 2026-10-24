# SoundBar — GitHub Pages + Supabase

A interface é HTML/CSS/JavaScript estático, publicada pelo **GitHub Pages**. O **Supabase** fornece cadastro/login por e-mail, PostgreSQL com isolamento por conta e armazenamento privado de áudios. Não há outro servidor, Worker, Sites ou etapa de build.

## Links

- Site: https://diegodpr-maker.github.io/SoundBar/
- Entrar/cadastrar: https://diegodpr-maker.github.io/SoundBar/login.html
- PWA anterior, com os mesmos áudios salvos neste navegador: https://diegodpr-maker.github.io/SoundBar/local.html

## Ativar o Supabase uma vez

1. Crie um projeto no [Supabase](https://supabase.com/dashboard) ou conecte o plugin Supabase ao ChatGPT para continuarmos a configuração por aqui.
2. No SQL Editor, execute [`supabase/001_soundbar.sql`](supabase/001_soundbar.sql). A migração cria três tabelas, políticas RLS e o bucket privado `soundbar-audio`. Use um projeto dedicado ou revise os nomes `sb_*` antes de aplicar a um projeto existente.
3. Em **Authentication → URL Configuration**, configure:
   - Site URL: `https://diegodpr-maker.github.io/SoundBar/`
   - Redirect URLs: `https://diegodpr-maker.github.io/SoundBar/login.html` e `https://diegodpr-maker.github.io/SoundBar/login.html?reset=1`.
4. Em **Authentication → Providers**, mantenha **Email** habilitado. Mantenha a confirmação de e-mail; não desative para contornar falhas. Configure SMTP próprio antes de abrir cadastros em volume, respeitando os limites do provedor.
5. Em **Project Settings → API**, obtenha **Project URL** e a chave **Publishable** (`sb_publishable_...`) ou a antiga **anon**. Preencha `config.js` e salve no GitHub. Essas duas informações são públicas por projeto. **Nunca use `service_role`, `sb_secret_...`, senha do banco ou token de administração no site.**
6. Aguarde o GitHub Pages e teste duas contas distintas. O arquivo [`supabase/002_verify_isolation.sql`](supabase/002_verify_isolation.sql) faz um teste transacional de isolamento no banco e desfaz as contas temporárias ao final.

Sem a configuração, a landing e os exemplos locais funcionam e a tela de entrada informa que as contas aguardam ativação. Nenhum cadastro é simulado. A integração real e as políticas precisam ser validadas no projeto Supabase após conexão.

## Recursos

Landing responsiva; cadastro, confirmação de e-mail, login, recuperação de senha e saída; perfil e dashboard por usuário; playlists na nuvem; importação/download de áudios; reprodução simultânea ou uma por vez; loop; reinício; comportamento ao trocar de playlist; biblioteca com prévia e inserir direto em um botão; importação/exportação de backups do PWA anterior.

O usuário pode importar áudios de até 25 MB. Há limites no servidor de 30 playlists, 1.000 faixas e até 200 MB no bucket por conta. São limites da implementação, sem cobrança ou planos pagos nesta versão. Os limites/custos da conta Supabase são administrados pelo dono do projeto.

## Isolamento

Cada usuário autenticado é um tenant. `auth.uid()` controla as políticas PostgreSQL e Storage, independentemente dos filtros do navegador. A relação composta `(playlist_id,user_id)` impede associar uma faixa à playlist de outra conta. Uploads só são aceitos na pasta do próprio UUID. Objetos não podem ser sobrescritos. Reprodução privada usa URLs assinadas com validade de uma hora; por serem temporárias, essas URLs devem ser tratadas como credenciais de acesso enquanto válidas.

A chave pública não concede acesso aos dados de outros usuários. A migração remove o acesso anônimo às tabelas da aplicação. O cache do PWA não armazena respostas do Supabase, URLs privadas, tokens nem dados do dashboard. O SDK gerencia sessão e renovação de tokens. Saída da conta também interrompe os áudios e encerra a interface de outras abas.

## Exemplos e licenças

Warm room, Primeiro sinal e Soft pulse são sintetizados localmente e dedicados a CC0. Funcionam sem Supabase. Carefree — Kevin MacLeod, CC BY 3.0, é carregada da [Wikimedia](https://commons.wikimedia.org/wiki/File:Kevin_MacLeod_-_Carefree.ogg) quando o visitante ouve ou baixa; precisa de internet e permite redistribuição com atribuição. O arquivo mantém os créditos na biblioteca e na página `credits.html`. O download externo depende de disponibilidade/CORS da origem; os exemplos locais não têm essa dependência.

## Desenvolvimento e verificação

Não há instalação de dependências para publicar: o GitHub Pages serve a raiz em `main`. O SDK Supabase JS tem versão fixada em `backend.js` e é carregado por ESM somente quando há configuração.

```sh
node --check backend.js
node --check app.js
node --check auth.js
node tests/backend.test.mjs
node tests/pages.test.mjs
```

Os testes locais cobrem as chamadas do adaptador, propriedade das consultas, rejeição de chaves secretas, limpeza de uploads que falharam, links relativos do Pages, cache, cancelamento de reprodução, exemplos WAV e requisitos estruturais da migração. O adaptador usa um cliente de teste; **esses testes não substituem a aplicação e os testes das políticas em um Supabase real**. A verificação visual em navegador depende da disponibilidade do ambiente de execução.
