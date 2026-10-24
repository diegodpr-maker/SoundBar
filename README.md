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

O administrador já está cadastrado. A ativação inicial foi encerrada e seus endpoints e código de uso único foram removidos.

No painel, **Administração** mostra os cadastros (até 200 mais recentes) e permite liberar, bloquear ou voltar uma conta a pendente. As decisões são verificadas por uma função do servidor e registradas em auditoria privada. O cliente não tem permissão de alterar a tabela de situação diretamente. Usuários comuns não podem promover contas, e a conta administradora não pode se bloquear por esse painel.

A função pública de cadastro valida a chave pública do aplicativo, a origem, o tamanho e os campos da solicitação e aplica limites por e-mail, IP e totais. A chave administrativa fica somente nas variáveis de ambiente do Supabase. O app envia apenas nome, e-mail e senha; não aceita papéis, aprovação ou metadados de autorização. O e-mail não é verificado nesta fase; aprovação manual não é comprovação de titularidade desse endereço.

Tabelas e políticas iniciais: `supabase/001_soundbar.sql`; aprovação: `supabase/003_manual_approval.sql`; regras explícitas das tabelas privadas: `supabase/004_private_table_policies.sql`. Os arquivos em `supabase/tests/` verificam aprovação e permissões dentro de transações desfeitas.

Nunca inclua chaves administrativas, senhas ou tokens no repositório público.

## Recursos

Landing responsiva; cadastro sem e-mail, login, aprovação manual e saída; perfil e dashboard por usuário; playlists na nuvem; importação/download de áudios; reprodução simultânea ou uma por vez; loop; reinício; comportamento ao trocar de playlist; biblioteca com prévia e inserir direto em um botão; importação/exportação de backups do PWA anterior.

O usuário pode importar áudios de até 25 MB. Há limites no servidor de 30 playlists, 1.000 faixas e até 200 MB no bucket por conta. São limites da implementação, sem cobrança ou planos pagos nesta versão. Os limites/custos da conta Supabase são administrados pelo dono do projeto.

## Isolamento

Cada usuário autenticado é um tenant. `auth.uid()` controla as políticas PostgreSQL e Storage, independentemente dos filtros do navegador. A relação composta `(playlist_id,user_id)` impede associar uma faixa à playlist de outra conta. Uploads só são aceitos na pasta do próprio UUID. Objetos não podem ser sobrescritos. Reprodução privada usa URLs assinadas com validade de cinco minutos; por serem temporárias, essas URLs devem ser tratadas como credenciais de acesso enquanto válidas.

A chave pública não concede acesso aos dados de outros usuários. A migração remove o acesso anônimo às tabelas da aplicação. O cache do PWA não armazena respostas do Supabase, URLs privadas, tokens nem dados do dashboard. O SDK gerencia sessão e renovação de tokens. Saída da conta também interrompe os áudios e encerra a interface de outras abas.

## Biblioteca administrável

A biblioteca foi substituída pelos áudios de [Músicas para Harmonia — O Pacificador](https://www.opacificador.com.br/node/56). Foram baixados e validados **26 MP3** (67.442.521 bytes), apresentados em **28 itens**, respeitando os títulos repetidos da página. Os quatro textos sem link na origem não têm arquivo para importar. Os arquivos estão no bucket público `soundbar-library`; a reprodução e o download não dependem mais de acessar o site de origem. Os créditos apontam para a página, que não informa licença de redistribuição. Não são apresentados como CC0 ou como obras de uso livre.

Administradores veem **Gerenciar áudios** no menu e **Gerenciar biblioteca** na biblioteca. Podem enviar um arquivo de até 50 MB, dar nome, categoria e créditos, ou retirar um item da lista. O catálogo é atualizado no Supabase, sem precisar republicar o GitHub. As políticas do banco e do Storage restringem essas alterações a administradores aprovados.

Retirar um item altera `active=false`: ele desaparece da biblioteca pública e não pode ser adicionado a novas faixas. Faixas que já o usam continuam funcionando. Os quatro exemplos antigos ficaram inativos; suas referências foram preservadas somente para não quebrar playlists existentes. Não foi removido nenhum áudio particular de usuário.

`sb_library_tracks` guarda o catálogo e `sb_library_imports` registra a importação. As migrações 005–007 criam catálogo, referências e validação dos itens ativos. O transporte temporário da importação foi desativado e a extensão de rede usada só para a transferência foi removida. O envio normal pelo painel não depende desse importador.

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

A biblioteca e a demonstração usam um elemento de áudio com controles nativos e fixos, iniciando `play()` diretamente no clique, sem aguardar rede ou substituir o elemento. Se o navegador exigir outra interação, o player mostra uma mensagem para tocar no controle ▶. Os áudios da biblioteca são servidos pelo Storage público. O service worker não intercepta os áudios do Supabase nem pedidos de intervalos de bytes; o player usa diretamente o servidor de mídia.

## Preparação para reprodução rápida

Ao abrir uma playlist, os áudios públicos conhecidos são preparados sem consultas adicionais. URLs privadas são geradas antecipadamente em lote, sujeitas às políticas do Storage. Até 64 MB são carregados em memória da sessão com duas transferências simultâneas; arquivos maiores continuam por streaming. O clique reutiliza o elemento de áudio preparado. A biblioteca também prepara as prévias. Aguarde “Áudios prontos” para obter a menor latência. Não há garantia de zero milissegundos no navegador nem de funcionamento instantâneo antes do primeiro carregamento.

Os arquivos privados não são gravados em disco nem no cache do service worker. A memória é limpa ao sair da conta, fechar a página ou detectar bloqueio. Áudios em reprodução continuam ao trocar de playlist quando essa opção está habilitada.

## Modo evento e armazenamento local

Na playlist, “Biblioteca” insere exemplos diretamente, sem exportar um arquivo. Arraste a alça ⠿ do card para a nova posição. A ordem é salva em uma única operação; se falhar, a interface restaura a sequência anterior. A alça também aceita as setas do teclado. “Modo evento” oculta a navegação e solicita tela cheia e orientação horizontal; o navegador pode exigir rotação manual.

“Salvar no celular” guarda os áudios em IndexedDB, cifrados com AES-GCM e uma chave não exportável por conta. A autenticação e a abertura do estúdio ainda exigem conexão: abra a playlist antes do evento e aguarde “Áudios prontos”. Até 64 MB são antecipados em memória; outros arquivos salvos são decifrados no primeiro toque. O armazenamento é específico do navegador/dispositivo e pode ser removido pelo sistema, por limpeza dos dados ou pelo botão “Limpar áudios locais”. Isso não é DRM: código executado na mesma origem e na sessão tem acesso à chave. Não há garantia de zero latência no hardware.
