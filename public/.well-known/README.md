# /.well-known — verificação de domínio

Arquivos servidos em `https://jurandir.app.br/.well-known/...` (o Next/Vercel
serve o conteúdo de `public/` a partir da raiz `/`).

## Apple Pay
1. No painel do Mercado Pago → sua aplicação → **Apple Pay** → registre o domínio
   `jurandir.app.br`.
2. Baixe o arquivo de associação que o MP fornecer.
3. Cole o conteúdo dele em `apple-developer-merchantid-domain-association`
   (mesmo nome, sem extensão), substituindo o placeholder.
4. **commit + push → redeploy** e confira em:
   `https://jurandir.app.br/.well-known/apple-developer-merchantid-domain-association`
5. Volte ao painel do MP e conclua a verificação → o botão Apple Pay passa a
   aparecer no Payment Brick (Safari/iPhone).
