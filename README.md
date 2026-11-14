# Sysmacom Harmony

PWA para organizar playlists e operar áudio em eventos, com modo evento, fader, cache offline e compartilhamento autorizado entre membros.

**Aplicativo:** https://harmony.sysmacom.com.br/

**Código proprietário:** [LICENSE](LICENSE). A consulta pública ao repositório não concede uma licença de código aberto.

## Estrutura atual

- **GitHub Pages:** interface HTML/CSS/JavaScript e instalação do PWA.
- **Supabase:** autenticação, contas, aprovação administrativa, banco e permissões por usuário.
- **Sysmacom/cPanel:** mídia migrada, biblioteca pública e arquivos privados com URLs temporárias autorizadas.
- **Dispositivo:** cache de áudio cifrado e playlists baixadas para uso offline.

A migração de mídia preserva as referências das playlists e evita multiplicar arquivos por usuário. O Supabase continua necessário para o funcionamento online das contas e dos dados. Novos envios autorizados seguem as regras vigentes do plano e da conta; a migração não muda automaticamente o destino de futuros uploads.

## Publicação verificada

[Verified Pages publication](.github/workflows/pages.yml) executa a [suíte obrigatória](.github/workflows/verify-release.yml) em toda alteração e pull request para `main`, sem filtros de caminhos. A suíte inclui testes unitários, todos os testes determinísticos de navegador, conversão WMA, Web Push e ferramentas distribuídas de cPanel e Windows. Inspeções de catálogos ao vivo continuam como operações manuais.

O job `build` depende do sucesso integral de `verify`. O job `deploy` depende de ambos. Somente pushes e execuções manuais na `main` podem publicar; pull requests apenas validam. O artefato é construído a partir do mesmo commit testado e contém somente os arquivos públicos. Falhas ou cancelamentos não autorizam upload/publicação pelo workflow.

**Ativação administrativa necessária:** em [Settings → Pages](https://github.com/diegodpr-maker/SoundBar/settings/pages), definir **Build and deployment → Source → GitHub Actions**. Enquanto `build_type` for `legacy`, a publicação automática por branch continuará independente dos testes; a correção não pode ser considerada ativa. O próprio job de build recusa publicar nessa configuração. Depois da troca, executar **Verified Pages publication → Run workflow → main** ou enviar um novo commit.

Não utilizar “Deploy from a branch” para produção nem adicionar um segundo workflow de publicação sem a mesma dependência de testes. A conexão usada pela manutenção não possui permissão administrativa para alterar essa configuração.

## Desenvolvimento

```sh
npm test
npm run check
npm ci --prefix ci --ignore-scripts --no-audit --no-fund
node ci/node_modules/playwright/cli.js install chromium
node ci/run-browser.mjs access
node ci/run-browser.mjs playback
node ci/run-browser.mjs controls
node ci/build-site.mjs
```

As dependências de teste têm versões fixadas e lockfile em `ci/`. A publicação usa Node 22 e ações fixadas por SHA. Os testes automatizados usam fixtures; mudanças de autorização no banco também precisam da verificação SQL pertinente, com rollback e sem envio de e-mails.

## Segurança

A situação e os limites estão em [SECURITY_AUDIT.md](SECURITY_AUDIT.md). As tabelas internas de erros e autorizações de compartilhamento possuem RLS, bloqueio explícito para clientes e acesso somente pelos caminhos autorizados de servidor.

Ainda precisam de tratamento próprio: validação/antivírus de mídia no servidor, cabeçalhos HTTP não configuráveis no Pages, dependências de execução em CDN e proteção nativa contra senhas vazadas (requer Supabase Pro ou superior). Publicar esta lista não equivale a resolver essas pendências.

Nunca incluir chaves administrativas, senhas, URLs assinadas ou arquivos privados em commits, issues, testes ou artefatos públicos.

## Identificação e direitos

Descrição sugerida para o campo **About** do GitHub: “PWA da Sysmacom para playlists e operação de áudio em eventos, com modo evento, fader, compartilhamento e cache offline.”

Tópicos sugeridos: `pwa`, `soundboard`, `audio`, `playlists`, `offline`, `event-management`, `sysmacom-harmony`. Preencher também o website com `https://harmony.sysmacom.com.br/`. Esses campos administrativos são independentes do README e do `package.json`.

A declaração de direitos reservados aplica-se ao código próprio. Dependências e obras de áudio mantêm suas licenças e seus titulares; a inclusão na biblioteca não concede licença de redistribuição sobre músicas de terceiros.

O [histórico técnico](docs/IMPLEMENTATION_HISTORY.md) contém os registros anteriores de implementação.

## Sequência e próxima faixa

Em Configurações da playlist → Ao terminar uma faixa, “Tocar a próxima faixa da sequência” avança na ordem salva e encerra após a última. “Encerrar reprodução” e “Repetir em loop” permanecem separados; playlists anteriores conservam seu comportamento. No modo evento, “Próxima” avança manualmente junto aos controles de volume, respeitando o fader e o limite de duas faixas da transição. O botão fica desabilitado sem seleção e na última faixa. Pausar, parar ou um erro de reprodução não disparam o avanço automático. Playlists baixadas conservam essa configuração para uso offline; compartilhamento e backups também a preservam.

Na playlist, Biblioteca abre uma janela ampla com nomes completos e prévia de áudio em cada item. A prévia usa o cache do dispositivo e só baixa a faixa escolhida; os controles nativos ficam dentro da janela e a reprodução da prévia é encerrada ao concluir, cancelar ou fechar por Escape.

## Acesso local sem login online

“Usar offline” fica disponível durante a abertura e na tela de login. Abre as playlists completas já baixadas neste aparelho, na interface atual, sem carregar o SDK de autenticação ou consultar o serviço de contas. Sem downloads completos, encaminha para `local.html`, onde playlists e arquivos são mantidos somente no aparelho. A faixa “Arquivos do aparelho” permite abrir esse modo também a partir das playlists baixadas. O modo explícito `app.html?offline=1#downloads` só tenta reconectar quando a pessoa solicita; Reconectar exige novamente a validação normal da conta.

HTTP 402 é tratado como indisponibilidade do serviço e permite recuperar somente os downloads locais já aprovados. Login, área administrativa, biblioteca online, dados de outros usuários, URLs privadas novas e gravações na nuvem continuam protegidos. Erros 400/401/403/404 não são convertidos em autorização offline. O armazenamento do aparelho precisa ter uma cópia completa; o modo local não recupera arquivos que só existem na nuvem.

## Sessão expirada e acesso local

A entrada instalada passa por offline.html, sem importar o backend. Ela oferece playlists completas já baixadas, arquivos do aparelho e acesso separado à conta online. O encerramento automático da sessão/JWT não remove os downloads. Uma recusa confirmada de conta (403 ou estado bloqueado/removido), e a exclusão explícita do download continuam aplicando os controles de limpeza previstos. A saída manual encerra apenas a sessão online e preserva as cópias locais. Falha de autenticação não concede permissão de rede: a leitura local permanece limitada aos dados já presentes no aparelho e ao proprietário local reconhecido.

Cópias eliminadas por uma versão anterior ou pelo navegador não podem ser reconstruídas apenas com uma atualização. O bloqueio de cota do Supabase continua impedindo obter novos dados privados da nuvem até sua regularização.


## Atalhos antigos no Android e inicialização sem conexão

A abertura offline por `login.html?pwa=1` ou `app.html` não exige login mesmo quando não há uma playlist completa reconhecida. Playlists completas salvas abrem diretamente; sem uma cópia completa, abre a entrada local para arquivos do aparelho. O botão Usar offline pertence ao cartão de login, pois a coluna de apresentação é ocultada no PWA mobile. A ausência de metadados ou arquivos locais não confirma se foram excluídos, limpos pelo navegador ou nunca concluídos; nenhuma dessas situações é resolvida apenas removendo a autenticação.

O teste de navegador usa o user-agent Android real junto ao viewport mobile para aplicar a mesma regra de layout do aparelho. Ele fecha e reabre o atalho antigo sem rede, com e sem downloads, e confere a visibilidade do acesso local após sair da conta.


## Relatório local de diagnóstico

A entrada offline permite baixar um relatório para distinguir outra origem, ponteiro local ausente, chave ou documento ausente e dados não reconhecidos. A inspeção de IndexedDB usa somente transações readonly, não apaga nem sobrescreve registros e aborta a criação de um banco ausente. O relatório contém contagens, nomes de playlists do proprietário local reconhecido e estado do cache público. Não exporta credenciais, UUIDs de usuários, chaves de criptografia nem áudio. Dados de outra sessão autenticada não são decifrados. O relatório é gerado e baixado somente no próprio aparelho, sem envio automático. A área local independente utiliza outro banco e apresenta botões iniciais sem arquivos, que não indicam exclusão dos downloads da conta.


## Interface única no modo offline

Os atalhos `offline.html` abrem a mesma aplicação de `app.html`, com menu retrátil, cards, temas e modo evento. Sem downloads, a interface apresenta uma lista vazia e entrada para a conta; não encaminha automaticamente ao player local legado nem cria playlists de demonstração. O estado vazio é transitório em memória, sem gravar identidade, alterar arquivos ou permitir chamadas de nuvem. O relatório local fica no menu lateral. O player legado continua acessível por seu endereço para preservar o uso de arquivos previamente importados nele.


## Migração de projeto em 14/11/2026

O destino Harmony fica no projeto `xrwvszghwijgagarfcnf`, organização `Harmony`. A migração preserva UUIDs, hashes de senha, permissões, playlists, biblioteca e as chaves de mídia do cPanel. As sessões antigas não são transferidas; é necessário entrar novamente com o mesmo e-mail e senha. A limpeza de sessão de outro projeto remove apenas a sessão online e seu verificador PKCE; não limpa o ponteiro ou o banco dos áudios offline. Os áudios continuam no cPanel; os buckets do Supabase permanecem sem objetos.

A restauração foi conferida com contagens e SHA-256 por tabela nas 41 tabelas exportadas, e o isolamento foi verificado com as quatro identidades existentes sem criar contas nem enviar e-mails. Funções Edge ativas: cadastro, relatório de erros, notificações administrativas e exclusão de conta. Ferramentas temporárias de exportação e diagnóstico do projeto antigo não são reativadas.
