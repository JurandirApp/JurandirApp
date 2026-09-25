# Nota Fiscal (NFC-e) — Design da Fase 1

**Data:** 2026-09-25
**Branch:** `feat/nota-fiscal-nfce`
**Status:** spec para revisão (nenhum código escrito ainda)

Contexto de negócio e urgência legal em
[`docs/superpowers/backlog/2026-09-09-novas-tasks-orcamento.md`](../backlog/2026-09-09-novas-tasks-orcamento.md).
Memória: `nota-fiscal-nfce-integracao`, `orcamento-novas-tasks-2026-09`.

---

## 1. Objetivo

Emitir **NFC-e (modelo 65)** integrada ao fluxo de pedido, configurável por
estabelecimento, sem nunca bloquear a comanda da cozinha. Reaproveita a infra
de impressão (agente ESC/POS) já em produção para imprimir o DANFE 80mm.

Esta é a **Fase 1 — Emissão básica**. Cancelamento, contingência offline,
NF-e mod. 55 e NFS-e da plataforma ficam para fases seguintes (§9).

## 2. Decisões fechadas

1. **Classificação fiscal do cardápio é do contador do cliente.** Nós
   entregamos a *tela* dos campos fiscais no `MenuItem` e a validação de que
   estão preenchidos antes de emitir. Não damos consultoria nem assumimos a
   classificação (NCM/CFOP/CST). Este é o maior risco do projeto e fica fora do
   nosso escopo por decisão do usuário (2026-09-25).
2. **Provedor: Focus NFe**, atrás de uma interface `FiscalProvider` — mesmo
   padrão modular de `lib/payments` (`getProvider`). Trocar de provedor depois
   é barato.
3. **Documento: NFC-e modelo 65** (venda ao consumidor). NF-e mod. 55
   (destinatário CNPJ) fica para a Fase 2.
4. **Piloto: cliente de Lucro Real** (prazo NT 2025.002 já vencido) → os campos
   **IBS/CBS** (`cClassTrib`) entram já na Fase 1.
5. **Ambiente: homologação primeiro.** Produção só depois do certificado A1 +
   CSC do cliente.
6. **Emissão assíncrona.** A comanda sai sempre; a nota entra em fila e é
   emitida em background. SEFAZ fora do ar nunca segura a cozinha.

## 3. Escopo da Fase 1

**Entra:**

- Bloco fiscal no `Establishment` (config do dono).
- Campos fiscais no `MenuItem` (tela pro contador preencher).
- Model `FiscalDocument` + máquina de estados da emissão.
- Interface `FiscalProvider` + implementação `focusnfe`.
- Modo `AUTO_ON_PRINT` (nota junto da impressão do pedido) e `MANUAL` (botão no
  painel). `OFF` desliga tudo.
- Cupom DANFE 80mm via `PrintJobKind.FISCAL` (agente atual).
- Painel de notas (emitida / processando / rejeitada) — web + app (paridade).
- Validação: bloqueia emissão se faltam campos fiscais obrigatórios.
- Testes de integração reais contra o sandbox do Focus (quando o token existir).

**Fora (Fase 2/3):** cancelamento, inutilização, contingência offline (modo
SVC), NF-e mod. 55, reprocessamento automático de rejeição, NFS-e da taxa da
plataforma.

## 4. Arquitetura

### 4.1 Interface do provedor (`lib/fiscal/`)

Espelha `lib/payments`:

```
lib/fiscal/
  types.ts       // FiscalProvider, FiscalEmitInput, FiscalResult, FiscalStatus
  focusnfe.ts    // implementação Focus NFe
  index.ts       // getFiscalProvider() — hoje sempre focusnfe
  build-nfce.ts  // Order (+ Establishment + itens) -> payload NFC-e do provedor
  danfe.ts       // FiscalDocument autorizado -> bytes ESC/POS do cupom
```

`FiscalProvider`:

- `emitNFCe(input: FiscalEmitInput): Promise<FiscalResult>` — dispara a emissão
  no provedor; retorna `ref` (nosso id) + status inicial (`processing`).
- `getStatus(ref: string): Promise<FiscalStatus>` — consulta autorização.
  Usado pela reconciliação (mesma ideia do `reconcileByChargeId` dos
  pagamentos).

O Focus NFe é **assíncrono por natureza**: `POST /v2/nfce?ref=<id>` devolve
`processando_autorizacao`, e o resultado final vem por **webhook** (preferido)
ou **polling** do `GET /v2/nfce/<ref>`. Implementamos os dois: webhook como
caminho feliz, polling como rede de segurança (idêntico ao que fizemos com o
webhook de pagamento).

### 4.2 Pipeline de emissão

```
Pedido pago (Payment.confirmedAt) ┐
                                  ├─→ enfileira FiscalDocument (status=QUEUED)
Botão "Emitir nota" (manual)      ┘         │
                                            ▼
                          build-nfce (Order → payload NFC-e)
                                            │
                          valida campos fiscais dos itens
                                            │
                     FiscalProvider.emitNFCe → status=PROCESSING
                                            │
                 ┌──────────── webhook / polling ───────────┐
                 ▼                                           ▼
        status=AUTHORIZED                             status=REJECTED
     (chave + protocolo + XML)                      (motivo da SEFAZ)
                 │                                           │
     enfileira PrintJob(kind=FISCAL)               aparece no painel p/
        (DANFE via agente atual)                    o dono ver o erro
```

Regra inegociável: nada nesse pipeline roda dentro da transação da comanda. A
emissão é disparada **depois** que o pedido já está pago e a comanda já
imprimiu. `AUTO_ON_PRINT` = enfileira a nota logo após enfileirar o `PrintJob`
do pedido, mas em passos independentes.

## 5. Modelo de dados (mudanças no schema)

### `Establishment` — bloco fiscal (todos opcionais; `fiscalMode` default OFF)

| campo | tipo | nota |
|---|---|---|
| `fiscalMode` | `FiscalMode` @default(OFF) | AUTO_ON_PRINT \| MANUAL \| OFF |
| `fiscalEnv` | `FiscalEnv` @default(HOMOLOGACAO) | HOMOLOGACAO \| PRODUCAO |
| `cnpj` | String? | |
| `ie` | String? | inscrição estadual |
| `regimeTributario` | String? | "1" Simples, "3" Normal (Lucro Real/Presumido) |
| `fiscalCsc` | String? | código CSC (segredo do cliente) |
| `fiscalCscId` | String? | id do CSC (idToken) |
| `nfceSerie` | Int? | série da NFC-e |
| `focusToken` | String? | token do estabelecimento no Focus (por empresa) |
| `fiscalStreet`/`fiscalNumber`/`fiscalDistrict`/`fiscalCity`/`fiscalUf`/`fiscalZip` | String? | endereço do emitente (obrigatório na nota) |

Segredos (`fiscalCsc`, `focusToken`) só saem do backend. Nunca vão pro app nem
pro cliente.

### `MenuItem` — campos fiscais (tela pro contador)

| campo | tipo | nota |
|---|---|---|
| `ncm` | String? | 8 dígitos |
| `cest` | String? | quando há ST |
| `cfop` | String? | ex. 5102 |
| `origem` | String? | origem da mercadoria (0-8) |
| `cstIcms` | String? | Regime Normal |
| `csosnIcms` | String? | Simples Nacional |
| `cClassTrib` | String? | código de classificação tributária (reforma IBS/CBS) |
| `unidadeComercial` | String? @default("UN") | |

### Novo enum + model

```prisma
enum FiscalMode { AUTO_ON_PRINT MANUAL OFF }
enum FiscalEnv  { HOMOLOGACAO PRODUCAO }
enum FiscalDocStatus { QUEUED PROCESSING AUTHORIZED REJECTED ERROR }

model FiscalDocument {
  id            String          @id @default(cuid())
  establishmentId String
  establishment Establishment   @relation(fields: [establishmentId], references: [id], onDelete: Cascade)
  orderId       String          @unique          // 1 nota por pedido na Fase 1
  order         Order           @relation(fields: [orderId], references: [id], onDelete: Cascade)
  ref           String          @unique          // nosso id enviado ao Focus
  model         Int             @default(65)     // 65 NFC-e (55 = Fase 2)
  status        FiscalDocStatus @default(QUEUED)
  env           FiscalEnv
  numero        Int?
  serie         Int?
  chave         String?                          // chave de acesso (44 díg.)
  protocolo     String?
  xmlUrl        String?                          // link do XML no provedor
  danfeUrl      String?                          // link do PDF/DANFE no provedor
  qrcodeUrl     String?          @db.Text        // QR Code da NFC-e (vai no cupom)
  rejeicao      String?          @db.Text        // motivo da SEFAZ
  providerRaw   Json?                            // resposta crua p/ auditoria
  createdAt     DateTime         @default(now())
  updatedAt     DateTime         @updatedAt

  @@index([establishmentId, status])
}
```

`PrintJobKind` ganha `FISCAL`. `Order` ganha a relação inversa `fiscalDocument
FiscalDocument?`.

**Impacto no banco:** tudo aditivo (colunas novas nuláveis + tabela/enum
novos). `prisma db push` seguro, sem downtime — mesmo padrão do garçom/Appmax.

## 6. Integração Focus NFe

- Auth: `Authorization: Basic base64(<token>:)` — token por empresa
  (`Establishment.focusToken`), backend-only. Segredo global de conta fica em
  `.env` (`FOCUS_NFE_ENV`, base URL de homologação vs produção).
- Base URL: `https://homologacao.focusnfe.com.br` vs `https://api.focusnfe.com.br`.
- Emitir: `POST /v2/nfce?ref=<FiscalDocument.ref>` com o payload de `build-nfce`.
- Consultar: `GET /v2/nfce/<ref>`.
- Webhook: rota nova `app/api/webhooks/focusnfe/route.ts` → atualiza o
  `FiscalDocument` por `ref` e, se `AUTHORIZED`, enfileira o `PrintJob` do
  DANFE. Não confiar cegamente no corpo: re-consultar o `GET` por `ref` antes
  de gravar (mesma blindagem dos webhooks de pagamento, que são sem
  assinatura).
- Cadastro da empresa no Focus (`POST /v2/empresas`, upload do certificado A1)
  fica **fora** da Fase 1: o usuário cadastra a empresa e o certificado direto
  no painel do Focus e cola o `focusToken` na config. (Automatizar isso é
  candidato à Fase 2.)

## 7. Cupom DANFE (reaproveita a impressão)

`danfe.ts` monta os bytes ESC/POS do DANFE simplificado 80mm a partir de um
`FiscalDocument` autorizado (emitente, itens, totais, chave de acesso
formatada, protocolo e o **QR Code** da NFC-e). Enfileira um
`PrintJob(kind=FISCAL, payloadB64=<bytes>)` — o agente que já roda no
estabelecimento imprime igual a qualquer outro job. Zero mudança no agente além
de reconhecer o novo `kind` (que ele já trata de forma genérica, pois só
imprime `payloadB64`).

## 8. UI

**Web (painel do estabelecimento):**
- Aba **Fiscal**: config do bloco fiscal + toggle de modo + ambiente.
- Cadastro do cardápio: seção "Fiscal" por item (os campos do §5) — read/write
  pro dono/contador.
- Aba **Notas**: lista de `FiscalDocument` (processando / autorizada /
  rejeitada) com o motivo da rejeição e link do DANFE/XML. Botão "Emitir nota"
  no pedido quando `fiscalMode = MANUAL`.

**App (paridade):** as mesmas telas nas seções Estab do app Flutter. Config
fiscal profunda (certificado) segue o padrão já decidido — o app pode remeter
ao painel web pro setup único (igual recebedor Pagar.me). Detalhe do recorte
app × web fica no plano de implementação.

**Admin:** nada novo obrigatório na Fase 1 (o módulo é ligado pelo próprio dono
via `fiscalMode`; se quisermos gate por admin, é um toggle simples depois).

## 9. Fora de escopo (fases seguintes)

- **Fase 2 — Robustez:** cancelamento (janela ~30 min, varia por UF),
  inutilização de numeração, contingência offline, NF-e mod. 55 (destinatário
  CNPJ), reprocessamento automático de rejeição, cadastro da empresa +
  certificado no Focus via nosso painel.
- **Fase 3 — NFS-e da plataforma:** nota de serviço do Jurandir sobre
  `platformFee`/`serviceFee`. Escopo separado, não confundir com a nota do
  pedido.

## 10. Tratamento de erro

- **Campos fiscais faltando:** `build-nfce` valida antes de chamar o provedor.
  Falta NCM/CFOP/origem/CST → `FiscalDocument.status = ERROR` com mensagem
  clara ("Item X sem NCM"), aparece no painel, **não** chama a SEFAZ.
- **Rejeição da SEFAZ:** `status = REJECTED` + `rejeicao`. Fase 1 só exibe; o
  reprocessamento é manual (reemitir). Automático fica na Fase 2.
- **Provedor/SEFAZ fora do ar:** `status` fica em `PROCESSING`/`QUEUED`; a
  reconciliação por polling resolve quando voltar. A comanda nunca é afetada.

## 11. Testes

- **Unit:** `build-nfce` monta o payload correto a partir de um `Order` fixo
  (itens, totais, CFOP/NCM, IBS/CBS); `danfe` gera os bytes esperados.
- **Integração real** (quando o `focusToken` de homologação existir): emitir uma
  NFC-e no sandbox do Focus, receber webhook, gravar `AUTHORIZED`, enfileirar o
  DANFE. Segue a regra do projeto de **integração real, sem mock** (o provedor
  de homologação é o ambiente oficial de teste da SEFAZ).

## 12. Dependências externas (do usuário)

Bloqueiam o teste real, não o desenvolvimento:

1. **Conta Focus NFe + token de homologação** — pra qualquer emissão real.
2. **Certificado A1 (e-CNPJ)** do cliente — obrigatório em produção.
3. **Código CSC** — o cliente gera no portal da SEFAZ.
4. **Classificação fiscal do cardápio** — o contador do cliente preenche na
   tela que vamos entregar.

## 13. Perguntas em aberto

- Uma nota por pedido cobre o piloto, ou algum cliente precisa dividir a conta
  em várias notas (por pessoa)? (Fase 1 assume 1:1 pedido↔nota.)
- O cardápio real do piloto tem `category`/`subcategory` consistentes o
  suficiente pra ajudar o contador a preencher em lote, ou é item a item?
- Confirmar com o contador do piloto o CFOP/CST padrão de bar/restaurante em
  Lucro Real, pra pré-preencher defaults sensatos (economiza digitação, mas o
  contador valida).
