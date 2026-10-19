# /.well-known — verificação de domínio

Arquivos servidos em `https://jurandir.app.br/.well-known/...` (o Next/Vercel
serve o conteúdo de `public/` a partir da raiz `/`).

## Apple Pay (web)
1. Apple Developer → **Certificates, Identifiers & Profiles** → **Identifiers**
   → **Merchant IDs** → `merchant.br.app.jurandir`.
2. Em **Merchant Domains** → **Add Domain** → `jurandir.app.br`.
3. Baixe o arquivo de associação que a Apple fornecer.
4. Cole o conteúdo dele em `apple-developer-merchantid-domain-association`
   (mesmo nome, sem extensão), substituindo o placeholder.
5. **commit + push → redeploy** e confira em:
   `https://jurandir.app.br/.well-known/apple-developer-merchantid-domain-association`
6. Volte ao portal da Apple e clique **Verify**.

Depois de verificado, o restante da configuração do Apple Pay fica no guia de
deploy do projeto (fora desta pasta pública).
