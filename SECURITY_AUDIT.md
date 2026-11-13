# Auditoria de segurança — Sysmacom Harmony

## Situação da revisão atual

Revisão em 07/11/2026. Este quadro descreve o estado atual; os registros históricos abaixo conservam as evidências das correções anteriores e podem mencionar limites já substituídos.

| Item | Situação e evidência | Próxima ação |
| --- | --- | --- |
| Publicação sem aprovação dos testes | Workflow `pages.yml` com suíte obrigatória, sem filtros de caminhos, e dependências explícitas `verify → build → deploy`; artefato público do mesmo commit. | A configuração administrativa do Pages precisa ser `workflow`. Enquanto estiver em `legacy`, o risco continua aberto. Confirmar na API e executar uma publicação verificada após a troca. |
| RLS de tabelas internas sem política | `sb_error_events` e `sb_playlist_share_grants` já negavam acesso por falta de grants e políticas. `supabase/internal_table_denial.sql` acrescenta políticas restritivas explícitas de negação, preservando os caminhos autorizados do servidor. | Migração aplicada no projeto conectado, teste SQL com rollback aprovado e os dois avisos retirados do advisor. Não conceder leitura direta aos clientes para silenciar o linter. |
| Senhas vazadas | O advisor mantém o alerta. A documentação atual do Supabase limita o recurso nativo ao plano Pro ou superior. Não foi contratado plano nem alterada a política de login. | Decisão do responsável sobre contratar/ativar o recurso. Manter aprovação administrativa e controles de cadastro já existentes, que não equivalem à verificação de senhas vazadas. |
| Conteúdo de uploads | Validação de formato, tamanho, decodificação e integridade; uploads permitidos conforme plano/permissões. Isso não é antivírus. Os áudios migrados são servidos pela hospedagem Sysmacom. | Implementar quarentena e validação/scan no servidor antes de disponibilizar novos arquivos, se esse controle for exigido. |
| Cabeçalhos HTTP | CSP da página via meta; o Pages não permite configurar todos os cabeçalhos de segurança exigidos por uma auditoria de headers. | Configuração de uma camada HTTP/CDN compatível, com aprovação e acesso do administrador da infraestrutura. Não prometer proteção por `frame-ancestors` via meta. |
| Dependências de execução | SDK, transporte e conversor usam versões fixadas em CDN; dependências de CI possuem lockfile. | Empacotar dependências de execução e motor de conversão localmente em uma mudança específica, com testes de CSP, cache e tamanho. |
| Direitos do código | LICENSE proprietário e `license: UNLICENSED` no pacote; direitos de terceiros separados. | Campos About/tópicos do GitHub dependem de acesso administrativo. |

A proteção das duas tabelas internas não corrige as demais pendências. Não se afirma conformidade integral nem ausência de vulnerabilidades. Nenhuma mensagem técnica foi adicionada às telas dos usuários.

Referências atuais: [RLS sem políticas](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy), [proteção de senhas](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection), [publicação com workflows](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages).

## Histórico da auditoria inicial

Revisão de 24/10/2026. Escopo: código do site/PWA, importação de backups, Auth, funções SQL, políticas RLS e configuração dos dois buckets do projeto conectado. Não é certificação de segurança nem pentest externo completo.

## Correções aplicadas

| Área | Constatação | Correção e evidência |
| --- | --- | --- |
| XSS / backups | A versão local interpolava a cor do backup diretamente no atributo `style` e aceitava URLs arbitrárias em `audio`. Um backup preparado poderia inserir atributos/eventos no HTML no mesmo domínio da sessão. | Validação completa antes da importação, cor hexadecimal, normalização por lista permitida de campos, IDs e quantidades limitados. Apenas áudio base64 local, com limite por arquivo e total. Renderização de cores também usa fallback seguro. Testes rejeitam quebra de atributo, URLs externas, HTML e chaves especiais. |
| CSP | As páginas não tinham política de conteúdo. | Meta CSP antes de scripts em todas as páginas: scripts locais e CDN necessário, sem `unsafe-inline`/`unsafe-eval` em scripts; eventos HTML, objetos, frames e `base` bloqueados. Formulários apenas na própria origem. Recursos de áudio, Supabase e fontes explicitamente permitidos. Script local extraído para módulo externo. |
| Upload | O caminho de um objeto não tinha uma regra adicional de extensão/estrutura no RLS. | Política restritiva de INSERT: UUID e extensão de áudio permitida, prefixo do dono no bucket privado e `custom/UUID.ext` na biblioteca. Limites existentes no Storage: 25 MB privado / 50 MB biblioteca, MIME permitido e quota privada de 200 MB. Teste SQL bloqueou HTML, traversal, acesso de outro usuário e escrita de não administrador na biblioteca. |
| Validação de arquivos | A biblioteca verificava assinatura e reprodução no navegador; uploads pessoais não tinham essa checagem de conteúdo. | Upload pessoal também usa inspeção de conteúdo e reprodução no navegador. Limite importante: essas checagens do navegador podem ser contornadas por quem chamar o Storage diretamente. |
| CSRF / cadastro | O cadastro já conferia Origin exata, chave pública de aplicação, limite de corpo e quota de tentativas, mas não exigia o tipo JSON. | Exigência de `application/json`, além das proteções anteriores. Handler testado com origem maliciosa/nula, tipo incorreto, corpo inválido e excesso de tamanho. A função publicada permanece anônima por desenho: apenas cria identidade pendente, sem poderes administrativos e sem e-mails de ativação. |
| Sessão | Detecção automática de sessões em URL estava habilitada sem um fluxo OAuth/recovery que precisasse dela. | `detectSessionInUrl: false`; acesso por senha e persistência da sessão continuam. |
| Superfície SQL | Função de trigger `sb_touch_playlist` tinha EXECUTE público desnecessário. | Permissão pública/clientes removida. O funcionamento do trigger foi exercitado pelo teste SQL. |

## SQL injection, autorização e CSRF

Não foi encontrado SQL dinâmico que concatene entradas do usuário nas funções `sb_*` auditadas. O cliente usa filtros e payloads do SDK/PostgREST. O teste SQL armazenou uma string com aspas e `DROP TABLE` como dado literal, sem executar seu conteúdo. O teste também confirmou que a segunda conta não lê nem altera a playlist da primeira.

As tabelas da aplicação e do esquema privado têm RLS. As políticas combinam propriedade e aprovação; administração consulta tabela privada, sem confiar em `user_metadata`. A função de revisão verifica o administrador no servidor. O teste tentou autoaprovação sem privilégios e foi recusado. A chave no frontend é publicável; a chave de serviço fica apenas no ambiente da Edge Function.

As operações autenticadas do app usam Bearer token no cabeçalho, e não cookies de sessão enviados automaticamente para a API. Isso reduz a exposição ao CSRF clássico: um formulário de outra origem não fornece esse token. CORS e a chave pública não substituem autenticação. Um XSS continua sendo relevante porque tokens são armazenados no navegador; por isso a correção de backup e a CSP são importantes.

## Pendências materiais

1. **Validação do conteúdo no servidor / antivírus:** MIME e extensão são declarados pelo cliente; SHA-256 confirma integridade, não ausência de malware. Ainda não há quarentena com aprovação no servidor, antivírus ou transcodificação. Para endurecer a publicação de exemplos, o próximo passo é upload privado em quarentena, validação/scan server-side e somente então promoção ao bucket público, impedindo escrita direta nesse bucket. A biblioteca permite upload apenas a administradores; arquivos pessoais continuam privados por dono.
2. **Cabeçalhos HTTP completos:** no GitHub Pages a CSP foi implementada por meta. `frame-ancestors`, `X-Frame-Options`, `X-Content-Type-Options`, `Permissions-Policy` e CSP de worker/Report-Only não podem ser configurados por esse mecanismo. Não foi afirmada proteção completa contra clickjacking. Para esses controles é necessário configurar uma camada HTTP/proxy com suporte a cabeçalhos, mantendo o repositório no GitHub se desejado.
3. **Proteção contra senhas vazadas:** o advisor do Supabase ainda informa que está desabilitada. Ativar em Auth conforme disponibilidade/configuração do projeto. [Orientação oficial](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).
4. **Dependência de CDN:** SDK Supabase com versão exata fixada continua sendo carregado de esm.sh. A CSP permite esse domínio; empacotar dependências localmente reduz essa confiança externa. Estilos inline são permitidos para cores e layouts dinâmicos; scripts inline não são.
5. **Mídia e sessões:** URLs assinadas privadas duram até 300 segundos. Arquivos já baixados não são revogados retroativamente por bloqueio de conta. O armazenamento offline usa criptografia local, mas não é DRM e uma execução de código confiável na mesma origem pode usar a chave.

## Verificação e limites

- Testes automatizados de payloads de backup, CSP estática, cadastro/origem/JSON, uploads e regressões do app.
- Teste SQL no projeto real, com duas contas temporárias, terminou com ROLLBACK: sem usuários de teste persistentes nem envio de e-mails. Incluiu isolamento de dados/objetos, autoaprovação, path traversal, extensão HTML e conteúdo SQL como texto.
- Advisor após as mudanças: somente o aviso de proteção contra senhas vazadas, já existente.
- Edge Function de cadastro atualizada preservando a aprovação manual e a política de não enviar e-mails.
- CSP avaliada por inspeção e testes estáticos; validação visual/Console em navegadores reais e iPhone ainda é recomendada. Não houve scanner antivírus ou varredura de rede de terceiros.

Referências: [CSP](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy), [funções Postgres/Supabase](https://supabase.com/docs/guides/database/functions), [Storage](https://supabase.com/docs/guides/storage/security/access-control).

## Atualização: contribuições voluntárias

O bucket privado soundbar-submissions armazena cópias explicitamente enviadas pelo usuário para revisão, com limite de 25 MB por arquivo e 100 MB por conta. O administrador tem acesso às cópias associadas às contribuições, sem ganhar acesso geral ao bucket de áudios pessoais. O usuário não pode atualizar nem aprovar o registro e a cópia pendente não pode ser alterada por UPDATE. A revisão usa função com verificação de administrador no servidor; a aprovação requer um item público existente com o ID da contribuição. O teste SQL verifica isolamento, autoaprovação, imutabilidade da cópia, manutenção da contribuição ao apagar o original e aprovação pelo administrador. A exclusão física de temporários é feita pela API do Storage; o teste SQL não desabilita a proteção de DELETE das tabelas do Storage. Isso é uma etapa de moderação privada, não uma implantação de antivírus ou validação automática integral no servidor.

WMA: conversão no dispositivo em worker dedicado, dependência CDN com versão fixa, arquivos com assinatura ASF, comandos e nomes de arquivo fixos, somente protocolo file/pipe e demuxer ASF. A saída MP3 volta ao fluxo normal de validação e políticas de upload. Não foi permitido WMA bruto nos buckets nem alterada a autorização. Limites de tamanho e tempo, worker encerrado após cada conversão para liberar memória. CSP da página continua sem eval; worker clássico servido pelo próprio site carrega seu motor CDN no seu contexto separado. A integridade do motor depende do HTTPS/CDN (versão fixa, sem hash SRI).

## Acesso explícito a cópias locais

O usuário pode abrir o modo offline sem validar novamente a conta no servidor. A restauração mantém o vínculo local com o último proprietário salvo e a verificação de conta aprovada na cópia cifrada; não recebe identidade arbitrária pela URL e não concede permissões na rede. Outra sessão identificada no aparelho impede restaurar a cópia do usuário anterior. O acesso administrativo e as gravações de playlists da conta permanecem indisponíveis offline. Uma pessoa com acesso ao aparelho desbloqueado pode usar os downloads locais sem digitar novamente a senha, conforme a escolha de funcionamento offline; a revogação remota só pode ser reconhecida quando houver reconexão e validação.

402 indica restrição do serviço, sem invalidar por si só o usuário. Falhas de autorização 400/401/403/404 mantêm os fluxos de recusa/limpeza existentes. O modo local independente não recebe dados da conta: usa apenas arquivos importados no próprio aparelho.

## Encerramento automático da sessão

Downloads locais não são uma sessão de rede. Eventos automáticos SIGNED_OUT e expiração 401 deixam de apagar as cópias; o acesso à nuvem continua recusado até autenticação válida. A entrada offline não inicializa o SDK, não tenta renovar token e não recebe identificação arbitrária do proprietário na URL. Estado de conta bloqueada/removida, recusa confirmada 403, troca de usuário autenticado e saída manual mantêm os controles de revogação/limpeza. Isso não recupera dados já eliminados por versões anteriores. O uso no aparelho desbloqueado continua sujeito ao limite de privacidade offline já documentado.
