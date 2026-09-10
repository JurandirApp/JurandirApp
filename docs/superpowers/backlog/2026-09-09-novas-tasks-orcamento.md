# Novas tasks — lote de orçamento (2026-09-09)

Anotações de escopo para o orçamento. **Nenhuma destas tem design aprovado ainda** — cada uma precisa do seu próprio round de brainstorming → spec → plano antes de virar código.

A ordem aqui é a ordem em que foram levantadas, não a de prioridade.

---

## 1. Painel de tracking de pedidos (mesa / garçom / QR Code)

### O que é

Um painel no estabelecimento com o histórico completo de todos os pedidos: quais mesas, últimos pedidos, o que foi pedido, qual garçom entregou, qual QR Code originou. Filtrável por mesa e por garçom. Objetivo é tracking total do fluxo.

### O que já existe no código

- `OrderEvent` (`prisma/schema.prisma:258`) já modela a trilha: `type` (PAID / IN_PRODUCTION / READY / PICKED / DELIVERED), `waiterId`, `orderItemId`, `qty`, `at`. **A trilha de auditoria já está desenhada.**
- `Order.locationLabel` guarda a mesa; `QrSpot` guarda os pontos de QR.
- `Order` tem `code`, `number`, `status`, `customerName`, timestamps.

### O que falta / riscos

- **Dependência dura: o Módulo do Garçom não está implementado.** Os 5 planos estão escritos (`docs/superpowers/plans/2026-09-09-modulo-garcom-*`) mas nada foi construído. Sem ele, `OrderEvent.waiterId` nunca é populado e o filtro "por garçom" não tem dado nenhum. **Esta task depende do módulo do garçom estar entregue** — precisa entrar depois dele no cronograma, ou o painel nasce com metade das colunas vazias.
- `Order.locationLabel` é `String` livre, **não é FK para `QrSpot`**. Filtrar por mesa hoje é comparação de texto — quebra com "Mesa 3" vs "mesa 3" vs "Mesa 03". Provavelmente precisa de migração ligando `Order` a `QrSpot` por id.
- `OrderEvent` só tem `@@index([orderId])`. Um painel com filtro por garçom + período vai precisar de índices novos, senão a query varre a tabela inteira conforme o histórico cresce.
- Decisões em aberto: janela de retenção do histórico (30 / 90 dias / tudo?), exportação (CSV?), e se é read-only ou permite ação sobre o pedido.

### Tamanho

Médio. A modelagem favorece, mas está travado pela dependência do garçom.

---

## 2. Ajuste de preço em massa do cardápio

### O que é

No cadastro do cardápio, um botão de ajuste em lote: aplicar um percentual sobre um conjunto de itens de uma vez. Exemplo dado pelo cliente: +20% em todas as bebidas alcoólicas, +15% nas bebidas comuns, +30% nas comidas — em uma operação, sem editar item por item.

### O que já existe no código

- `MenuItem` (`prisma/schema.prisma:142`) tem `category` e `subcategory` — os eixos naturais de seleção do lote.
- `MenuItem.oldPrice` já existe. Serve tanto para exibir "de/por" quanto como base para desfazer o ajuste.

### O que falta / riscos

- **`category` e `subcategory` são String livre.** O exemplo do cliente ("bebidas alcoólicas" vs "bebidas comuns") só funciona se as categorias estiverem nomeadas de forma consistente no cardápio real dele. Se o estabelecimento digitou livremente, o agrupamento não fecha. **Verificar os dados reais antes de estimar** — pode virar uma sub-task de normalização de categorias.
- **Precisa de preview antes de aplicar.** Um ajuste em massa errado destrói o cardápio inteiro de uma vez. A tela tem que mostrar a lista "de → para" e exigir confirmação.
- **Precisa de desfazer.** Idem. `oldPrice` dá o caminho, mas só guarda um nível de histórico.
- Decisões de produto em aberto:
  - Regra de arredondamento. R$ 12,34 +20% = R$ 14,808. Vira 14,81? 14,90? 14,99? Restaurante costuma querer terminação redonda.
  - O ajuste pega nos adicionais (`MenuItemOption.priceDelta`)? Se o prato subiu 30%, o bacon extra sobe junto?
  - Permite valor fixo além de percentual (+R$ 2 em tudo)?
  - Permite descer o preço (percentual negativo, promoção)?

### Tamanho

Pequeno-médio. A lógica é simples; o cuidado está no preview, no desfazer e no arredondamento. Sem dependência de outra task — **é a mais barata das três e pode entrar primeiro.**

---

## 3. Nota fiscal (NFC-e / NF-e)

### O que é

Emissão de nota fiscal integrada, configurável por estabelecimento, porque cada cliente emite de um jeito:

- **Automático** — nota sai junto com a impressão do pedido (cliente de Lucro Real).
- **Manual** — botão no painel, o estabelecimento escolhe quando e o quê.
- **Desligado** — não usa.

### Urgência legal (checado em 2026-09-09)

- SAT-CF-e encerrado em SP em 31/12/2025; desde jan/2026 todo varejo paulista (restaurante e bar incluídos) é obrigado a emitir NFC-e.
- NT 2025.002 (Reforma Tributária): SEFAZ **rejeita** nota de Lucro Real e Lucro Presumido sem os campos de IBS/CBS **desde 03/08/2026** — ou seja, o cliente de Lucro Real já está com prazo vencido.
- Simples Nacional e MEI: mesma exigência até 04/01/2027.
- Ajuste SINIEF 43/2025: desde 04/05/2026 é vedado NFC-e com destinatário CNPJ — nesse caso é NF-e modelo 55.

### Decisão técnica

**Não integrar direto na SEFAZ.** Usar API de provedor fiscal (BaaS), que absorve layout, contingência e mudanças de legislação.

Recomendado: **Focus NFe** — cobre os 27 estados, múltiplos CNPJs na mesma conta, sem setup, sem fidelidade, homologação grátis. Alternativas: PlugNotas (TecnoSpeed), Nuvem Fiscal.

Custo: Retail R$ 59,90/mês (1 CNPJ, 500 notas) ou **Retail+ R$ 629,90/mês (CNPJs ilimitados, 9.000 notas)**. Com o Retail+ o custo é fixo e compartilhado entre todos os estabelecimentos → vira margem a partir do ~7º cliente pagante do módulo.

### O que já existe no código

- Toda a infra de impressão: `app/api/print/`, `lib/print/escpos.ts`, `lib/print/ticket.ts`, `agent/` (agente local instalado no estabelecimento), models `PrintJob` e `Printer`.
- **O cupom da NFC-e (DANFE simplificado 80mm com QR Code) é só mais um ticket ESC/POS.** Reaproveita a fila e o agente inteiros.

### O que falta

- `Establishment`: bloco fiscal — `cnpj`, `ie`, `regimeTributario`, `csc`, `cscId`, `serie`, `ambiente` (homologação/produção) e `fiscalMode` (`AUTO_ON_PRINT` | `MANUAL` | `OFF`).
- `MenuItem`: campos fiscais — `ncm`, `cest`, `cfop`, `origem`, `cst`/`csosn`, e `cClassTrib` (novo, da reforma).
- Novo model `FiscalDocument`: orderId, modelo (65/55), status, chave, protocolo, número, série, XML, QR Code, motivo de rejeição, ref do provedor.
- Novo `PrintJobKind.FISCAL`.

### Regra de operação inegociável

**A emissão fiscal é assíncrona e nunca bloqueia a comanda.** SEFAZ fora do ar → comanda da cozinha sai normalmente, nota entra em fila / contingência.

### Fases sugeridas

1. **Emissão básica** — config fiscal, modos automático e manual, cupom na térmica, painel de notas (emitida / rejeitada / cancelada), homologação.
2. **Robustez** — cancelamento (janela curta, ~30 min, varia por UF), contingência offline, NF-e mod. 55 para destinatário CNPJ, reprocessamento de rejeição, inutilização de numeração.
3. **NFS-e da taxa da plataforma** (opcional, escopo separado) — a nota de serviço que o Jurandir emite para o estabelecimento sobre `platformFee` / `serviceFee`. Não confundir com a nota do pedido.

### Fora do escopo (deixar explícito na proposta)

- Certificado digital e-CNPJ A1 (~R$ 200-400/ano, um por CNPJ) — do cliente.
- Código CSC — só o estabelecimento consegue gerar no portal da SEFAZ.
- **Classificação fiscal do cardápio** (NCM / CFOP / CST por item) — trabalho de contador, não de dev. **Maior risco escondido do projeto:** bebida tem substituição tributária, comida preparada tem outra regra, e varia por estado. Cardápio de 200 itens é um projeto por si só.
- Consultoria tributária.

### Tamanho

Grande. Mas a infra de impressão já pronta corta boa parte.

---

## Decisões pendentes com o chefe

Travam o fechamento do orçamento:

1. **Classificação fiscal do cardápio é nossa ou do contador do cliente?** Recomendação: entregamos a tela, o contador dele preenche. Se for nossa, o orçamento cresce muito e assumimos risco fiscal.
2. **Modelo de cobrança do módulo fiscal** — embutido na mensalidade ou add-on separado? Recomendação: add-on.
3. **Piloto no cliente de Lucro Real** (prazo já vencido) para a task 3?
4. **Ordem de execução** — a task 1 depende do Módulo do Garçom, que não está implementado. Confirmar se o garçom entra antes no cronograma.

## Ordem sugerida (por dependência e custo)

1. **Task 2** (ajuste de preço) — barata, sem dependência, valor imediato.
2. **Task 3** (nota fiscal) — urgência legal com prazo vencido.
3. **Task 1** (painel de tracking) — só depois do Módulo do Garçom.
