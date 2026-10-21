import { existsSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const ci = 'https://github.com/lucasmasseliamerica-cyber/masseli-business-manager/actions/runs/39427759096';
const sql = 'docs/P0_04_05_SQL_LIFECYCLE_20261013.md';
const hardening = 'docs/NEXALVO_100_PERCENT_CHECKLIST.md';
const done = (title, kind, source, detail) => ({ title, status: 'CONCLUÍDO', evidence: { kind, source, detail } });
const blocked = (title, blocker) => ({ title, status: 'BLOQUEADO', blocker });
const pending = (title, remaining) => ({ title, status: 'PENDENTE', remaining });

// Acceptance inventory v2: eight mandatory online-only Terminal criteria added at user request.
// Commercial site, Stripe checkout and automatic licensing are
// intentionally excluded. Adding tests never increases this denominator or proves a journey.
export const operationalModules = [
  { id: 'sales', name: 'Vendas/PDV', criteria: [
    done('RPC: venda, replay por ID e estorno com financeiro líquido zero', 'REAL_API_CI', ci, 'replay-financial; registros históricos isolados da CI #180'),
    blocked('UI: venda, desconto/imposto, reconsulta após reload e cancelamento', 'Autorização específica para venda TEST isolada, caixa/fixture e compensação'),
    pending('Todos os pagamentos operacionais e recibos conferidos', 'Cartão externo implementado; validar recebimento real sem cobrança pela aplicação'),
    pending('Pagamento misto e regras de devolução homologados', 'Decisão/implementação de split e aceite operacional das devoluções'),
  ] },
  { id: 'stripe-terminal', name: 'P0 Stripe Terminal exclusivamente online', criteria: [
    blocked('Antes da cobrança: backend Stripe autenticado e leitor disponível, sem fallback manual', 'Adapter/backend não implantado; modo Stripe bloqueia cartão; prova real Stripe TEST pendente'),
    blocked('Offline desabilitado explicitamente em todas as integrações Terminal', 'Inspecionar configuração real SDK/leitor; não há SDK nem fila offline implementados'),
    blocked('Timeout/queda/reinício preservam tentativa desconhecida e proíbem novo PaymentIntent', 'Persistência backend/locks e recuperação real autorizada ainda pendentes; núcleo simulado preparado'),
    blocked('Stripe confirma e backend grava venda/estoque/financeiro uma única vez', 'Preparar/revisar migração, RPC privada e integração Stripe; sem escrita ou aplicação autorizada'),
    blocked('Recusa/cancelamento/reconexão conciliados no mesmo PaymentIntent', 'Leitor simulado Stripe e pagamentos TEST controlados dependem de configuração e autorização'),
    blocked('Webhook assinado duplicado/fora de ordem e concorrência não duplicam efeitos', 'Endpoint, segredo seguro de assinatura, deduplicação persistente e testes TEST pendentes'),
    blocked('PDV: seis estados PT/EN e aprovação somente após confirmação backend real', 'Desconectado/bloqueio exercitados em browser simulado; demais estados reais dependem do backend'),
    pending('Wi-Fi/Ethernet/celular validados por modelo, região e firmware compatíveis', 'Definir modelos da operação e comprovar compatibilidade; Wi-Fi sozinho não prova cobrança online'),
  ] },
  { id: 'products', name: 'Produtos e fotos', criteria: [
    blocked('UI: criar, editar/desativar produto e reconsultar persistência', 'Autorização de CRUD TEST isolado e compensação'),
    pending('Receita/composição e custo conferidos com baixa por local', 'Jornada real de composição, venda e conciliação'),
    blocked('Storage privado: upload/substituição/remoção e isolamento', 'Infra privada/quatro policies confirmadas pelo usuário; A-Jornada autorizada, bloqueada por commit 9b381e8/sessões/fixture exclusiva ainda não disponíveis nesta sessão'),
    blocked('Foto real reaparece no catálogo/PDV depois do reload', 'Infra e autorização informadas; falta evidência da jornada real com snapshot/compensação e reload'),
  ] },
  { id: 'inventory', name: 'Estoque', criteria: [
    done('RPC: ajuste/perda/transferência e saldos sob ROLLBACK', 'REAL_SQL_ROLLBACK', sql, 'P0.04 executado no TEST com contexto SQL JWT simulado; não prova login ou UI'),
    blocked('UI: cadastro/edição, ajuste/perda/transferência e histórico', 'Autorização para movimentações isoladas e restauração dos saldos/custos'),
    pending('Contenção concorrente e estoque insuficiente em sessões reais', 'Prova de múltiplos operadores sobre as mesmas posições'),
    blocked('Reconciliação de quantidade e custo médio após ciclo completo', 'Jornada real autorizada e captura dos saldos antes/depois'),
  ] },
  { id: 'purchases', name: 'Compras e fornecedores', criteria: [
    done('RPC: receber parcial/total, pagar/reverter e cancelar rascunho', 'REAL_SQL_ROLLBACK', sql, 'P0.05 TEST sob ROLLBACK com JWT SQL simulado; não é browser persistente'),
    blocked('UI: fornecedor/pedido, recebimento, pagamento e reversão', 'Preflight vigente e autorização específica; compra persistente continua desativada'),
    blocked('Idempotência de criação implantada e homologada', 'Aprovar migração 20261012_purchase_order_idempotency_TEST.sql'),
    done('HTTP: perda de resposta após commit de compra e compensação', 'REAL_API_CI', ci, 'network-after-commit histórico; não equivale à jornada UI P0.05'),
  ] },
  { id: 'finance', name: 'Financeiro/caixa/despesas', criteria: [
    done('Venda/estorno produz lançamentos únicos e líquido zero', 'REAL_API_CI', ci, 'replay-financial histórico com leitura posterior do ledger'),
    blocked('UI: abrir, movimentar, fechar e conciliar caixa', 'Autorização para caixa exclusivo QA e restauração/fechamento'),
    blocked('Despesa Cash e valores especiais protegidos no backend', 'Aprovar finite_guard e expense_cash_normalization; validar pré/pós e compensação'),
    blocked('Despesa idempotente resiste a timeout e reenvio', 'Aprovar expense_idempotency; flag continua OFF'),
  ] },
  { id: 'customers', name: 'Clientes', criteria: [
    blocked('UI: criar/editar contatos e notas, reload e arquivamento', 'Autorização de CRUD QA; browser HTTP simulado não prova banco TEST'),
    pending('Duplicidades e validação de dados no fluxo real', 'Validar concorrência/duplicidades e persistência com usuários QA'),
    pending('Histórico/fidelidade e estorno de pontos reconciliados', 'Jornada real com cliente e operação financeira autorizada'),
    done('Leitura de clientes isolada entre empresas OWNER A/B', 'REAL_API_CI', ci, 'access-regression/p0-isolation-matrix inclui customers'),
  ] },
  { id: 'staff', name: 'Funcionários/ponto/tarefas', criteria: [
    done('Salários sem SELECT direto após hardening público', 'USER_CONFIRMED_SQL', hardening, 'Pós-preflight público real 16/16 confirmado; teste por perfil real ainda separado'),
    blocked('Sessões MANAGER/EMPLOYEE independentes e vínculos ativos', 'Inventário atual: zero MANAGER ativo; um EMPLOYEE ativo sem employee_id'),
    blocked('Gestão segura de perfis e permissões sem escalonamento', 'Aprovar staff-user-service preparado; RPC nova não exposta no TEST'),
    blocked('UI: funcionário, ponto/pausa e tarefa persistidos/reconsultados', 'Perfis/vínculos prontos e autorização de dados QA isolados'),
  ] },
  { id: 'settings', name: 'Configurações/unidades', criteria: [
    blocked('Salvar dados/listas da empresa e conferir após reload', 'Autorização e snapshot de configuração com compensação exata'),
    blocked('Operação e saldos em duas unidades da mesma empresa', 'Fixtures de duas unidades e jornada de movimento autorizada'),
    pending('Moeda/fuso/impostos aplicados a todos os módulos', 'Integração real e datas de fronteira; código de moeda do cartão corrigido'),
    pending('PT/EN e preferências de impressão em uso operacional', 'Revisão de todas as telas e impressora; mobile PDV validado com HTTP simulado'),
  ] },
  { id: 'permissions', name: 'Permissões/multiempresa', criteria: [
    done('OWNER A/B: identidade, fixtures e isolamento HTTP', 'REAL_API_CI', ci, 'authenticated-preflight e access-regression completos'),
    done('Hardening público: colunas sensíveis/RLS e EXECUTE anon', 'USER_CONFIRMED_SQL', hardening, 'Pós-preflight real 16/16; não comprova toda a matriz de perfis'),
    blocked('Matriz real OWNER/MANAGER/EMPLOYEE em UI/API/RPC', 'Sessões independentes e vínculos QA ainda indisponíveis'),
    blocked('Overrides e revogação sem escalonamento por manageUsers', 'Aplicar substituição OWNER-safe preparada e homologar perfis reais'),
  ] },
  { id: 'auth', name: 'Autenticação', criteria: [
    done('OWNER: login/logout, refresh e rejeição de sessão revogada', 'REAL_API_CI', ci, 'auth-lifecycle e browser-smoke reais OWNER A/B'),
    blocked('Recuperação real: e-mail, nova senha e login posterior', 'Acesso ao fluxo de e-mail/sessão QA existente e autorização de troca controlada'),
    blocked('Convite real e primeiro login de identidade existente', 'Decisão/ação autorizada de convite; não criar contas/e-mails nesta fase'),
    pending('Revogação durante sessão e múltiplos dispositivos', 'Jornada real de duas sessões; preservar outras identidades QA'),
  ] },
  { id: 'reports', name: 'Relatórios', criteria: [
    pending('Histórico completo além de 500 registros sem totais parciais', 'Paginação e teto explícito corrigidos; homologar volume real isolado'),
    blocked('Receita/custos/despesas/caixa conciliados com ledger real', 'Jornada financeira QA autorizada e critérios de período/estorno'),
    blocked('Filtros/exportações respeitam perfis e salários/custos', 'MANAGER/EMPLOYEE reais e conjunto de dados representativo'),
    pending('Fuso, intervalos e comparação anterior conferidos na UI', 'Cenários de virada de dia/mês com fuso da empresa distinto do navegador'),
  ] },
  { id: 'stability', name: 'Estabilidade/rede', criteria: [
    done('Browser OWNER: offline/reconexão preserva sessão e restaura tela', 'REAL_API_CI', ci, 'browser-smoke histórico com usuário TEST real'),
    pending('502/504/408/JSON truncado não duplicam operações reais', 'Regressão e latch corrigidos; falta fault injection real autorizada'),
    done('Retry de venda mantém ID e não duplica lançamentos', 'REAL_API_CI', ci, 'replay-financial e network-after-commit históricos'),
    done('Duas empresas sobrepostas no PostgreSQL preservam isolamento', 'REAL_API_CI', ci, 'two-tenant-concurrency histórico com confirmação de sobreposição'),
  ] },
  { id: 'recovery', name: 'Impressão/backup/recuperação', criteria: [
    pending('Recibo fiel e impressão/exportação no navegador operacional', 'Documento/adapter exercitados no browser isolado; validar registro TEST real'),
    blocked('Impressora física da operação e segunda via', 'Hardware/driver e aceite da impressão na Masseli'),
    blocked('Backup restaurado integralmente em ambiente isolado', 'Acesso seguro ao export e autorização de destino descartável; sem produção'),
    pending('Recuperação de falha/monitoramento e plano de contingência', 'Error Boundary existe; falta ensaio operacional e monitoramento de incidentes'),
  ] },
];

export function evaluateOperationalReadiness(modules = operationalModules) {
  const kinds = new Set(['REAL_API_CI', 'REAL_SQL_ROLLBACK', 'USER_CONFIRMED_SQL', 'REAL_READONLY']);
  const ids = new Set();
  let completed = 0, pendingCount = 0, blockedCount = 0;
  const rows = modules.map(module => {
    if (ids.has(module.id)) throw new Error('Duplicate module');
    ids.add(module.id);
    if (!module.criteria.length) throw new Error('Missing acceptance criteria');
    for (const criterion of module.criteria) {
      if (criterion.status === 'CONCLUÍDO') {
        if (!kinds.has(criterion.evidence?.kind) || !criterion.evidence?.detail || !criterion.evidence?.source) throw new Error('Completion requires real evidence');
        if (!/^https:\/\/github\.com\//.test(criterion.evidence.source) && !existsSync(new URL(`../${criterion.evidence.source}`, import.meta.url))) throw new Error('Evidence does not exist');
        completed++;
      } else if (criterion.status === 'BLOQUEADO' && criterion.blocker) blockedCount++;
      else if (criterion.status === 'PENDENTE' && criterion.remaining) pendingCount++;
      else throw new Error('Unclassified acceptance criterion');
    }
    const complete = module.criteria.filter(c => c.status === 'CONCLUÍDO').length;
    return { ...module, completed: complete, total: module.criteria.length, percent: Number((100 * complete / module.criteria.length).toFixed(2)),
      status: complete === module.criteria.length ? 'CONCLUÍDO' : module.criteria.some(c => c.status === 'BLOQUEADO') ? 'BLOQUEADO' : 'PENDENTE' };
  });
  const total = completed + pendingCount + blockedCount;
  return { target: 'msinksoilkluooxenecy', scope: 'operational_acceptance_v2', commercial_frozen: true, total, completed, pending: pendingCount, blocked: blockedCount,
    percent: Number((100 * completed / total).toFixed(2)), ready: completed === total && total > 0, modules: rows };
}

export function operationalMarkdown(report = evaluateOperationalReadiness()) {
  const lines = ['# NEXALVO — Matriz de aceitação operacional v2', '',
    `Cobertura comprovada: **${report.completed}/${report.total} critérios (${report.percent}%)**; ${report.pending} PENDENTES e ${report.blocked} BLOQUEADOS.`,
    'Este percentual mede os critérios explícitos abaixo, não linhas de código, quantidade de testes ou probabilidade de o aplicativo estar pronto.',
    'Critérios API/SQL concluídos não homologam a jornada UI correspondente. SQL com JWT simulado está identificado. CI #180 é baseline histórica; nenhuma escrita foi repetida nesta auditoria.',
    'Escopo ampliado pelo requisito P0 Terminal online-only: oito novos critérios. A v1 tinha 13/52 (25%); a mudança de denominador não é regressão. Nenhum teste simulado promove estes novos critérios a concluído.',
    'Site comercial, checkout Stripe e ativação automática de licença estão congelados e fora deste denominador. Administração Comercial aprovada permanece preservada.', '',
    '| Módulo | Estado | Critérios comprovados | Cobertura |', '| --- | --- | --- | --- |',
    ...report.modules.map(m => `| ${m.name} | ${m.status} | ${m.completed}/${m.total} | ${m.percent}% |`), '',
    '## Critérios e evidências', ''];
  for (const module of report.modules) {
    lines.push(`### ${module.name}`, '', '| Critério | Estado | Evidência ou bloqueio |', '| --- | --- | --- |');
    for (const c of module.criteria) lines.push(`| ${c.title} | ${c.status} | ${c.evidence ? `[${c.evidence.kind}](${c.evidence.source.startsWith('https:') ? c.evidence.source : '../' + c.evidence.source}): ${c.evidence.detail}` : c.blocker || c.remaining} |`);
    lines.push('');
  }
  lines.push('Gerar novamente: `node qa/operational-readiness.mjs --write`. Nenhuma consulta ou escrita no Supabase é executada por esse comando.', '');
  return lines.join('\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const report = evaluateOperationalReadiness();
  if (process.argv.includes('--write')) writeFileSync(new URL('../docs/NEXALVO_OPERATIONAL_ACCEPTANCE_MATRIX.md', import.meta.url), operationalMarkdown(report));
  console.log(JSON.stringify({ ...report, modules: report.modules.map(({ criteria, ...m }) => m) }, null, 2));
}
