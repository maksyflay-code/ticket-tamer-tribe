# Solicitações Internas — Módulo Unificado

## Visão geral

Criar um módulo único `/solicitacoes` com formulário dinâmico por tipo, workflow simples (Aberta → Em andamento → Concluída/Cancelada) e integração com os geradores de PDF existentes (RFO e Trânsito).

## Tipos suportados

1. **Trânsito VTAL** — migra do gerador atual; ao concluir, gera PDF automaticamente
2. **RFO (Relatório Final de Ocorrência)** — migra do gerador atual; gera PDF ao concluir
3. **Compras** — itens, quantidade, fornecedor sugerido, valor estimado, justificativa
4. **Manutenção programada** — equipamento/POP, janela (início/fim), impacto, plano de rollback
5. **Acesso/Credenciais** — usuário/sistema solicitado, tipo de acesso, motivo, prazo
6. **Reembolso** — descrição, valor, data, categoria (combustível/alimentação/outros), anexo do comprovante
7. **Veículo/Frota** — veículo, data/hora retirada e devolução, destino, motivo

## Banco de dados

Tabela única `solicitacoes`:
- `id`, `numero` (sequencial), `tipo` (enum), `titulo`, `descricao`
- `status` (enum: aberta, em_andamento, concluida, cancelada)
- `solicitante_id`, `solicitante_email`
- `responsavel_id`, `responsavel_nome` (quem está executando)
- `chamado_id` (opcional, link para chamado relacionado)
- `cliente_id` (opcional)
- `dados` (jsonb) — campos específicos do tipo
- `documento_id` (fk opcional para `documentos_gerados` quando há PDF)
- `created_at`, `updated_at`, `concluida_at`, `cancelada_at`

Tabela `solicitacao_historico`:
- `id`, `solicitacao_id`, `tipo` (criacao, mudanca_status, comentario, anexo)
- `descricao`, `status_anterior`, `status_novo`, `autor`, `created_at`

Trigger para registrar mudanças de status (espelhando `log_chamado_status_change`).

RLS: padrão do projeto (`can_read`, `can_write`, `is_admin`).

## Telas

- **`/solicitacoes`** — lista com filtros (tipo, status, responsável), busca por número/título
- **Botão "Nova solicitação"** — modal escolhe o tipo, depois abre formulário dinâmico
- **Detalhe da solicitação** (modal ou drawer) — dados, histórico, ações (assumir, concluir, cancelar, gerar PDF)
- **Sidebar** — novo item "Solicitações"

## Integração com PDFs

- Rotas atuais `/rfo` e `/transito-vtal` viram **atalhos** que abrem o formulário de criação no tipo correspondente
- Ao concluir uma solicitação de tipo `rfo` ou `transito`, chamamos `salvarDocumentoGerado` reaproveitando a lógica atual e vinculamos `documento_id`
- Mantemos os PDFs gerados aparecendo em `/documentos`

## Detalhes técnicos

- Formulário dinâmico: um componente por tipo em `src/components/solicitacoes/forms/` (TransitoForm, RfoForm, ComprasForm, ManutencaoForm, AcessoForm, ReembolsoForm, VeiculoForm)
- Schemas Zod por tipo em `src/lib/solicitacoes-schemas.ts`
- Helpers em `src/lib/solicitacoes.ts` (CRUD via client `supabase`)
- Anexos reutilizam bucket `chamado-anexos` (renomear escopo) ou criamos `solicitacao-anexos` — sugiro criar bucket próprio

## Ordem de implementação

1. Migration: enums, tabelas, trigger, RLS, bucket
2. Schemas + helpers
3. Tela de lista + sidebar
4. Modal "Nova solicitação" + formulários por tipo
5. Detalhe + ações de workflow
6. Integração com geradores de PDF (RFO/Trânsito)
7. Atalhos de `/rfo` e `/transito-vtal` para o novo fluxo
