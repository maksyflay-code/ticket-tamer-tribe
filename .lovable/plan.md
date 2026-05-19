# Plano de implementação

Três frentes de trabalho em ordem de execução. Cada uma é independente — se quiser, posso entregar uma de cada vez.

---

## 1. SLA e Operação

**Objetivo:** tornar o SLA visível no dia a dia e automatizar escalonamento.

**Banco:**
- Adicionar coluna `sla_pausado_at` e `sla_pausado_total_seg` em `chamados` (para pausar SLA quando status = "aguardando cliente").
- Trigger que, ao mudar status para/de "aguardando cliente", acumula tempo pausado.

**Frontend:**
- Novo componente `<SlaBadge chamado={...} />` que calcula tempo restante usando `sla_config` + prioridade, descontando pausa.
  - Verde: > 50% restante
  - Amarelo: 20–50%
  - Vermelho/pulsante: < 20% ou estourado
- Mostrar o badge na lista de chamados (`src/routes/chamados.tsx`) e no detalhe.
- Filtro rápido "SLA em risco" e "SLA estourado" no topo da lista.

**Operação:**
- Coluna "Tempo aberto" formatada (2h 15min, 3d 4h).
- Botão "Pausar SLA / Retomar" no detalhe do chamado (muda status para aguardando_cliente).

---

## 2. Relatórios e Dashboards

**Objetivo:** dar visão analítica ao admin/operador.

**Nova rota:** `src/routes/relatorios.tsx` já existe — vou expandir, não recriar.

**Conteúdo:**
- **Cards KPI:** chamados abertos, fechados no mês, MTTR (tempo médio de resolução), % SLA cumprido.
- **Gráfico de barras:** chamados por dia (últimos 30 dias).
- **Heatmap:** abertura por hora × dia da semana.
- **Ranking de técnicos:** chamados resolvidos, MTTR, no período.
- **Top clientes:** quem mais abre chamados.
- **Filtros:** período (7/30/90 dias, customizado), cliente, prioridade.
- **Exportar CSV** do recorte filtrado.

**Tecnologia:** Recharts (já está no projeto via shadcn/chart).

**Dados:** queries diretas em `chamados` + `chamado_historico` via Supabase client (RLS já cobre).

---

## 3. RFOs e Trânsitos Gerados

**Objetivo:** persistir histórico dos PDFs gerados em `transito-vtal.tsx` e `rfo.tsx`, hoje só baixados localmente.

**Banco — nova tabela `documentos_gerados`:**

| coluna | tipo | obs |
|---|---|---|
| id | uuid PK | |
| tipo | text | 'rfo' \| 'transito' |
| titulo | text | nome amigável |
| chamado_id | uuid null | link opcional |
| cliente_id | uuid null | link opcional |
| dados | jsonb | payload usado pra gerar (permite regerar/visualizar) |
| storage_path | text null | caminho do PDF salvo no bucket |
| criado_por | uuid | auth.uid() |
| created_at | timestamptz | default now() |

RLS: select para `can_read`, insert para `can_write`, delete só admin.

**Storage:** bucket novo `documentos-gerados` (privado), upload do PDF gerado.

**Fluxo:**
- Ao clicar "Gerar PDF" em RFO ou Trânsito VTAL, depois de baixar:
  - Upload do PDF no bucket
  - Insert na tabela com `dados` (snapshot do form) e `storage_path`
- Toast de confirmação.

**Nova rota `src/routes/documentos.tsx`:**
- Tabs: "RFOs Gerados" | "Trânsitos Gerados"
- Tabela com: data, título, autor, cliente/chamado vinculado
- Ações por linha: **Baixar** (signed URL do storage), **Regerar** (carrega `dados` no formulário original), **Excluir** (admin).
- Filtros: período, autor, busca textual.

**Menu lateral (`AppShell.tsx`):** novo item "Documentos" com ícone `FileArchive`.

---

## Detalhes técnicos

- Migrations separadas por frente (3 arquivos).
- SLA usa apenas `setInterval` no client pra atualizar o badge (sem polling de servidor).
- Relatórios: agregar no client com `useMemo` em cima de `useQuery` (volumes pequenos).
- Storage upload via `supabase.storage.from('documentos-gerados').upload(...)`; nome do arquivo `${tipo}/${id}.pdf`.

---

## Ordem sugerida de entrega

1. **Documentos gerados** (mais isolado, valor imediato)
2. **SLA visual + pausa**
3. **Relatórios expandidos**

Quer que eu siga essa ordem ou prefere outra? Posso também fazer tudo de uma vez se preferir.