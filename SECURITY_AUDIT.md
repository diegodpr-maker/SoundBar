# Auditoria de segurança — Sysmacom Harmony

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
4. **Dependência de CDN:** SDK Supabase com versão principal fixada continua sendo carregado de esm.sh. A CSP permite esse domínio; empacotar dependências localmente reduz essa confiança externa. Estilos inline são permitidos para cores e layouts dinâmicos; scripts inline não são.
5. **Mídia e sessões:** URLs assinadas privadas duram até 300 segundos. Arquivos já baixados não são revogados retroativamente por bloqueio de conta. O armazenamento offline usa criptografia local, mas não é DRM e uma execução de código confiável na mesma origem pode usar a chave.

## Verificação e limites

- Testes automatizados de payloads de backup, CSP estática, cadastro/origem/JSON, uploads e regressões do app.
- Teste SQL no projeto real, com duas contas temporárias, terminou com ROLLBACK: sem usuários de teste persistentes nem envio de e-mails. Incluiu isolamento de dados/objetos, autoaprovação, path traversal, extensão HTML e conteúdo SQL como texto.
- Advisor após as mudanças: somente o aviso de proteção contra senhas vazadas, já existente.
- Edge Function de cadastro atualizada preservando a aprovação manual e a política de não enviar e-mails.
- CSP avaliada por inspeção e testes estáticos; validação visual/Console em navegadores reais e iPhone ainda é recomendada. Não houve scanner antivírus ou varredura de rede de terceiros.

Referências: [CSP](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy), [funções Postgres/Supabase](https://supabase.com/docs/guides/database/functions), [Storage](https://supabase.com/docs/guides/storage/security/access-control).
