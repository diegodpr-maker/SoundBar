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

O usuário pode importar áudios de até 30 MB. Há limites no servidor de 30 playlists, 1.000 faixas e até 1 GB no bucket por conta. São limites da implementação, sem cobrança ou planos pagos nesta versão. Os limites/custos da conta Supabase são administrados pelo dono do projeto.

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

O pré-carregamento automático não persiste os arquivos privados nem os coloca no cache do service worker; o download explícito para uso offline é descrito abaixo. A memória é limpa ao sair da conta, fechar a página ou detectar bloqueio. Áudios em reprodução continuam ao trocar de playlist quando essa opção está habilitada.

## Modo evento e armazenamento local

Na playlist, “Biblioteca” insere exemplos diretamente, sem exportar um arquivo. Arraste a alça ⠿ do card para a nova posição. A ordem é salva em uma única operação; se falhar, a interface restaura a sequência anterior. A alça também aceita as setas do teclado. “Modo evento” oculta a navegação e solicita tela cheia e orientação horizontal; o navegador pode exigir rotação manual.

“Baixar para uso offline” guarda os áudios e uma cópia ordenada da playlist (inclusive cores, loop, pausa e fader) em IndexedDB, cifrados com AES-GCM e uma chave não exportável por conta. O download só é confirmado após todos os arquivos e o shell público do PWA estarem disponíveis. Transferências incompletas reaproveitam os arquivos baixados na próxima tentativa. Até 64 MB são antecipados em memória; os demais são decifrados no primeiro toque, sem streaming de URLs fictícias. O modo evento, o volume e os controles funcionam offline.

A área “Playlists baixadas” e o início pelo ícone instalado abrem sem rede, preservando uma sessão local previamente autorizada. O SDK externo não é carregado nessa inicialização. O service worker mantém somente uma lista fechada de arquivos públicos da aplicação, inclusive os módulos e a tela de login. Nenhuma resposta de API, token, URL assinada ou áudio é guardado no Cache Storage. Os dados privados ficam no IndexedDB cifrado; o localStorage contém apenas um identificador da sessão offline além da sessão Supabase já existente. Uma conta diferente não pode restaurar o download de outra. Administração, biblioteca, uploads, compartilhamento e edições precisam de conexão; não há fila de alterações offline.

Ao voltar a rede, o app verifica novamente a sessão e a situação da conta. Bloqueio/exclusão/sessão inválida removem o acesso e os downloads; sair da conta também apaga os dados locais. Sem conexão, uma revogação remota só pode ser conhecida na reconexão. Isso não é DRM: código executado na mesma origem pode acessar a chave. O navegador ou o sistema podem apagar o armazenamento local; nesse caso é preciso baixar novamente. Não há garantia de zero latência no hardware. O botão “Remover download” apaga apenas a cópia local da playlist; a original permanece na conta. Mudanças de ordem/configurações são atualizadas ao abrir a playlist online se todos os arquivos já estiverem salvos; novas faixas exigem atualizar o download. Teste real do service worker cobre domínio raiz e subpasta /SoundBar/, fechamento/reabertura sem rede, reprodução, reconexão e revogação sem dados de usuários.

## Administração da biblioteca

O formulário de inclusão aceita vários arquivos (até 50 MB por arquivo). Revise os nomes individuais antes de enviar; categoria e créditos são comuns ao lote. O progresso indica o arquivo atual. Falhas mantêm somente os arquivos pendentes para nova tentativa, preservando os envios confirmados. Cada item tem a ação “Editar” para nome, categoria, autor, licença, créditos e link HTTPS de origem. A edição altera o catálogo, sem trocar o arquivo ou modificar nomes personalizados nas playlists dos usuários.

O upload da biblioteca valida o conteúdo real do arquivo e a decodificação pelo navegador. Antes de cadastrar o item público, baixa a cópia gravada e compara tamanho e SHA-256 com o arquivo selecionado. Uma falha nesta conferência impede o cadastro. Erros de integridade tentam limpar o objeto; interrupções de rede preservam o envio para retomar sem reenviar os bytes. Essa conferência usa transferência adicional; o progresso do lote inclui validação, envio e conferência. Arquivos inválidos ficam pendentes com a mensagem de erro; os demais continuam. A checagem de decodificação valida o início e a duração reconhecida pelo navegador, sem prometer detectar todo dano possível no final de um arquivo.

O upload usa uma cópia completa dos bytes do arquivo e envia ArrayBuffer ao Storage. As falhas identificam a etapa: leitura local, validação, autorização, envio, conferência ou cadastro. Leituras de rede têm até três tentativas. Em respostas perdidas, o mesmo identificador e caminho são reconciliados antes de repetir a escrita. Uma falha de resposta do cadastro não remove o arquivo que pode já estar publicado. A retomada vale enquanto a mesma seleção de arquivos permanecer aberta na página; recarregar ou selecionar novamente inicia novas operações. Erros permanentes de rede ou de acesso aos arquivos locais ainda podem exigir intervenção no computador.

A seleção de arquivos também é verificada localmente antes das requisições de autorização/upload. Páginas de erro com extensão MP3 são rejeitadas com o título da página quando disponível. Na auditoria do ZIP fornecido pelo usuário, um arquivo foi reconhecido como MP3 por ffprobe e pelo validador; os outros 14 continham a mesma página HTML de erro. O lote simulado com os 15 arquivos acionou o envio somente para o MP3 válido. Os arquivos fornecidos não foram adicionados ao repositório público.

A marca pública é Sysmacom Harmony. O seletor Tema oferece Sistema, Claro e Escuro, com preferência local independente da sessão. No iPhone, abra no Safari e use Compartilhar → Adicionar à Tela de Início. A orientação horizontal e a tela cheia dependem do suporte do iOS; o modo evento também funciona com rotação manual.

No celular, a navegação usa um painel lateral acionado por ☰, com fechamento por seleção, fundo e Escape e contenção do foco. A barra de reprodução só aparece após o evento real de reprodução, inclusive nas prévias, e recolhe durante pausa, espera ou encerramento. O conteúdo recupera o espaço inferior quando não há reprodução.

A abertura instalada e o acesso móvel à raiz passam pelo login, sem landing page. A sessão salva é verificada antes de abrir o painel; sessão expirada volta ao formulário. O manifesto mantém o mesmo id e inicia em login.html?pwa=1. A landing permanece no navegador desktop; atalhos antigos para a raiz são redirecionados pelo script carregado no head.

A revisão de segurança está em [SECURITY_AUDIT.md](SECURITY_AUDIT.md), incluindo correções, verificações, limitações da CSP por meta no GitHub Pages e a pendência de quarentena/antivírus no servidor. Validação de áudio e SHA-256 no navegador não são garantia de ausência de malware.

## Contribuições para a biblioteca

Em Editar faixa, o dono de um áudio privado pode escolher “Enviar para a biblioteca”, fornecer autor/licença e declarar autorização de distribuição. Uma cópia verificada é guardada no bucket privado soundbar-submissions; o original permanece privado. O usuário acompanha a situação em Minhas contribuições. Apenas o administrador vê a fila em Gerenciar áudios, ouve a cópia enviada e publica ou recusa. O servidor impede autoaprovação e edição de situação direta, e a publicação usa ID estável para evitar duplicação em novas tentativas. Até 10 contribuições pendentes e 100 MB de cópias temporárias por usuário, com 30 MB por arquivo. A revisão humana não substitui antivírus/validação completa no servidor.

### Importação de WMA
O PWA converte WMA (ASF sem DRM) para MP3 no dispositivo antes do upload, inclusive em coletâneas do administrador e na versão local. Usa FFmpeg WebAssembly single-thread `@ffmpeg/core@0.12.10`, carregado sob demanda de cdn.jsdelivr.net dentro de um worker dedicado. Na primeira utilização, é necessário baixar aproximadamente 32 MB do conversor; a conversão pode levar alguns minutos em celulares. Não exige COOP/COEP nem SharedArrayBuffer no GitHub Pages. Mantenha a tela aberta. Os arquivos não são enviados ao CDN. O resultado é validado e conferido antes do armazenamento, respeitando 30 MB para playlists e 50 MB para biblioteca, tanto na entrada quanto na saída. Arquivos protegidos, corrompidos, incompatíveis ou cuja saída ultrapassa o limite são rejeitados. Novas conversões precisam de rede caso o navegador não tenha o conversor em cache.

`tests/verify-wma-runtime.mjs` e o workflow WMA executam o worker com o motor real, convertem tons originais WMA v1/v2 para MP3 e decodificam o resultado. O motor não é carregado durante as demais tarefas do app. FFmpeg e seus codecs têm licenças próprias: https://github.com/ffmpegwasm/ffmpeg.wasm e https://ffmpeg.org/legal.html.

Uploads para a biblioteca usam TUS (`tus-js-client@4.3.1`) no endpoint direto do mesmo projeto Supabase. URLs de retomada ficam somente em memória e separadas por usuário/bucket/caminho; os nomes de objeto permanecem estáveis. Um envio interrompido recupera seu offset antes de continuar, sem refazer a conversão. Não sobrescreve objetos existentes. A conferência SHA-256 e a reconciliação do cadastro continuam obrigatórias. O teste de navegador simula interrupção de PATCH e confirma recuperação via HEAD.

### Histórico de uploads da biblioteca
O administrador pode consultar e baixar o JSON de cada lote em Gerenciar áudios → Histórico de envios. Os últimos 20 lotes (até 300 arquivos por seleção) ficam no armazenamento local do navegador, separados por conta. Registra nomes, tamanhos, categoria, horários, etapas, versão do app, código HTTP quando disponível, ID confirmado no catálogo e erro por arquivo. Conversões e porcentagens são resumidas por etapa. Não inclui áudios, JWTs, chaves ou URLs de upload. Lotes interrompidos são identificados ao reabrir a página. Falha ao atualizar a listagem não apaga o resultado do lote. Se o armazenamento local estiver indisponível, o histórico continua em memória com aviso para baixar antes de fechar. Limpar os dados do navegador remove os registros locais; exporte para guardar ou compartilhar com suporte. O histórico não reconstrói envios anteriores à versão 29 e não sincroniza entre aparelhos.

### Registro técnico de erros
`error-monitor.js` captura exceções globais, promessas rejeitadas, avisos de erro do estúdio e falhas de autenticação. Envia somente tipo de evento, página normalizada, classe da exceção, linha e status HTTP disponível. Não envia mensagem livre, formulário, senha, e-mail, nome, áudio, token ou URL completa. O endpoint `soundbar-errors` registra na tabela `sb_error_events`, sem leitura/gravação direta para anon/authenticated e sem tela no produto. Administradores do projeto podem consultar usando ferramentas autorizadas; não é acesso exclusivo do assistente. Hash diário de IP é usado para limitar ingestão a 30 eventos/minuto por origem de rede; o cliente envia no máximo 20 por abertura de página. Registros são diagnósticos não confiáveis recebidos de clientes, não uma trilha de auditoria autenticada. Falhas de rede que impeçam a entrega e erros anteriores ao carregamento do monitor podem não ser registrados. Cadastro aceita somente as origens explícitas GitHub e harmony.sysmacom.com.br, registrando rejeições nos logs protegidos da função.

### Playlists da comunidade
Compartilhamento opt-in em cada playlist. Somente o dono pode disponibilizar ou retirar sua seleção. O módulo Comunidade é acessível apenas a membros com conta liberada. A seleção é consultada ao abrir e importada como cópia independente, preservando nomes, cores, ordem e configurações. Arquivos pessoais são copiados no Storage para caminhos UUID da conta destinatária, com as cotas normais. Faixas da biblioteca mantêm referências ao catálogo. O banco confirma todos os arquivos antes de criar a playlist em uma transação. Recibos tornam a importação idempotente; se a cópia ainda existir, tentar importar novamente abre a mesma playlist. Se o original mudou durante a cópia, o commit falha e o usuário deve reabrir a seleção.

Revogar remove a seleção da comunidade e bloqueia novas leituras dos arquivos compartilhados; cópias já importadas continuam independentes. URLs assinadas que um cliente já tenha emitido podem durar até sua expiração. Nenhuma permissão de UPDATE/DELETE de áudios de terceiros foi concedida. As políticas normais das playlists e perfis privados permanecem intactas. Autorizações de leitura são restritas aos arquivos vinculados à playlist disponibilizada; uma playlist retirada ou dono bloqueado deixa de autorizar novas leituras. Uma falha de rede ambígua não apaga arquivos que possam ter sido confirmados no commit. Temporários de uma importação interrompida podem consumir espaço até nova tentativa ou limpeza; não são listados como playlist concluída. Não há sincronização de edições nem colaboração entre cópias. SQL de instalação: supabase/playlist_sharing.sql. Teste de isolamento e importação: supabase/tests/playlist_sharing.sql (ROLLBACK, sem e-mails).


### Posição das novas faixas

Aplicar `supabase/append_tracks.sql` (migração `append_new_playlist_tracks`). O trigger de INSERT calcula MAX(position) + 1 sob bloqueio da playlist, com o mesmo bloqueio usado pela reordenação. Uploads, inclusões da biblioteca e importações entram no fim; a ordem existente não é reescrita. A função é SECURITY INVOKER, respeita RLS e verifica o dono autenticado. O teste `supabase/tests/append_tracks.sql` verifica inclusões em lote, reordenação, exclusões com lacunas, posição antiga enviada pelo cliente e isolamento entre contas, com ROLLBACK.


### Arraste livre de faixas

O arraste pela alça mostra uma cópia semitransparente do card e abre espaço na grade antes de soltar. A posição é escolhida pelo centro do card arrastado e pela proximidade dos cards, incluindo os vãos da grade. A prévia usa apenas a ordem visual; grava uma única vez ao soltar e restaura a ordem ao cancelar, sair da área, trocar de tela ou perder o foco. Há rolagem automática nas bordas, animação de deslocamento que respeita movimento reduzido e navegação por setas do teclado. O teste de navegador cobre mouse e eventos de toque Android reais via CDP, sob a CSP do app.


### Pressão contínua para organizar

A alça exige 500 ms de pressão contínua antes de liberar o arraste, sem barra, contador ou indicação visual do tempo. Um toque curto ou deslocamento maior que 10 px antes desse prazo cancela a tentativa; o card semitransparente só surge após a ativação. Soltar, cancelar o toque, trocar de tela, perder foco ou ocultar a página também cancela o temporizador. O movimento e a rolagem automática permanecem disponíveis após a ativação. Os atalhos de teclado continuam imediatos. Testes com relógio controlado verificam o limite de 499/500 ms, e o teste de navegador verifica rejeição de toques/deslizes rápidos e arraste intencional com mouse e toque Android.


### Notificações de novos cadastros

Administradores aprovados podem ativar notificações por aparelho na tela Administração. A permissão do sistema é solicitada exclusivamente ao tocar em Ativar notificações. Cadastro e autorização de Push não são exigidos de membros comuns. O aviso não contém nome, e-mail ou outros dados do inscrito e leva à área administrativa, que mantém a verificação de acesso. Ao sair da conta, o app remove a inscrição local e tenta removê-la no servidor; aparelhos de contas sem papel de administrador não recebem avisos.

`supabase/admin_notifications.sql` cria as configurações e inscrições no schema privado, com RLS e sem acesso direto de clientes. As RPCs do usuário conferem o administrador no banco; chaves privadas e o token do despachante só saem por uma RPC exclusiva da service_role. O par VAPID é gerado no servidor, nunca no repositório ou no navegador. Destinos são limitados aos serviços Push dos navegadores, sem redirecionamentos HTTP. O envio usa web-push 3.6.7 para assinar e criptografar a mensagem e fetch com prazo de 8 segundos.

Publicar `soundbar-admin-push`, atualizar `soundbar-register` e aplicar `supabase/admin_notifications_schedule.sql`. O cadastro cria um evento transacional, e a função de cadastro acorda o despachante fora da resposta ao usuário. O Cron tenta novamente a cada minuto; cada evento tem lease, recibos por aparelho e até 10 tentativas em 24 horas. Cadastros aprovados antes do processamento são ignorados, inscrições expiradas são removidas e registros de entrega ficam até 30 dias. Uma interrupção entre a aceitação pelo provedor e o registro do recibo pode repetir o envio; o identificador da notificação é estável e renotify permanece desativado. O sistema do celular, conexão e permissões controlam a entrega final. Não é necessário publicar na Play Store. No iOS, é necessário um PWA instalado com suporte a Web Push.

Testes: `supabase/tests/admin_notifications.sql` usa transação com ROLLBACK, sem e-mails ou envios externos. `tests/admin-notifications.test.mjs` verifica permissão, inscrição, desativação, logout e eventos do service worker. `tests/admin-push-server.test.mjs` verifica autenticação, destinos, rejeição de redirecionamentos e recibos. `tests/verify-push-runtime.mjs` assina, criptografa e decifra uma mensagem real com a biblioteca fixada, usando transporte simulado sem enviar notificações. A opção Testar notificação permite confirmar a entrega no aparelho autorizado.


### Controles no modo evento

O modo evento mantém um painel compacto com as faixas em execução, volume geral, Pausar/Continuar, Parar tudo e Sair. Pausar preserva a posição de cada faixa, inclusive no mix simultâneo; continuar reutiliza os mesmos elementos e arquivos, sem reiniciar o áudio. O volume é o mesmo da interface normal. Faixas pausadas continuam selecionadas e podem ser retomadas pelo card ao sair do modo evento. O pool preserva essas seleções ao renderizar playlists e continua limpando tudo ao sair da conta. Cargas pendentes respeitam a pausa e não iniciam por conta própria.

O painel reserva espaço abaixo dos cards conforme sua altura e respeita as áreas seguras do aparelho. Continua disponível quando pausado ou sem faixa, para ajustar o volume e sair; fora do modo evento, a barra permanece recolhida quando não há áudio tocando. O teste de navegador usa áudio WAV original gerado em memória e HTMLAudioElement real para conferir mix, posição após pausa, volume, parada, retomada pelo card, fallback de tela cheia e layout claro em celular. Nenhum áudio de usuário é utilizado.

### Exclusão administrativa de contas

Administração permite excluir membros pendentes, aprovados ou bloqueados mediante confirmação digitada do e-mail. Contas administradoras, o próprio administrador e autores de decisões administrativas históricas ficam protegidos. A interface usa a função `soundbar-delete-account`; a chave de serviço permanece exclusivamente no servidor. Aplicar `supabase/account_deletion.sql` e publicar os arquivos de `supabase/functions/delete-account` como `soundbar-delete-account`, com autenticação explícita no handler.

A RPC do administrador bloqueia o acesso antes da limpeza; políticas de aprovação impedem novas operações com JWTs ainda válidos. A função bane a conta no Auth, remove via Storage API somente os objetos dos buckets privados sob o UUID selecionado e, depois, exclui o usuário do Auth. Perfil, playlists, faixas e contribuições privadas são removidos pelas relações existentes. A biblioteca publicada e cópias independentes de outros membros permanecem. O histórico de moderação mantém apenas o UUID do alvo, sem impedir a exclusão. Contas excluídas não são apresentadas como cadastro pendente a sessões antigas.

Lotes limitados a 200 objetos usam leases exclusivos, com timeout e retomada. Uma falha mantém a conta bloqueada e disponibiliza Concluir exclusão; reaprovação é recusada enquanto houver uma exclusão pendente. Jobs privados registram fase, código e situação; e-mail e nome usados na retomada são apagados ao concluir. Não há leitura direta desses registros por clientes. Testes do endpoint cobrem autorização, confirmação, limites e escopo dos arquivos; a verificação SQL usa contas aleatórias dentro de uma transação com ROLLBACK, sem excluir membros reais ou enviar e-mails. O teste de navegador cobre conta ativa, cancelamento, confirmação digitada, bloqueio durante a operação, sucesso e retomada.

### Fader por playlist no modo evento

Configurações da playlist contém Fader no modo evento (ativado/desativado) e duração de 1, 2, 3 ou 5 segundos, com padrão ativado/2 segundos. `supabase/event_fader.sql` acrescenta os campos à playlist, preservando RLS de dono/aprovação e incluindo as preferências nas cópias da comunidade. Backups preservam e validam esses campos. Fora do modo evento ou com o fader desativado, a reprodução segue o modo original da playlist.

Com o fader ativo, uma seleção nova espera o evento playing antes de baixar a anterior; as duas faixas usam rampas opostas e a anterior é parada no fim. Seleções rápidas descartam cargas substituídas e mantêm somente a faixa predominante e a seleção mais recente. Há no máximo duas seleções, inclusive durante cargas assíncronas. Erros da nova faixa restauram o ganho da anterior. Pausar mantém posições, ganhos e duração restante; continuar retoma a transição. Buffering da nova faixa congela as rampas até a reprodução continuar. Parar tudo cancela timers e cargas pendentes; sair do modo evento encerra a transição e mantém a faixa predominante.

`audio-levels.js` usa um GainNode por elemento e um ganho geral, incluindo iOS, onde volume do HTMLMediaElement não pode ser controlado por script. O contexto é liberado pelo gesto do usuário. Elementos de áudio usam CORS anônimo para permitir o processamento de fontes remotas e arquivos locais preparados. Rampas Web Audio independem dos timers da página; o fallback nativo atualiza volumes periodicamente quando Web Audio não estiver disponível. Fontes paradas são desconectadas e reutilizam seu nó quando necessário, sem conectar o mesmo elemento duas vezes.

Testes: relógio controlado cobre limites, sobreposição de seleções, falhas, pausa, buffering e limpeza. A consulta SQL usa contas fictícias e ROLLBACK para verificar persistência, isolamento, limites e importação da comunidade. O teste de navegador reproduz WAVs gerados em memória sob a CSP real, mede saída não silenciosa, ganhos, volume geral, pausa/retomada, limite de duas faixas, parada e configuração salva; também simula volume de mídia somente leitura para conferir o caminho usado no iOS. Não usa músicas de membros.


### Pausar e continuar pelo card

A opção Ao tocar novamente na mesma faixa agora mostra Pausar e continuar do mesmo ponto. O valor legado `retrigger=stop` é mantido no banco e nos backups, com nova semântica no cliente; Recomeçar do início continua disponível como opção explícita. O toque pausa o mesmo HTMLAudioElement, preservando fonte e currentTime. Escolher outro card encerra as seleções pausadas pelo card; no modo de faixas simultâneas, as demais faixas em execução continuam misturadas. Parar tudo encerra e zera todas as seleções.

Com o fader ativo no modo evento, o card usa a duração configurada para baixar até zero antes de pausar e subir ao continuar. Tocar novamente durante a descida reverte a rampa; escolher outra faixa durante a descida inicia uma transição entre as duas, sem três áudios. A pausa por card durante uma transição encerra a outra faixa e preserva a selecionada. O controle global de pausa continua congelando a transição inteira. Sair do modo evento conclui uma pausa solicitada, e continuar fora dele restaura o ganho. Preparação em segundo plano nunca recarrega um elemento retido e pausado, tanto no sucesso quanto na falha do download.

Os testes de navegador verificam identidade do elemento, fonte, posição retida, pausa e retomada com ganho, botão Continuar após pausa pelo card, reinício após escolher outra faixa e compatibilidade com o mix/fader existentes. Não são utilizados arquivos de membros.

### Importação de vários áudios na playlist

Importar áudios aceita de 1 a 300 arquivos por seleção, com o limite existente de 30 MB por áudio e a cota normal da conta. A fila trabalha sequencialmente, mantém a playlist de destino capturada ao selecionar os arquivos e apresenta resultados por arquivo. Falhas isoladas não descartam os demais; Tentar novamente os pendentes ignora os já confirmados. Novas faixas entram no fim através do trigger existente. A interface mantém o lote durante navegações internas; fechar/recarregar a página perde as referências locais aos arquivos pendentes.

Cada entrada usa um UUID fixo (`X-Upload-Id` é uma opção interna do adaptador, não um cabeçalho novo enviado ao Storage). `playlist-transfer.js` usa o usuário autenticado, verifica a playlist e o objeto existente, grava sem sobrescrever e compara os bytes por SHA-256 antes do cadastro. Uma resposta de rede perdida é reconciliada pela linha e pelo caminho estáveis. Nunca remove objetos quando não consegue determinar se o cadastro foi confirmado. O upload legado sem esse identificador continua atendendo backups antigos. Nenhuma política, cota ou chave de serviço foi alterada.

Conversões WMA pendentes conservam o mesmo Blob para uma nova tentativa, evitando reconversão com bytes diferentes. Áudios convertidos confirmados são liberados; se falhas acumularem 64 MB de cópias convertidas, os demais ficam pendentes para não crescer indefinidamente a memória. Conta alterada, bloqueada ou encerrada interrompe novas transferências. A confirmação no banco e as permissões de dono/aprovação continuam obrigatórias.

### Tela ligada no modo evento

`event-wake-lock.js` solicita Screen Wake Lock de tela ao ativar o modo evento, incluindo o modo sem tela cheia. Libera ao sair, navegar, encerrar a sessão ou ocultar a página. Ao voltar ao app visível, solicita um novo bloqueio se o modo ainda estiver ativo. Solicitações pendentes de um modo já encerrado são liberadas assim que retornam. Liberações do sistema podem ser tentadas novamente no próximo toque; recusas não geram ciclos de pedidos. O indicador mostra Tela ativa somente depois da concessão, e Tela pode apagar em navegadores sem suporte ou quando o aparelho recusar.

A API exige contexto seguro e depende do navegador e das configurações do aparelho, inclusive economia de energia. Não pode impedir o bloqueio manual do celular. Referência: https://developer.mozilla.org/en-US/docs/Web/API/Screen_Wake_Lock_API. Testes unitários cobrem permissões, segundo plano, corridas de entrada/saída e falhas; o teste de navegador exercita a interface móvel com seleção múltipla, retomada, navegação e concessões de tela simuladas. O teste de SQL existente de inclusão/ordenação é executado com ROLLBACK, sem alterar contas reais.


### Cota privada de 1 GB

Aplicar `supabase/storage_limit.sql` depois das migrações existentes. A cota por conta passa a 1.073.741.824 bytes (1 GiB, exibido como 1 GB). As faixas importadas da comunidade respeitam a mesma cota. O limite por arquivo continua em 31.457.280 bytes; verificação de dono, aprovação, MIME e formato de caminho permanece nas políticas existentes. A alteração não muda o plano ou a capacidade contratada do projeto Supabase. As proteções de tamanho/memória para importar backups JSON permanecem independentes da cota de áudio.

A checagem conservadora de 30 MiB para uma pré-autorização sem tamanho permanece. O aumento libera os envios pendentes observados com 180,23 MiB utilizados, sem retirar a proteção de cota. Não altera o mecanismo de cálculo de tamanho ausente perto do novo limite. A verificação pós-migração testa a própria função com o mesmo usuário e tamanhos das tentativas recusadas, sem enviar arquivos ou excluir dados.


### Cores personalizadas no tema claro

As cores salvas das playlists e dos cards de áudio prevalecem sobre o azul do tema. `playlist-colors.js` valida o hexadecimal, preserva a cor exata e escolhe fundo claro/escuro para os símbolos no modo claro. Cores muito claras usam um marcador escurecido nas bordas para manter contraste. Nomes, descrições e controles mantêm as cores de texto do tema. O seletor de cor apresenta o valor salvo; a cor verde histórica não é mais substituída silenciosamente ao editar uma playlist ou faixa. Testes cobrem vermelho, amarelo, branco, preto, verde, cinza, azul, injeção de CSS e o estilo calculado no navegador em ambos os temas.

O resultado de importação pode ser fechado após o lote. Envios concluídos são retirados do painel; pendentes ficam guardados em memória e podem ser reabertos por Envios pendentes sem reenviar os já confirmados. Fechar o resultado não cancela ou remove áudios salvos. O teste de navegador cobre fechamento, reabertura e nova tentativa sem duplicação.


### Arquivos privados de até 30 MB

Aplicar `supabase/audio_file_limit.sql` após as migrações de cota e contribuições. O limite por áudio passa a 31.457.280 bytes em playlists, conversão WMA e cópias enviadas à moderação. Os dois buckets privados, as restrições de tamanho das tabelas e as funções de quota usam o mesmo valor. A biblioteca pública continua com seu limite administrativo de 50 MB; a cota privada permanece 1 GB e a cota de contribuições permanece 100 MB. A validação de backup permite até 30 MB por áudio e conserva a proteção total de memória de 200 MB.

### Ordem das playlists
A alça ⠿ dos cards permite organizar as playlists pelo mesmo gesto das faixas: pressão contínua de 500 ms, sem indicação visual de tempo, seguida de arraste com transparência e aproximação das posições. O clique no card continua abrindo a playlist. As setas do teclado funcionam quando a alça está focada. A tela de playlists mostra a lista completa; a visão geral mostra as seis primeiras. Reordenar um subconjunto (visão geral ou downloads) preserva as demais posições. Falhas na gravação restauram a ordem anterior.

Aplicar `supabase/playlist_positions.sql` após as migrações anteriores. O campo `sb_playlists.position` é inicializado na ordem de atualização anterior, sem alterar os timestamps de conteúdo. Novas playlists, inclusive importadas, entram no final, sob o mesmo bloqueio por perfil usado pelas cotas. A RPC `sb_reorder_playlists` é SECURITY INVOKER, exclusiva de contas aprovadas, valida exatamente o conjunto de IDs do proprietário e grava tudo em uma transação. O índice começa por user_id. O teste SQL usa ROLLBACK e verifica duplicatas, lista incompleta, NULL, outro usuário, pendentes e anônimos.

A ordem é salva na conta e copiada ao documento local das playlists baixadas; o gesto requer conexão, como as edições de faixas. Ao reabrir offline, os downloads seguem a última ordem sincronizada. Redownload não muda essa ordem nem a sequência das músicas.

### Limites individuais das contas
Em Administração, o botão “Limites” permite definir de 1 a 50 MB por áudio e espaço total das playlists em MB ou GB, até 100 GB. O total precisa comportar ao menos um áudio. “Usar padrão” preenche 30 MB e 1 GB, sem gravar até confirmar. A redução não exclui arquivos existentes; bloqueará novos uploads acima da cota. O uso mostrado considera somente os objetos privados das playlists. A biblioteca pública continua com 50 MB por arquivo; contribuições para análise mantêm 30 MB e a cota própria de 100 MB/20 itens.

Aplicar `supabase/account_limits.sql` depois de `supabase/playlist_positions.sql`. As configurações e o histórico das mudanças ficam em tabelas privadas com RLS e sem permissão direta para clientes. A RPC pública de alteração delega a uma função privada que exige um administrador aprovado e registra os valores anteriores e novos. O usuário lê somente seus limites em `sb_account_state`; a lista administrativa inclui limites, uso e os campos de aprovação/exclusão já existentes. Os bloqueios por perfil serializam alterações com os fluxos de upload. Storage RLS, o limite físico do bucket privado e o gatilho de tamanho em `sb_tracks` aplicam os limites sem confiar na interface. O bucket permite 50 MB como teto físico, mas o padrão individual segue sendo 30 MB. A conversão WMA e o validador de backup recebem o limite individual. A importação da comunidade respeita o limite de cada arquivo e o espaço total do destinatário. O limite de 200 MB de áudio por backup continua como proteção de memória. Referência do teto do serviço: https://supabase.com/docs/guides/storage/uploads/file-limits.

A pré-autorização de Storage pode não fornecer tamanho: a política mantém uma reserva conservadora equivalente ao limite por arquivo da conta. Assim, perto da cota, um envio menor pode exigir liberar mais espaço. Objetos com tamanho desconhecido são contados pelo teto físico. O teto configurado na conta não provisiona capacidade adicional na assinatura do Supabase. Os testes de banco usam contas e metadados descartáveis com ROLLBACK, sem enviar e-mails ou criar arquivos reais.

### Recuperação de MP3 preso em preparação
A leitura dos arquivos locais da biblioteca agora usa FileReader com prazo de 30 segundos e aborta a leitura se o provedor do arquivo não responder. O estado diferencia leitura, preparação, conferência e envio. A falha de um arquivo é registrada no histórico e o lote continua; a nova tentativa preserva os sucessos. O navegador não executa o conversor WMA para MP3s. Os tempos de leitura, fingerprint, busca de cadastro, verificação da conta e confirmação do cadastro são limitados. A conversão WMA mantém seus próprios prazos e termina seu worker nas falhas. Respostas tardias de cadastro continuam reconciliadas pelo identificador já existente.

Os payloads confirmados são liberados após registrar o resultado; o cache de conversões de arquivos que falharam fica limitado a 64 MB por lote. Isso evita acumular cópias completas de uma coletânea em memória. O teste de navegador provoca uma leitura de MP3 sem conclusão, acelera somente o relógio desse prazo e verifica aborto, continuação do próximo arquivo, diagnóstico persistido e reenvio apenas do pendente. O teste não prova que o dispositivo do usuário teve exatamente essa causa; o relatório local de envio continua sendo a evidência para cada ocorrência.

### Auditoria de acesso, sessão e navegação
`session-transport.js` mantém o cliente de Auth responsável por login, renovação e a mesma sessão persistida, e usa o suporte oficial `accessToken` de um cliente de dados para enviar um token ainda válido sem depender de `auth.getSession()` em cada requisição. Na versão fixada 2.57.4, o Auth usa `_acquireLock(-1)` e pode esperar indefinidamente pelo mutex de sessão entre abas. O usuário continua sendo verificado no servidor com `getUser(jwt)` e as RPCs/RLS continuam aplicando aprovação, papel administrativo e isolamento; não se confia no `user_metadata` da sessão para conceder acesso. Tokens vencidos precisam ser renovados, com espera limitada; não há fallback para um token vencido nem elevação para chave de serviço. Cadastro público continua usando o papel anônimo quando não há sessão.

Callbacks de Auth são entregues fora do callback interno do SDK para evitar a condição de deadlock documentada em https://supabase.com/docs/guides/troubleshooting/why-is-my-supabase-api-call-not-returning-PGzXw0. Requisições têm AbortController com prazo de 15 s para dados/Auth, 60 s para downloads e 120 s para uploads comuns; o conversor e o TUS mantêm seus prazos próprios. O timeout de verificação não cria mais três esperas consecutivas pelo mesmo bloqueio. Sair da conta impede gravações tardias de sessão feitas pelo cliente antigo. Não altera permissões no banco.

O teste `verify-access-audit-browser.mjs` carrega os SDKs reais, fixados, do Supabase e do TUS. Segura deliberadamente o mutex do Auth e verifica as páginas de painel, playlists, downloads, comunidade, biblioteca, contribuições, perfil, administração e gerenciamento da biblioteca. Usa um MP3 sintético original para reprodução nativa, upload, comparação dos bytes e cadastro, com respostas de rede simuladas e sem músicas ou credenciais de usuários. Confere retomada de foco, falha de rede/retentativa, recusa de membro comum, sessão vencida e cadastro anônimo. Os testes de SQL com ROLLBACK já verificam as permissões reais do banco; o smoke test da conta administradora só consulta status e a lista, sem alterá-la.

O menu lateral agora usa uma área de navegação flexível com rolagem vertical nativa, inércia e contenção da rolagem. Cabeçalho e conta não são comprimidos pelas opções. O breakpoint do drawer foi alinhado ao layout de 900 px para cobrir celulares na horizontal. A rolagem programática é suave, respeitando movimento reduzido. A auditoria de navegador verifica a última opção e o rodapé em telas móveis e horizontais.


### Tráfego de áudio — v49

Abrir a biblioteca, gerenciar áudios ou abrir uma playlist não deve transferir arquivos de áudio remotos. A preparação automática anterior fazia downloads completos até o orçamento de memória e ainda ativava `preload=auto` nos demais arquivos, podendo consumir o catálogo inteiro por visita. O pool agora lê somente arquivos criptografados já existentes no dispositivo; fontes remotas são anexadas apenas no clique de reprodução. Arquivos grandes ou sem tamanho conhecido também aguardam o clique. Para faixas privadas, a URL é renovada nesse momento, evitando usar uma assinatura expirada após deixar a página aberta. O primeiro clique baixa o arquivo completo uma única vez e o salva criptografado antes de reproduzir a cópia local. As próximas reproduções usam esse arquivo inclusive após reabrir o app. O primeiro download pode aumentar o tempo até iniciar; baixar a playlist antes do evento evita essa espera. Não há streaming paralelo que transfira a mesma faixa uma segunda vez. Pausar e continuar preservam o elemento e sua posição; parar não inicia outra transferência.

Baixar uma playlist permanece uma ação explícita, com reaproveitamento dos arquivos já salvos e reprodução local também quando há conexão. Uploads mantêm a conferência integral e os controles de acesso; essa conferência consome uma transferência do arquivo e não foi desativada para reduzir a franquia. O primeiro acesso a um áudio, uploads com conferência e arquivos ausentes do dispositivo continuam consumindo tráfego. A biblioteca autenticada também usa o cache nas prévias e downloads; a demonstração pública sem conta permanece uma reprodução sob demanda. Exemplos compartilhados entre biblioteca e playlists usam referências criptografadas no IndexedDB para não duplicar o áudio no disco. Quando todas as faixas de uma playlist forem ouvidas/salvas, seu retrato offline é registrado automaticamente; até lá, o botão de baixar a playlist completa continua disponível. O cache não migra entre dispositivos/domínios. O navegador pode limpar dados. Se não houver espaço, a cópia em memória ainda toca, com aviso de que não foi salva. Logout/revogação cancela downloads em andamento e invalida gravações tardias. Não existe promessa de permanência ou DRM. Os arquivos offline são vinculados à conta e removidos no logout/revogação; não entram no Cache Storage público.

A otimização reduz o consumo futuro, sem alterar medidores de cobrança passados nem garantir que uma aplicação de áudio em crescimento caiba na franquia gratuita. A cota é compartilhada pela organização e as franquias de cached e uncached egress são independentes. Monitorar o próximo período completo no painel de uso; se a reprodução real ultrapassar a franquia, avaliar Storage/CDN dedicado com acesso protegido ou plano compatível. Não transferir arquivos privados para hospedagem pública como atalho.

Verificação: `tests/verify-egress-browser.mjs` usa áudio sintético e o HTML real sob CSP em Chromium móvel, exigindo zero requisições de áudio na biblioteca de 167 itens, no gerenciamento e em uma playlist de 29 faixas. O clique pode solicitar somente a faixa escolhida, com URL privada renovada; pause/resume/stop não iniciam outra transferência. Os testes de offline, fader e acesso continuam executados nos workflows existentes.

A revisão v50 versiona também as importações do armazenamento criptografado e do catálogo offline em conjunto com o novo shell. Isso evita combinar uma versão antiga mantida no cache HTTP do navegador com os novos métodos de referência, inclusive no acesso web antes da instalação do service worker.


### Biblioteca no cPanel — v51

O catálogo pode manter áudios ativos em `https://sysmacom.com.br/musicas-harmony/`, sem criar objetos no Supabase Storage. A migração `supabase/cpanel_library_source.sql` preserva os arquivos antigos do Supabase e os itens retirados; libera somente o host HTTPS e a pasta expressamente aprovados. Nega outros hosts, caminhos fora da pasta, travessia de diretórios, barras codificadas, consultas, fragmentos e extensões não suportadas. As políticas RLS existentes continuam exigindo administrador para cadastrar/editar/retirar itens. A alteração não modifica playlists ou seus arquivos.

A CSP adiciona a pasta de músicas somente em `connect-src` e `media-src`; não amplia `script-src`, não libera todo HTTPS e não usa coringa de domínio. O shell v51 garante a atualização no PWA. Os arquivos externos continuam excluídos do Cache Storage público; a cópia por conta permanece criptografada em IndexedDB.

O script `harmony-catalogo.php` do kit consulta somente metadados e gera links codificados por segmento, com suporte a espaços/acentos. No cPanel, `acesso-harmony.txt` deve ser aplicado como bloco do `.htaccess` da pasta de músicas para permitir o Origin do Harmony. Nunca substituir um `.htaccess` existente sem preservar suas outras regras. Abrir o JSON não comprova CORS nos MP3s: os dois endpoints são conferidos separadamente.

`tests/verify-cpanel-browser.mjs` utiliza o HTML real sob a CSP de produção e baixa um MP3 real da categoria solicitada em Chromium móvel. Verifica o primeiro download, reprodução real, reutilização criptografada após recarregar, uso dentro da playlist, pause/resume e fader. O backend de contas é uma fixture local; esse teste não cria usuários nem envia e-mails e não transfere música pelo Supabase. O inspetor confere HTTP, MIME, tamanho, cabeçalho de áudio e CORS de cada faixa da categoria. As verificações de schema e permissões ficam em `supabase/tests/cpanel_library_source.sql` e `cpanel_library_access.sql`, executadas com rollback.


### Importação incremental sem duplicatas — v52

Preferência explícita do responsável: manter um único cadastro por áudio em toda a biblioteca. As 39 pastas do lote ficam como categorias associadas aos mesmos itens, sem cartões repetidos na visão geral. `category` mantém a categoria principal compatível com versões anteriores; `categories` acrescenta as demais. O administrador edita a lista de categorias, uma por linha.

Antes de importar: consultar o catálogo atual e a tabela privada `soundbar_private.sb_library_sources`. Ignorar fontes já conhecidas; nunca recriar ou reativar um item retirado. O ID inicial continua `cpanel-` + SHA-256 da URL canônica, preservando os seis IDs já publicados de Abertura Trabalhos e as referências das playlists. Uma mesma URL possui uma única identidade no histórico privado. Novas fontes de conteúdo idêntico apontam para o mesmo cadastro; as categorias são agregadas sem repetir o cartão. Nenhum arquivo é apagado ou copiado para o Supabase.

`tools/cpanel/inspect-library.mjs --all --confirm-duplicates` confere todos os links, em três requisições concorrentes e até 64 KiB de cada áudio. Coincidências de tamanho e cabeçalho são somente candidatas: a confirmação compara o SHA-256 do arquivo completo, em streaming, sem gravar áudio no workspace. Os hashes completos só são calculados para essas candidatas; nomes parecidos não bastam para excluir uma música. Gravações ou versões com bytes diferentes permanecem distintas.

`tools/cpanel/import-plan.mjs` gera o plano revisável e idempotente. Fontes conhecidas com tamanho/hash de cabeçalho alterado exigem revisão. Uma fonte nova com impressão parcial igual à de um item prévio exige confirmar o hash completo antes de importar. Não deduplicar por título ou por impressão parcial isoladamente. O histórico privado não tem acesso direto pelos clientes; RLS e negação explícita preservam esse limite. O cadastro das categorias continua reservado ao administrador.

Depois da transação: verificar contagem de itens únicos, associação de todas as categorias, ausência de fontes repetidas, permanência dos seis IDs de Abertura, e executar novamente o planejador contra o estado atualizado: o segundo plano deve ter zero inserções e zero novas fontes. Manter a transação idempotente e não alterar perfis, playlists, faixas pessoais ou arquivos existentes.


### Renomear categorias da biblioteca — v53

O administrador abre Gerenciar áudios → Renomear categoria, seleciona o nome atual e informa o novo nome (até 60 caracteres). A operação atualiza a categoria principal e as associações secundárias de todos os itens correspondentes, inclusive retirados, sem reativá-los. Nomes que já pertençam a outra categoria são recusados, evitando uma mesclagem acidental. IDs de áudio, fontes, arquivos, conteúdo criptografado no dispositivo e referências nas playlists são preservados.

`public.sb_admin_rename_library_category` é uma entrada invoker que delega a uma função definer em `soundbar_private`, com `auth.uid()` e aprovação de administrador verificadas antes de qualquer bloqueio ou escrita. A renomeação é atômica e usa o mesmo advisory lock do importador, além de um bloqueio breve da tabela de catálogo para serializar alterações concorrentes de rótulos. Não bloqueia a leitura/reprodução nem modifica faixas dos usuários. RLS das tabelas privadas continua com negação explícita aos clientes.

A tabela privada `sb_library_category_names` guarda o mapeamento de nomes de pastas para nomes exibidos; renomeações sucessivas atualizam o destino existente. O campo de categoria do histórico de fontes acompanha o novo rótulo, sem alterar URLs. Nas próximas importações, consultar essa tabela e passar os pares `source_name`/`display_name` como quarto argumento de `buildImportPlan` (ou quinto caminho de entrada na CLI, depois do arquivo de saída). Assim, novos arquivos dentro de uma pasta antiga recebem o nome atual, sem recriar a categoria anterior.

Os testes SQL de renomeação usam fixtures com rollback: administrador aprovado, membro com metadata forjada, anônimo, administrador pendente, alteração principal/secundária, nomes inválidos/conflitantes, reversão, cadeia de aliases e integridade de playlists/URLs/estado de retirada. Nenhum nome real de categoria é alterado no teste.

### Identidade RGB e simplificação da playlist — v54

O ícone mantém o H azul e usa barras laterais em vermelho, verde e azul. Manifesto, instalação, favicon, splash e notificações usam os novos arquivos de ícone; a identidade e o início do PWA permanecem os mesmos. O cache público passa para v54 e remove o conteúdo antigo na ativação. Os ícones legados PNG também recebem a nova arte para referências antigas.

A playlist mantém o botão superior da biblioteca e os atalhos funcionais, sem o link redundante ou a legenda de atalhos ao final. A página de créditos e seu módulo foram removidos, assim como seus links e entradas de cache. Os créditos associados a cada áudio continuam no catálogo.

### Free, Pro e referências de áudio — v55

O plano padrão de todas as contas comuns é Free. O administrador altera o plano em Administração → Plano: Free/Pro. O Pro é anunciado por R$ 29,90/mês, com limite padrão de 1 GiB (apresentado como 1 GB), 30 MiB por áudio, respeitando ajustes individuais anteriores em Limites. Esta entrega não processa pagamentos nem ativa planos por parâmetros de URL ou metadados de usuário. Nenhuma conta comum foi promovida automaticamente.

A autorização vem de `soundbar_private.sb_account_plans`, com alterações restritas à função administrativa autenticada e auditada. `sb_account_state` retorna `plan` e `can_upload`; o Free não tem controles de upload, restauração de backup com áudios ou envio de contribuições. As políticas restritivas de INSERT/UPDATE nos buckets privados também impedem tentativas diretas e clientes antigos, enquanto reprodução, biblioteca, playlists compartilhadas, exportação e arquivos já enviados continuam disponíveis.

Os itens da biblioteca continuam referenciados por `sample_id`, inclusive fontes do cPanel, sem cópias por conta. A importação comunitária usa uma transação para criar referências ao mesmo `audio_path`; não chama Storage.copy e não consome a cota de upload do destinatário. Somente o snapshot compartilhado autorizado emite concessões privadas. Referências não permitem acesso a outros áudios do autor. Retirar o compartilhamento impede novas importações; cópias lógicas já importadas mantêm a reprodução.

Remover uma faixa apaga primeiro a referência. O objeto físico só pode ser removido quando nenhuma playlist o utiliza. Locks por caminho e locks dos perfis na importação serializam criação, coleta de órfãos e exclusão de contas. A função de serviço de exclusão preserva objetos usados por outras contas; somente nesses objetos retidos limpa `owner`/`owner_id` para liberar a exclusão no Auth, mantendo bytes e nomes intactos. Não há DELETE SQL em storage.objects: remoções físicas continuam pela Storage API. O último importador pode limpar um órfão cujo autor já foi excluído. O cache local usa identidade por caminho e mantém fallback de faixas baixadas nas versões anteriores.

A mudança previne novas cópias por importação e não apaga áudios históricos. A auditoria encontrou 1.518.759.481 bytes no Storage (606.684.385 privados; 912.075.096 na biblioteca), 158 referências de faixas, 82 objetos privados e nenhuma importação comunitária histórica. Esse volume não foi reduzido pela alteração de planos. A franquia anunciada de 1 GB por Pro não aumenta a capacidade contratada do projeto Supabase; provisionar armazenamento suficiente antes de ativar contas Pro. Duplicatas históricas sugeridas por ETag/tamanho precisam de comparação de conteúdo e migração de referências antes de remoção.

O manifesto mantém `id` e `start_url`, usa uma URL estável e consulta a rede com prazo de 2,5 s e fallback público offline. Os ícones RGB permanecem versionados por nome. Android/WebAPK e iOS controlam a atualização do ícone já instalado; o site não consegue forçar substituição imediata de todos os atalhos.

Validação: suíte Node; cenários reais Chromium de Free/Pro, alteração administrativa e downgrade em sessão ativa; testes SQL transacionais de autorização, cotas, compartilhamento, idempotência, exclusão de referências e conta de origem. Fixtures são revertidas, sem envio de e-mails ou arquivos reais.
