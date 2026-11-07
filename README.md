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
