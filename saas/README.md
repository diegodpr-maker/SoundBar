# SoundBar Studio

Evolução do PWA SoundBar para uma aplicação com landing page, entrada com ChatGPT, perfil, painel individual, playlists na nuvem, biblioteca de exemplos, importação de áudios e mesa de reprodução.

## Estado desta entrega

Implementação e testes locais concluídos. **Não publicada na hospedagem Sites.** O envio ao repositório da hospedagem foi bloqueado pela permissão de rede do ambiente. O GitHub Pages do PWA continua funcionando na raiz do repositório e não executa este backend. A pasta `saas/` contém o código da nova aplicação, não um SaaS ativo no Pages.

O projeto Sites já criado está registrado em `.openai/hosting.json`. Reutilize esse ID; não crie outro projeto para continuar a publicação. O projeto nasce privado. O acesso público para clientes ainda precisa ser configurado explicitamente depois de validar a publicação.

## Recursos

- Landing page responsiva, demonstração de sons e página de créditos.
- Login e logout fornecidos pela hospedagem Sites com a conta do ChatGPT; nenhuma senha gerenciada pelo aplicativo.
- Cada usuário é um tenant privado. Perfil e nome do estúdio editáveis.
- Dashboard com quantidade real de playlists, faixas e bytes armazenados.
- Playlists: nome, descrição, cor, reprodução simultânea ou uma por vez, loop, reinício e comportamento na troca.
- Upload MP3/WAV/OGG/M4A/FLAC/AAC; detecção do cabeçalho do arquivo no servidor.
- Arquivos privados em R2, metadados em D1. Download e leitura parcial de áudio autorizados por conta.
- Biblioteca com ouvir, baixar e inserir o exemplo como um botão de uma playlist.
- Créditos e licença em cada exemplo. Carefree, de Kevin MacLeod (CC BY 3.0), é baixada da Wikimedia e armazenada em R2 na primeira reprodução/download. Essa transferência remota ainda não foi testada neste ambiente. Três exemplos originais são sintetizados pelo SoundBar sob CC0.
- Importação do backup JSON do PWA antigo, sem substituir playlists atuais. Exportação com áudios para um backup compatível.
- Atalhos 1–9, parada global, volume geral, diálogos acessíveis e estados vazios/erros.

## Segurança e tenancy

A plataforma de produção valida a sessão e injeta `oai-authenticated-user-id`. **Não exponha o Worker diretamente aceitando cabeçalhos de identidade enviados por visitantes.** Em hospedagem fora de Sites, substitua `identify()` por autenticação verificada no servidor.

O backend deriva `tenant_id` exclusivamente da identidade autenticada. IDs de tenant enviados pelo cliente são ignorados. Todas as consultas a recursos privados incluem o tenant; relações compostas no banco impedem associar faixas de contas diferentes. O acesso aos objetos R2 só acontece após a consulta autorizada da faixa. Os caminhos dos arquivos são internos, sem URL pública.

Operações mutáveis validam `Origin`. Não há CORS aberto. Respostas privadas usam `Cache-Control: no-store`. A CSP restringe scripts à própria origem. O aplicativo não registra e-mail, conteúdo de áudio nem tokens em logs.

Limites de implementação: 30 playlists, 1.000 faixas, 25 MB por arquivo e 200 MB de arquivos por conta. Não são planos pagos. Não há cobrança, assinaturas, equipes compartilhadas nem painel administrativo nesta versão.

## Arquitetura

`web/` → HTML/CSS/JS do cliente. `worker/api.js` → API e autorização. `worker/index.js` → rotas e cabeçalhos. `worker/samples.js` → catálogo e síntese. `drizzle/0000_soundbar.sql` → migração inicial, somente esquema.

A hospedagem é um Cloudflare Worker ESM compatível com o contrato de saída do Sites (`dist/server/index.js`). O build combina módulos locais sem depender de bibliotecas em execução. `assets.generated.js` é saída do build e não deve ser editado. A migração foi escrita e validada em SQLite; o provisionamento e a aplicação da migração em D1 hospedado ainda precisam ser confirmados na publicação. Os helpers/arquivos completos do starter Sites não estavam disponíveis no filesystem desta sessão; foi preparado o artefato ESM equivalente.

## Validação local

Node.js 24+ (usa `node:sqlite` somente nos testes):

```sh
npm run build
node --check dist/server/index.js
node tests/isolation.test.mjs
node tests/routes.test.mjs
```

Os testes usam SQLite real com um adaptador para a API D1 e R2 em memória. Verificam isolamento entre duas contas, alterações de perfil, CRUD, bloqueio de acesso direto por ID, CSRF, validação de uploads, leitura parcial e exclusão. O roteiro Playwright em `tests/browser.cjs` cobre desktop/celular e os fluxos principais, mas **não foi executado com sucesso**: Chromium foi bloqueado pelo sandbox de sockets do ambiente. Requer Playwright instalado e Chromium local; os testes de UI devem ser completados antes de abrir a aplicação para clientes.

## Continuar publicação

1. Liberar rede no ambiente para `git.chatgpt-team.site`.
2. Reutilizar o `project_id` deste checkout e obter uma nova credencial curta por `create_source_repository_write_credential` no Sites. A credencial antiga expirou; não há tokens neste projeto.
3. Sincronizar esta fonte no repositório do Sites. Preferir os helpers de workflow do plugin quando disponíveis. O commit precisa ser o HEAD confirmado do repositório configurado no Sites, não o SHA do GitHub SoundBar.
4. Executar testes e build. Confirmar os bindings D1 `DB` e R2 `BUCKET` no manifesto e a aplicação da migração pelo Sites.
5. Empacotar **o conteúdo de `dist/`** como tar.gz, salvar uma versão desse mesmo commit e publicar de acordo com a audiência atual. Não informar que o serviço está ativo até a hospedagem confirmar sucesso.
6. Testar entrada, duas contas distintas, upload real, Carefree, download e importação de backup. Para tornar a landing e o cadastro acessíveis a clientes, configurar a audiência pública mediante instrução do proprietário.

## Fontes dos áudios

- [Carefree — Kevin MacLeod / Wikimedia](https://commons.wikimedia.org/wiki/File:Kevin_MacLeod_-_Carefree.ogg), [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/).
- Warm room, Primeiro sinal, Soft pulse: síntese original de código, dedicada a [CC0](https://creativecommons.org/publicdomain/zero/1.0/).
