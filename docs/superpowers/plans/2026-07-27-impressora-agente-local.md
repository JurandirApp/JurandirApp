# Impressora térmica — agente local (ESC/POS) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Imprimir a comanda do pedido numa impressora térmica de rede (ESC/POS) via um agente local que puxa jobs da nuvem.

**Architecture:** A nuvem enfileira `PrintJob` (ESC/POS já renderizado) quando o pedido entra em produção; um agente Node no bar puxa os jobs (polling autenticado por token), envia via TCP `IP:9100` e confirma. Renderização fica na nuvem (função pura); o agente é um pipe de bytes.

**Tech Stack:** Next.js 16.2.11 (route handlers), Prisma 6 + Postgres (Neon), TypeScript, vitest, Node built-ins (`net`, global `fetch`).

## Global Constraints

- **Não rodar `npm run build`** com o `dev` do usuário no :3000. Verificação: `npx tsc --noEmit` + `npm run lint` + `npm test`.
- **Sem git** — cada tarefa fecha com a tríade de verificação (sem passo de commit).
- **Sem novas dependências** (app e agente usam só built-ins).
- Comanda em pt-BR com **acentos normalizados** (sem diacríticos) no MVP; CP850 fica como melhoria.
- Token do agente: opaco, per-estabelecimento, `@unique`, só no servidor.
- **Teste físico deferido** (sem impressora) — validação por bytes ESC/POS + preview do payload.
- Testes em `tests/<domínio>/*.test.ts`; alias `@/`.
- Schema aplicado via `prisma db push` (aditivo).

## Mapa de arquivos

**Criar:** `lib/print/escpos.ts`, `lib/print/ticket.ts`, `lib/db/print.ts`, `app/api/print/jobs/route.ts`, `app/api/print/ack/route.ts`, `agent/jurandir-print-agent.mjs`, `agent/README.md`, `agent/.env.example`, `tests/print/escpos.test.ts`, `tests/print/ticket.test.ts`.
**Modificar:** `prisma/schema.prisma`, `lib/db/payments.ts` (gatilho), `lib/db/orders.ts` (gatilho), `lib/actions/admin.ts` (config), `lib/admin/adapters.ts` + `lib/data/admin.ts` (expor config), `components/admin/sections/CadastrosSection.tsx` (UI), `messages/pt.json`, `messages/en.json`.

---

### Task 1: Schema — PrintJob + campos no Establishment

**Files:**
- Modify: `prisma/schema.prisma`

**Interfaces:**
- Produces: enums `PrintJobStatus { PENDING PRINTED FAILED }`, `PrintJobKind { ORDER TEST }`; model `PrintJob { id, establishmentId, orderId?, kind, status, payloadB64, attempts, error?, createdAt, printedAt? }`; `Establishment.{printAgentToken@unique, printerIp, printEnabled}` + relação `printJobs`.

- [ ] **Step 1: Editar `prisma/schema.prisma`** — adicionar os enums (após `PaymentProvider`):
```prisma
enum PrintJobStatus { PENDING  PRINTED  FAILED }
enum PrintJobKind   { ORDER  TEST }
```
Adicionar o model (após `model Payment`):
```prisma
model PrintJob {
  id              String         @id @default(cuid())
  establishmentId String
  establishment   Establishment  @relation(fields: [establishmentId], references: [id], onDelete: Cascade)
  orderId         String?
  kind            PrintJobKind   @default(ORDER)
  status          PrintJobStatus @default(PENDING)
  payloadB64      String         @db.Text
  attempts        Int            @default(0)
  error           String?
  createdAt       DateTime       @default(now())
  printedAt       DateTime?

  @@index([establishmentId, status])
}
```
Em `model Establishment`, junto aos campos de pagamento:
```prisma
  printAgentToken String?  @unique
  printerIp       String?
  printEnabled    Boolean  @default(false)
```
E na lista de relações do Establishment adicionar: `printJobs PrintJob[]`.

- [ ] **Step 2: Aplicar** — `npx prisma db push --accept-data-loss` (aditivo; o warning do índice único em coluna nova é falso-positivo) seguido de `npx prisma generate`.

- [ ] **Step 3: Verificar** — `npx tsc --noEmit` (limpo) + `npm run lint` (limpo). O client Prisma agora tem `prisma.printJob` e os campos novos.

---

### Task 2: Renderizador ESC/POS + mapeador de comanda

**Files:**
- Create: `lib/print/escpos.ts`
- Create: `lib/print/ticket.ts`
- Test: `tests/print/escpos.test.ts`, `tests/print/ticket.test.ts`

**Interfaces:**
- Produces:
  - `type TicketData = { establishment: string; code: string; number: number; location: string; customer?: string; timeLabel: string; items: { qty: number; name: string; total: number }[]; subtotal: number; platformFee: number; serviceFee: number; total: number; note?: string }`
  - `renderTicket(t: TicketData): Uint8Array`
  - `orderToTicket(o: OrderForTicket): TicketData` (OrderForTicket definido abaixo)

- [ ] **Step 1: Escrever o teste que falha** — `tests/print/escpos.test.ts`
```ts
import { describe, it, expect } from "vitest";
import { renderTicket, type TicketData } from "@/lib/print/escpos";

const t: TicketData = {
  establishment: "Quiosque do Mar", code: "PED-ABC123", number: 42, location: "Guarda-sol 14",
  customer: "João", timeLabel: "14:32",
  items: [{ qty: 2, name: "Água de coco", total: 16 }],
  subtotal: 16, platformFee: 1.28, serviceFee: 1.6, total: 18.88, note: "sem gelo",
};

describe("renderTicket", () => {
  it("começa com init ESC @ e termina com corte GS V 0", () => {
    const b = renderTicket(t);
    expect([b[0], b[1]]).toEqual([0x1b, 0x40]);
    const tail = Array.from(b.slice(-3));
    expect(tail).toEqual([0x1d, 0x56, 0x00]);
  });
  it("contém o código do pedido e normaliza acentos (Agua, nao Água)", () => {
    const s = Buffer.from(renderTicket(t)).toString("latin1");
    expect(s).toContain("PED-ABC123");
    expect(s).toContain("Agua de coco");
    expect(s).not.toContain("Água");
  });
});
```

- [ ] **Step 2: Rodar e ver falhar** — `npm test -- escpos` → FAIL (módulo não existe).

- [ ] **Step 3: Implementar `lib/print/escpos.ts`**
```ts
export type TicketData = {
  establishment: string;
  code: string;
  number: number;
  location: string;
  customer?: string;
  timeLabel: string;
  items: { qty: number; name: string; total: number }[];
  subtotal: number;
  platformFee: number;
  serviceFee: number;
  total: number;
  note?: string;
};

const ESC = 0x1b;
const GS = 0x1d;
const WIDTH = 48; // colunas (impressora 80mm)

function ascii(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "");
}
function brl(v: number): string {
  return "R$ " + v.toFixed(2).replace(".", ",");
}
function row(left: string, right: string): string {
  const l = ascii(left);
  const r = ascii(right);
  const space = Math.max(1, WIDTH - l.length - r.length);
  return l + " ".repeat(space) + r;
}

class Builder {
  private bytes: number[] = [];
  raw(...b: number[]): this { this.bytes.push(...b); return this; }
  line(s = ""): this {
    for (const ch of ascii(s)) this.bytes.push(ch.charCodeAt(0) & 0xff);
    this.bytes.push(0x0a);
    return this;
  }
  build(): Uint8Array { return Uint8Array.from(this.bytes); }
}

export function renderTicket(t: TicketData): Uint8Array {
  const b = new Builder();
  b.raw(ESC, 0x40);            // init
  b.raw(ESC, 0x61, 0x01);      // center
  b.raw(GS, 0x21, 0x11);       // double size
  b.line(t.establishment);
  b.raw(GS, 0x21, 0x00);       // normal
  b.line("COMANDA");
  b.raw(ESC, 0x61, 0x00);      // left
  b.line("-".repeat(WIDTH));
  b.line("Pedido " + t.code + "  #" + t.number);
  b.line("Local: " + t.location + "   " + t.timeLabel);
  if (t.customer) b.line("Cliente: " + t.customer);
  b.line("-".repeat(WIDTH));
  for (const it of t.items) b.line(row(it.qty + "x " + it.name, brl(it.total)));
  b.line("-".repeat(WIDTH));
  b.line(row("Subtotal", brl(t.subtotal)));
  b.line(row("Taxa Jurandir", brl(t.platformFee)));
  b.line(row("Taxa servico", brl(t.serviceFee)));
  b.raw(ESC, 0x45, 0x01);      // bold on
  b.line(row("TOTAL", brl(t.total)));
  b.raw(ESC, 0x45, 0x00);      // bold off
  if (t.note) { b.line("-".repeat(WIDTH)); b.line("Obs: " + t.note); }
  b.raw(ESC, 0x64, 0x04);      // feed 4
  b.raw(GS, 0x56, 0x00);       // full cut
  return b.build();
}
```

- [ ] **Step 4: Rodar e ver passar** — `npm test -- escpos` → PASS.

- [ ] **Step 5: Escrever teste + implementar `lib/print/ticket.ts`** — `tests/print/ticket.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { orderToTicket } from "@/lib/print/ticket";

describe("orderToTicket", () => {
  it("mapeia pedido → TicketData com total por item", () => {
    const t = orderToTicket({
      code: "PED-1", number: 7, locationLabel: "Mesa 3", customerName: null, note: null,
      createdAt: new Date("2026-07-27T14:32:00"),
      subtotal: 16, platformFee: 1.28, serviceFee: 1.6, total: 18.88,
      items: [{ qty: 2, name: "Coco", unitPrice: 8 }],
      establishment: { name: "Quiosque" },
    });
    expect(t.establishment).toBe("Quiosque");
    expect(t.items[0]).toEqual({ qty: 2, name: "Coco", total: 16 });
    expect(t.total).toBe(18.88);
  });
});
```
Implementação `lib/print/ticket.ts`:
```ts
import type { TicketData } from "./escpos";

export type OrderForTicket = {
  code: string;
  number: number;
  locationLabel: string;
  customerName: string | null;
  note: string | null;
  createdAt: Date;
  subtotal: unknown;
  platformFee: unknown;
  serviceFee: unknown;
  total: unknown;
  items: { qty: number; name: string; unitPrice: unknown }[];
  establishment: { name: string };
};

const n = (v: unknown): number => Number(v ?? 0);

export function orderToTicket(o: OrderForTicket): TicketData {
  return {
    establishment: o.establishment.name,
    code: o.code,
    number: o.number,
    location: o.locationLabel,
    customer: o.customerName ?? undefined,
    timeLabel: o.createdAt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
    items: o.items.map((i) => ({ qty: i.qty, name: i.name, total: n(i.unitPrice) * i.qty })),
    subtotal: n(o.subtotal),
    platformFee: n(o.platformFee),
    serviceFee: n(o.serviceFee),
    total: n(o.total),
    note: o.note ?? undefined,
  };
}
```

- [ ] **Step 6: Verificar** — `npm test -- print` (PASS) + `npx tsc --noEmit` + `npm run lint`.

---

### Task 3: Fila `lib/db/print.ts` + gatilho ao entrar em produção

**Files:**
- Create: `lib/db/print.ts`
- Modify: `lib/db/payments.ts`, `lib/db/orders.ts`

**Interfaces:**
- Consumes: `renderTicket`/`TicketData` (Task 2), `orderToTicket`/`OrderForTicket` (Task 2).
- Produces: `enqueuePrintJob(orderId)`, `enqueueTestJob(establishmentId)`, `takePendingJobs(establishmentId, limit?)`, `ackJob(jobId, ok, error?)`.

- [ ] **Step 1: Implementar `lib/db/print.ts`**
```ts
import { prisma } from "./prisma";
import { renderTicket, type TicketData } from "@/lib/print/escpos";
import { orderToTicket } from "@/lib/print/ticket";

const toB64 = (bytes: Uint8Array): string => Buffer.from(bytes).toString("base64");

/** Enfileira a comanda de um pedido. Idempotente por pedido; só se printEnabled. */
export async function enqueuePrintJob(orderId: string): Promise<void> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      items: true,
      establishment: { select: { id: true, name: true, printEnabled: true } },
    },
  });
  if (!order || !order.establishment.printEnabled) return;
  const existing = await prisma.printJob.findFirst({ where: { orderId, kind: "ORDER" } });
  if (existing) return;
  const payloadB64 = toB64(renderTicket(orderToTicket(order)));
  await prisma.printJob.create({
    data: { establishmentId: order.establishment.id, orderId, kind: "ORDER", payloadB64 },
  });
}

/** Enfileira uma comanda de teste (botão do admin). */
export async function enqueueTestJob(establishmentId: string): Promise<void> {
  const est = await prisma.establishment.findUnique({
    where: { id: establishmentId },
    select: { name: true },
  });
  if (!est) return;
  const sample: TicketData = {
    establishment: est.name, code: "PED-TESTE", number: 0, location: "Balcao", timeLabel: "00:00",
    items: [{ qty: 1, name: "Teste de impressao", total: 0 }],
    subtotal: 0, platformFee: 0, serviceFee: 0, total: 0, note: "Comanda de teste Jurandir",
  };
  await prisma.printJob.create({
    data: { establishmentId, kind: "TEST", payloadB64: toB64(renderTicket(sample)) },
  });
}

export function takePendingJobs(establishmentId: string, limit = 5) {
  return prisma.printJob.findMany({
    where: { establishmentId, status: "PENDING" },
    orderBy: { createdAt: "asc" },
    take: limit,
    select: { id: true, payloadB64: true },
  });
}

export async function ackJob(jobId: string, ok: boolean, error?: string): Promise<void> {
  const job = await prisma.printJob.findUnique({ where: { id: jobId }, select: { attempts: true } });
  if (!job) return;
  if (ok) {
    await prisma.printJob.update({
      where: { id: jobId },
      data: { status: "PRINTED", printedAt: new Date(), error: null },
    });
  } else {
    const attempts = job.attempts + 1;
    await prisma.printJob.update({
      where: { id: jobId },
      data: { attempts, error: error ?? "erro", status: attempts >= 5 ? "FAILED" : "PENDING" },
    });
  }
}
```

- [ ] **Step 2: Gatilho em `lib/db/payments.ts`** — no `confirmChargePaid`, após a `$transaction` que seta `IN_PRODUCTION`, enfileirar a impressão. Adicionar o import no topo: `import { enqueuePrintJob } from "./print";` e, ao final do bloco que confirma o pagamento (depois do `$transaction([...])`), acrescentar:
```ts
  await enqueuePrintJob(payment.order.id);
```

- [ ] **Step 3: Gatilho em `lib/db/orders.ts`** — no `createOrder`, o caminho simulado já nasce `IN_PRODUCTION`. Trocar o `return prisma.order.create({...})` por capturar o resultado e enfileirar quando em produção. Adicionar import no topo: `import { enqueuePrintJob } from "./print";`. No fim de `createOrder`, substituir:
```ts
  return prisma.order.create({ /* ...data..., */ include: ORDER_INCLUDE });
```
por:
```ts
  const created = await prisma.order.create({ /* ...data..., */ include: ORDER_INCLUDE });
  if (created.status === OrderStatus.IN_PRODUCTION) await enqueuePrintJob(created.id);
  return created;
```
(Manter o objeto `data`/`include` exatamente como está; só passa a `const created = await …` + o `if` + `return`.)

- [ ] **Step 4: Verificar** — `npx tsc --noEmit` + `npm run lint` + `npm test` (os testes de Task 2 seguem verdes; `enqueue/ack` são DB → cobertos pela E2E deferida, sem unit test isolado, como no resto do repo).

---

### Task 4: Endpoints do agente

**Files:**
- Create: `app/api/print/jobs/route.ts`, `app/api/print/ack/route.ts`

**Interfaces:**
- Consumes: `takePendingJobs`, `ackJob` (Task 3).

- [ ] **Step 1: `app/api/print/jobs/route.ts`**
```ts
import { prisma } from "@/lib/db/prisma";
import { takePendingJobs } from "@/lib/db/print";

export async function GET(req: Request): Promise<Response> {
  const token = req.headers.get("x-print-token");
  if (!token) return new Response("unauthorized", { status: 401 });
  const est = await prisma.establishment.findUnique({
    where: { printAgentToken: token },
    select: { id: true },
  });
  if (!est) return new Response("unauthorized", { status: 401 });
  const jobs = await takePendingJobs(est.id);
  return Response.json({ jobs });
}
```

- [ ] **Step 2: `app/api/print/ack/route.ts`**
```ts
import { prisma } from "@/lib/db/prisma";
import { ackJob } from "@/lib/db/print";

export async function POST(req: Request): Promise<Response> {
  const token = req.headers.get("x-print-token");
  if (!token) return new Response("unauthorized", { status: 401 });
  const est = await prisma.establishment.findUnique({
    where: { printAgentToken: token },
    select: { id: true },
  });
  if (!est) return new Response("unauthorized", { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { jobId?: string; ok?: boolean; error?: string };
  if (!body.jobId) return new Response("bad request", { status: 400 });
  const job = await prisma.printJob.findUnique({
    where: { id: body.jobId },
    select: { establishmentId: true },
  });
  if (!job || job.establishmentId !== est.id) return new Response("forbidden", { status: 403 });
  await ackJob(body.jobId, Boolean(body.ok), body.error);
  return new Response("ok", { status: 200 });
}
```

- [ ] **Step 3: Verificar** — `npx tsc --noEmit` + `npm run lint` + `npm test`.

---

### Task 5: Config no admin (ações + UI)

**Files:**
- Modify: `lib/actions/admin.ts`, `lib/admin/adapters.ts`, `lib/data/admin.ts`, `components/admin/sections/CadastrosSection.tsx`, `messages/pt.json`, `messages/en.json`

**Interfaces:**
- Consumes: `enqueueTestJob` (Task 3), `assertAdmin` (existente).
- Produces: `setPrinterConfigAction(estId, printerIp, printEnabled)`, `regeneratePrintTokenAction(estId) → { ok, token? }`, `testPrintAction(estId) → { ok, error? }`; `AdminEst.{printerIp?, printEnabled?, hasPrintToken?}`.

- [ ] **Step 1: Ações em `lib/actions/admin.ts`** — imports no topo:
```ts
import { randomBytes } from "crypto";
import { enqueueTestJob } from "@/lib/db/print";
```
Ao final do arquivo:
```ts
export async function setPrinterConfigAction(
  estId: string,
  printerIp: string,
  printEnabled: boolean,
): Promise<{ ok: boolean }> {
  await assertAdmin();
  await prisma.establishment.update({
    where: { id: estId },
    data: { printerIp: printerIp.trim() || null, printEnabled },
  });
  revalidatePath("/admin");
  return { ok: true };
}

export async function regeneratePrintTokenAction(estId: string): Promise<{ ok: boolean; token?: string }> {
  await assertAdmin();
  const token = "jpa_" + randomBytes(24).toString("hex");
  await prisma.establishment.update({ where: { id: estId }, data: { printAgentToken: token } });
  revalidatePath("/admin");
  return { ok: true, token };
}

export async function testPrintAction(estId: string): Promise<{ ok: boolean; error?: string }> {
  await assertAdmin();
  const est = await prisma.establishment.findUnique({
    where: { id: estId },
    select: { printAgentToken: true },
  });
  if (!est?.printAgentToken) return { ok: false, error: "noToken" };
  await enqueueTestJob(estId);
  return { ok: true };
}
```

- [ ] **Step 2: Expor no adapter** — `lib/data/admin.ts` em `AdminEst` (após `paymentOnboarded?`):
```ts
  printerIp?: string;
  printEnabled?: boolean;
  hasPrintToken?: boolean;
```
`lib/admin/adapters.ts`: no `DbEst` adicionar `printerIp: string | null; printEnabled: boolean; printAgentToken: string | null;` e no retorno de `toAdminEst` (após `paymentOnboarded`):
```ts
    printerIp: db.printerIp ?? "",
    printEnabled: db.printEnabled,
    hasPrintToken: Boolean(db.printAgentToken),
```
(`getAdminEstablishments` já traz todos os scalars — sem mudança na query.)

- [ ] **Step 3: UI na `CadastrosSection.tsx`** — imports:
```ts
import { setPrinterConfigAction, regeneratePrintTokenAction, testPrintAction } from "@/lib/actions/admin";
```
Componente (junto do `PaymentConnect`):
```tsx
function PrinterConfig({ e }: { e: AdminEst }) {
  const t = useTranslations("admin.cadastros");
  const [ip, setIp] = useState(e.printerIp ?? "");
  const [enabled, setEnabled] = useState(Boolean(e.printEnabled));
  const [token, setToken] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const save = async (next: boolean) => {
    setEnabled(next);
    await setPrinterConfigAction(e.id, ip, next);
    setMsg(t("printSaved"));
  };
  const gen = async () => {
    const r = await regeneratePrintTokenAction(e.id);
    if (r.ok && r.token) setToken(r.token);
  };
  const test = async () => {
    const r = await testPrintAction(e.id);
    setMsg(r.ok ? t("printTestQueued") : t("printNeedToken"));
  };

  return (
    <div className="flex flex-col gap-1.5 text-[11px]">
      <div className="flex flex-wrap items-center gap-1.5">
        <input
          value={ip}
          onChange={(ev) => setIp(ev.target.value)}
          onBlur={() => setPrinterConfigAction(e.id, ip, enabled)}
          placeholder={t("printerIp")}
          className="w-32 rounded border border-ink/20 px-2 py-1"
        />
        <button type="button" onClick={() => save(!enabled)} className="rounded-lg bg-ink px-2.5 py-1 font-bold text-sand">
          {enabled ? t("printOn") : t("printOff")}
        </button>
        <button type="button" onClick={gen} className="rounded-lg bg-ink/10 px-2.5 py-1 font-bold text-ink">
          {e.hasPrintToken ? t("printRegen") : t("printGen")}
        </button>
        <button type="button" onClick={test} className="rounded-lg bg-ink/10 px-2.5 py-1 font-bold text-ink">
          {t("printTest")}
        </button>
      </div>
      {token && <code className="break-all rounded bg-amber-50 px-2 py-1 text-[10px]">{token}</code>}
      {msg && <span className="text-ink/60">{msg}</span>}
    </div>
  );
}
```
Renderizar dentro do card, após o bloco do `PaymentConnect`:
```tsx
              <div className="mt-2 border-t border-ink/10 pt-2">
                <PrinterConfig e={e} />
              </div>
```

- [ ] **Step 4: Mensagens** — em `messages/pt.json` e `messages/en.json`, no namespace `admin.cadastros`, adicionar:
  - PT: `printerIp`="IP da impressora", `printOn`="Impressão ativa", `printOff`="Impressão desativada", `printGen`="Gerar token", `printRegen`="Novo token", `printTest`="Imprimir teste", `printSaved`="Config salva", `printTestQueued`="Comanda de teste enfileirada", `printNeedToken`="Gere o token do agente primeiro".
  - EN: `printerIp`="Printer IP", `printOn`="Printing on", `printOff`="Printing off", `printGen`="Generate token", `printRegen`="New token", `printTest`="Test print", `printSaved`="Config saved", `printTestQueued`="Test ticket queued", `printNeedToken`="Generate the agent token first".

- [ ] **Step 5: Verificar** — `node -e "require('./messages/pt.json');require('./messages/en.json')"` + `npx tsc --noEmit` + `npm run lint` + `npm test`.

---

### Task 6: Agente local

**Files:**
- Create: `agent/jurandir-print-agent.mjs`, `agent/.env.example`, `agent/README.md`

**Interfaces:**
- Consumes: endpoints `GET /api/print/jobs` e `POST /api/print/ack` (Task 4).

- [ ] **Step 1: `agent/jurandir-print-agent.mjs`**
```js
import net from "node:net";

const API = process.env.JURANDIR_API_URL;
const TOKEN = process.env.PRINT_AGENT_TOKEN;
const IP = process.env.PRINTER_IP;
const PORT = Number(process.env.PRINTER_PORT || 9100);
const POLL = Number(process.env.POLL_MS || 3000);

if (!API || !TOKEN || !IP) {
  console.error("Configure JURANDIR_API_URL, PRINT_AGENT_TOKEN e PRINTER_IP (veja .env.example).");
  process.exit(1);
}

function printBytes(buf) {
  return new Promise((resolve, reject) => {
    const sock = net.connect(PORT, IP, () => sock.write(buf, () => sock.end()));
    sock.on("close", resolve);
    sock.on("error", reject);
    sock.setTimeout(10000, () => { sock.destroy(); reject(new Error("timeout")); });
  });
}

async function ack(jobId, ok, error) {
  await fetch(`${API}/api/print/ack`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-print-token": TOKEN },
    body: JSON.stringify({ jobId, ok, error }),
  }).catch(() => {});
}

async function tick() {
  let jobs = [];
  try {
    const res = await fetch(`${API}/api/print/jobs`, { headers: { "x-print-token": TOKEN } });
    if (!res.ok) { console.error("poll", res.status); return; }
    jobs = (await res.json()).jobs ?? [];
  } catch (e) { console.error("poll erro:", e.message); return; }
  for (const job of jobs) {
    try {
      await printBytes(Buffer.from(job.payloadB64, "base64"));
      await ack(job.id, true);
      console.log("impresso:", job.id);
    } catch (e) {
      await ack(job.id, false, e.message);
      console.error("falha ao imprimir", job.id, "-", e.message);
    }
  }
}

console.log(`Jurandir print agent → ${IP}:${PORT} · poll ${POLL}ms`);
setInterval(tick, POLL);
tick();
```

- [ ] **Step 2: `agent/.env.example`**
```
JURANDIR_API_URL=http://192.168.0.10:3000
PRINT_AGENT_TOKEN=cole-o-token-gerado-no-admin
PRINTER_IP=192.168.0.50
PRINTER_PORT=9100
POLL_MS=3000
```

- [ ] **Step 3: `agent/README.md`** — instruções:
```markdown
# Jurandir — Agente de impressão

Roda numa máquina sempre-ligada na mesma rede da impressora (PC do caixa, Raspberry Pi).
Requer Node 18+.

1. Copie `.env.example` para `.env` e preencha:
   - `JURANDIR_API_URL`: URL do sistema (deploy, ou http://IP-do-servidor:3000 na rede local).
   - `PRINT_AGENT_TOKEN`: gere no admin (card do estabelecimento → "Gerar token").
   - `PRINTER_IP` / `PRINTER_PORT`: IP da impressora de rede (porta padrão 9100).
2. Rode: `node --env-file=.env jurandir-print-agent.mjs`
3. No admin, ative "Impressão ativa" e clique "Imprimir teste".

O agente busca comandas pendentes a cada poucos segundos e envia à impressora. Só faz conexões
de saída (nenhuma porta precisa ser aberta no roteador do bar).
```

- [ ] **Step 4: Verificar** — `node --check agent/jurandir-print-agent.mjs` (sintaxe OK). O agente não entra no `tsc` (é `.mjs` fora do app). Rodar `npm run lint` + `npm test` pra confirmar que o app segue limpo.

---

## E2E deferida (quando houver impressora)

Não é task (bloqueada por hardware). Roteiro: gerar token no admin → preencher `.env` do agente → rodar o agente → "Imprimir teste" → conferir a comanda saindo; depois um pedido real (em produção) deve imprimir sozinho. Sem hardware: decodificar o `payloadB64` de um `PrintJob TEST` e inspecionar os bytes/preview.

## Self-Review (checklist)

**1. Cobertura da spec:** `PrintJob`+campos (T1) ✓; renderer + ticket (T2) ✓; fila + gatilho IN_PRODUCTION (T3) ✓; endpoints GET/ACK + token (T4) ✓; admin (IP/token/toggle/teste) (T5) ✓; agente (T6) ✓; idempotência/attempts/FAILED (T3 `ackJob`/`enqueuePrintJob`) ✓; teste físico deferido ✓.

**2. Placeholders:** nenhum "TBD"; único vazio é o `.env.example` do agente (por design).

**3. Consistência de tipos:** `TicketData` definido em T2 e usado em T3 (`enqueueTestJob`); `renderTicket`/`orderToTicket` assinaturas idênticas entre T2 e T3; `takePendingJobs`/`ackJob` iguais entre T3 e T4; `x-print-token` idêntico entre T4 e T6; `PrintJob.payloadB64` (base64) consistente da fila (T3) ao agente (T6).
