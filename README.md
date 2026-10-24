# SoundBar — GitHub Pages + Supabase

A interface é HTML/CSS/JavaScript estático, publicada pelo **GitHub Pages**. O **Supabase** fornece cadastro/login por e-mail, PostgreSQL com isolamento por conta e armazenamento privado de áudios. Não há outro servidor, Worker, Sites ou etapa de build.

## Links

- Site: https://diegodpr-maker.github.io/SoundBar/
- Entrar/cadastrar: https://diegodpr-maker.github.io/SoundBar/login.html
- PWA anterior, com os mesmos áudios salvos neste navegador: https://diegodpr-maker.github.io/SoundBar/local.html

## Projeto conectado

Projeto **SoundBar**, região São Paulo (`sa-east-1`), URL `https://fcmsojjtkiehsobbkjnr.supabase.co`. As tabelas, as políticas RLS e o bucket privado foram provisionados. `config.js` contém somente a chave publicável. O teste transacional de duas contas passou no banco real; os usuários de teste foram desfeitos e o verificador de segurança retornou sem alertas.

### Fase de testes: aprovação manual, sem e-mails

O cadastro usa a Edge Function `soundbar-register`, que cria a identidade Auth sem enviar e-mail. Um gatilho coloca toda conta nova em `pending`, inclusive cadastros feitos diretamente pela API Auth. A recuperação por e-mail foi retirada da interface nesta fase.

A conta só acessa o estúdio depois de ser aprovada. As políticas restritivas verificam a situação no banco a cada operação; pendentes e bloqueados não acessam perfis, playlists, faixas nem objetos privados. Administradores não ganham acesso aos áudios de outras contas.

O administrador inicial usa o e-mail definido pelo proprietário, registrado somente no banco. O proprietário recebe, fora do repositório, um código aleatório de uso único, válido por 48 horas. Depois de cadastrar e entrar com esse e-mail, abre **Primeiro acesso do administrador** na tela de espera e usa o código. Só o hash fica no esquema privado. Ninguém recebe administração apenas por usar um e-mail específico ou por ser o primeiro cadastro.

Depois da ativação, **Administração** mostra os cadastros (até 200 mais recentes) e permite liberar, bloquear ou voltar uma conta a pendente. As decisões são verificadas por uma função do servidor e registradas em auditoria privada. O cliente não tem permissão de alterar a tabela de situação diretamente. Usuários comuns não podem promover contas, e a conta administradora não pode se bloquear por esse painel.

A função pública de cadastro valida a chave pública do aplicativo, a origem, o tamanho e os campos da solicitação e aplica limites por e-mail, IP e totais. A chave administrativa fica somente nas variáveis de ambiente do Supabase. O app envia apenas nome, e-mail e senha; não aceita papéis, aprovação ou metadados de autorização. O e-mail não é verificado nesta fase; aprovação manual não é comprovação de titularidade desse endereço.

Tabelas e políticas iniciais: `supabase/001_soundbar.sql`; aprovação: `supabase/003_manual_approval.sql`; regras explícitas das tabelas privadas: `supabase/004_private_table_policies.sql`. Os arquivos em `supabase/tests/` verificam aprovação e ativação inicial dentro de transações desfeitas. Não execute o teste de bootstrap depois que o administrador real estiver ativo.

Não coloque o código inicial, `service_role`, `sb_secret_...`, senhas ou tokens administrativos no repositório. Se o código inicial expirar antes de ser usado, o proprietário precisa gerar outro hash por uma operação administrativa confiável.

## Recursos

Landing responsiva; cadastro sem e-mail, login, aprovação manual e saída; perfil e dashboard por usuário; playlists na nuvem; importação/download de áudios; reprodução simultânea ou uma por vez; loop; reinício; comportamento ao trocar de playlist; biblioteca com prévia e inserir direto em um botão; importação/exportação de backups do PWA anterior.

O usuário pode importar áudios de até 25 MB. Há limites no servidor de 30 playlists, 1.000 faixas e até 200 MB no bucket por conta. São limites da implementação, sem cobrança ou planos pagos nesta versão. Os limites/custos da conta Supabase são administrados pelo dono do projeto.

## Isolamento

Cada usuário autenticado é um tenant. `auth.uid()` controla as políticas PostgreSQL e Storage, independentemente dos filtros do navegador. A relação composta `(playlist_id,user_id)` impede associar uma faixa à playlist de outra conta. Uploads só são aceitos na pasta do próprio UUID. Objetos não podem ser sobrescritos. Reprodução privada usa URLs assinadas com validade de cinco minutos; por serem temporárias, essas URLs devem ser tratadas como credenciais de acesso enquanto válidas.

A chave pública não concede acesso aos dados de outros usuários. A migração remove o acesso anônimo às tabelas da aplicação. O cache do PWA não armazena respostas do Supabase, URLs privadas, tokens nem dados do dashboard. O SDK gerencia sessão e renovação de tokens. Saída da conta também interrompe os áudios e encerra a interface de outras abas.

## Exemplos e licenças

Warm room, Primeiro sinal e Soft pulse são sintetizados pelo SoundBar, distribuídos como MP3 na pasta `audio/` e dedicados a CC0. Funcionam sem Supabase. Carefree — Kevin MacLeod, CC BY 4.0, é carregada em MP3 do [Incompetech](https://incompetech.com/music/royalty-free/index.html?isrc=USUAN1400037) quando o visitante ouve ou baixa; precisa de internet e permite redistribuição com atribuição. O arquivo mantém os créditos na biblioteca e na página `credits.html`. O download externo depende de disponibilidade/CORS da origem; os exemplos locais não têm essa dependência.

## Desenvolvimento e verificação

Não há instalação de dependências para publicar: o GitHub Pages serve a raiz em `main`. O SDK Supabase JS tem versão fixada em `backend.js` e é carregado por ESM somente quando há configuração.

```sh
node --check backend.js
node --check app.js
node --check auth.js
node tests/backend.test.mjs
node tests/pages.test.mjs
node tests/registration.test.mjs
node tests/delete-track.test.mjs
```

Os testes locais cobrem as chamadas do adaptador, propriedade das consultas, rejeição de chaves secretas, limpeza de uploads que falharam, links relativos do Pages, cache, cancelamento de reprodução, exemplos WAV e requisitos estruturais da migração. A aprovação e o isolamento também foram testados no banco real com rollback; o adaptador usa um cliente de teste; **esses testes não substituem a aplicação e os testes das políticas em um Supabase real**. A verificação visual em navegador depende da disponibilidade do ambiente de execução.

## Reprodução das prévias

A biblioteca e a demonstração usam um elemento de áudio com controles nativos e fixos, iniciando `play()` diretamente no clique, sem aguardar rede ou substituir o elemento. Se o navegador exigir outra interação, o player mostra uma mensagem para tocar no controle ▶. Os três exemplos locais têm volume normalizado. O service worker atende intervalos de bytes dos MP3 em cache com respostas 206 e não tenta armazenar respostas parciais.
