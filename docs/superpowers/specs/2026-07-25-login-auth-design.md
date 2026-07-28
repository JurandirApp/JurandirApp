# Login + Auth (mock) — início da Fase 3

Design de referência: `design_handoff_jurandir/Login Jurandir.dc.html`.
Construído antes do backend (Fase 2), então a autenticação é **mock** e desenhada para ser
trocada por Auth.js sem mexer na UI.

## Rotas

- `/login` — tela de login (server component; se já logado, redireciona ao painel do papel).
- `/painel` — placeholder do Painel do Estabelecimento (exige papel `ESTABLISHMENT`).
- `/admin` — placeholder do Painel Admin (exige papel `ADMIN`).

Os placeholders leem o cookie no servidor e redirecionam para `/login` se não autenticado.
Serão substituídos pelos painéis reais nas Fases 3 e 5.

## Autenticação (mock, temporária)

- `lib/auth/mock.ts` — contas demo + `findAccount()` + `destForRole()`. Cookie: `jur_session`.
  - `contato@quiosquedomar.com.br` / `demo1234` → `ESTABLISHMENT` → `/painel`
  - `admin@jurandir.app` / `admin1234` → `ADMIN` → `/admin`
- `app/login/actions.ts` — Server Actions:
  - `login(email, password, remember)` valida a conta e grava `jur_session=<role>` (httpOnly,
    sameSite lax). `remember` → cookie persistente (30d); senão, cookie de sessão.
  - `logout()` apaga o cookie e redireciona a `/login`.
- **A trocar na Fase 2/3:** Auth.js (NextAuth v5) credentials + bcrypt + JWT com `role` e
  `establishmentId`; middleware protegendo `/painel/**` e `/admin/**`. A UI e o contrato
  (`login`/`logout`, redirect por papel) permanecem.

## UI (pixel-perfect)

- Layout 2 colunas: branding (logo, "Bem-vindo de volta.", 2 feature cards hard-shadow) +
  card de auth (hard shadow 6px, radius 28). Wordmark 24vw de fundo. Marquee no rodapé
  (variante login: sem ícone, borda só no topo, texto 16px).
- Modo **login**: e-mail + senha (ícones internos, mostrar/ocultar senha), erro inline,
  "Continuar conectado", "Esqueci minha senha", botão com estado "Entrando…".
- Modo **esqueci a senha**: e-mail → "Enviar link" → estado de sucesso ("Link enviado!").
  Envio é **mock** (Fase 3 usa Resend). "Voltar para o login".
- Reuso: `Button`, `Input`, `Icon`, `Marquee` (parametrizada), tokens do design system.
- Credenciais demo **pré-preenchidas** (como o protótipo) para facilitar teste — remover em prod.

## Verificação (browser real)

Login (title/branding) · rota protegida sem sessão → `/login` · credenciais erradas → erro ·
mostrar/ocultar senha · login estabelecimento → `/painel` (cookie=ESTABLISHMENT) · logout →
`/login` · login admin → `/admin` · já logado em `/login` → redireciona · esqueci-a-senha →
"Link enviado!". `npm run build` + `npm run lint` limpos.
