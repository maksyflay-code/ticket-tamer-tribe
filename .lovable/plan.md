## Visão geral

4 entregas em sequência, compartilhando uma nova tabela `sla_config` que substitui o SLA hardcoded (hoje: urgente 4h / alta 8h / média 24h / baixa 72h).

---

## 1. Configuração de SLA (admin)

**Nova tabela `sla_config`** — uma linha por prioridade (`urgente`, `alta`, `media`, `baixa`) com:
- `horas_resolucao` (int) — prazo para resolver
- `horas_resposta` (int, opcional) — prazo para 1º atendimento
- `updated_at`

**RLS:** todos autenticados leem; só `admin` atualiza. Seed com os valores atuais.

**Nova rota `/configuracoes/sla`** (visível só pra admin no menu lateral):
- Tabela com 4 linhas (uma por prioridade) editáveis inline
- Campos: horas pra resolver / horas pra primeira resposta
- Botão "Salvar" por linha; toast de confirmação
- Pré-visualização ("Urgente: até 4h após abertura")

**Refator:** dashboard e chamados deixam de usar a constante `SLA_HORAS` e passam a buscar de `sla_config` (carregado uma vez em cache via React Query / estado global leve).

---

## 2. SLA visual no chamado

No detalhe do chamado e na lista:
- **Contador regressivo** quando aberto/em_andamento — "Vence em 2h 13m" ou "Estourou há 1h 04m"
- **Barra de progresso** colorida:
  - verde (<60% do prazo)
  - amarelo (60–90%)
  - vermelho (>90% ou estourado)
- **Badge "SLA OK / SLA estourado"** quando resolvido (compara `resolvido_at - created_at` com o prazo da prioridade)
- Atualização a cada 60s via `setInterval`

---

## 4. Atribuição rápida e histórico

No detalhe do chamado:
- Botão **"Pegar pra mim"** ao lado de "Responsável" (quando vazio ou diferente do usuário atual) — seta `responsavel_id` e `tecnico_responsavel` em uma ação
- Botão **"Liberar"** para o responsável atual se desatribuir
- Trigger já existente (`log_chamado_status_change`) registra a troca no histórico — nada a fazer no DB

Na lista de chamados:
- Coluna "Responsável" mostra avatar/iniciais + nome
- Filtro rápido "Meus chamados" (chips no topo)

---

## 7. Página do cliente

**Nova rota `/clientes/$id`** (clique no nome do cliente na listagem):
- Cabeçalho: nome, documento, contato, status, plano contratado, data do contrato
- Cards de métricas: total de chamados, abertos agora, tempo médio de resolução, % SLA cumprido
- Tabela "Histórico de chamados" desse cliente (código, título, status, prioridade, abertura, resolução)
- Botão "Abrir novo chamado" já pré-preenchendo o cliente

---

## Detalhes técnicos

- Migração SQL: cria `sla_config` + RLS + seed das 4 prioridades.
- `src/lib/sla.functions.ts`: `getSlaConfig()` e `updateSlaConfig()` (admin-only via `requireSupabaseAuth` + checagem `has_role`).
- `src/lib/sla.ts` (helper client): `calcSlaStatus(prioridade, created_at, resolvido_at?, config)` retorna `{ pct, label, color, estourado }`.
- `src/routes/configuracoes.sla.tsx`: nova rota admin.
- `src/routes/clientes.$id.tsx`: nova rota detalhe.
- Edições em `chamados.tsx` (SLA visual + botão pegar pra mim + filtro "meus") e `dashboard.tsx` (usa config dinâmica).
- Item no menu lateral "Config. SLA" só para `role === 'admin'`.

---

## Ordem de execução

1. Migração `sla_config` + seed
2. Server fns + rota `/configuracoes/sla`
3. Helper SLA + integração no dashboard e lista de chamados (barra + contador)
4. "Pegar pra mim" + filtro "Meus chamados"
5. Página `/clientes/$id` com métricas e histórico