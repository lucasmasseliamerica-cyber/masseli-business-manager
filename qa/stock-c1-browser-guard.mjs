// Same guard used by the real browser executor and offline transport regressions.
import { STOCK_HOST, STOCK_ACTORS, StockSignal, requireStock } from './stock-journey-core.mjs';
import { c1Payload, c1AuditPayload, c1ExpectedAudit, verifyC1View } from './stock-c1-protocol.mjs';
export function createC1BrowserGuard({ local: LOCAL, state, readView, save, windowGate, counters, authorizedToken, onFailure }) {
  let mutationInFlight = false, failed = false;
  return async route => {
      const req = route.request(), url = new URL(req.url()); let ownsMutation = false;
      try {
        if (url.origin === LOCAL) { requireStock(['GET', 'HEAD', 'OPTIONS'].includes(req.method()), 'C1_LOCAL_WRITE_FORBIDDEN'); return route.continue(); }
        if (url.origin !== `https://${STOCK_HOST}`) {
          requireStock(!url.hostname.endsWith('.supabase.co') && ['GET', 'HEAD'].includes(req.method()), 'C1_BROWSER_TARGET_FORBIDDEN');
          return route.abort(); // Optional external images/fonts are not part of stock evidence.
        }
        if (['GET', 'HEAD', 'OPTIONS'].includes(req.method())) return route.continue();
        if (url.pathname.startsWith('/storage/v1/object/sign/')) return route.continue(); // read-only signed URL issuance; never object upload
        if (url.pathname === '/rest/v1/rpc/fn_reconcile_business_alerts') return route.abort();
        if (['current_business_id', 'user_can', 'fn_session_access_status'].some(n => url.pathname === '/rest/v1/rpc/' + n)) return route.continue();
        windowGate();
        requireStock(req.method() === 'POST' && !mutationInFlight && !failed, 'C1_OVERLAPPING_OR_UNKNOWN_WRITE');
        requireStock(req.headers().authorization === `Bearer ${authorizedToken}`, 'C1_BROWSER_OWNER_SESSION_REQUIRED');
        mutationInFlight = true; ownsMutation = true;
        const rpc = url.pathname.replace('/rest/v1/rpc/', ''), payload = req.postDataJSON();
        if (['fn_adjust_inventory_count', 'fn_transfer_inventory'].includes(rpc)) {
          const intent = c1Payload(state, rpc, payload);
          verifyC1View(state, await readView(), state.confirmed);
          windowGate(); requireStock(!failed, 'C1_OVERLAPPING_OR_UNKNOWN_WRITE');
          state.operations.push({ name: intent.name, status: 'DISPATCHED', auditAttempted: false }); state.pending = 'MOVEMENT';
          save('MOVEMENT_PENDING'); counters.stock_requests_forwarded++;
          const response = await route.fetch({ maxRetries: 0, maxRedirects: 0, timeout: 30000 });
          requireStock(response.ok(), 'C1_RESULT_UNKNOWN_READONLY_RECOVERY_REQUIRED');
          const returned = await response.json(), next = state.confirmed + 1, view = await readView();
          verifyC1View(state, view, next, state.confirmed);
          const note = intent.rpc === 'fn_adjust_inventory_count' ? 'Reason: Physical Count — ' + payload.p_notes : payload.p_notes;
          const rows = view.transactions.filter(r => r.note === note);
          requireStock(rows.some(r => r.id === returned?.id && r.type !== 'TRANSFER_IN'), 'C1_RETURNED_RECEIPT_MISMATCH');
          Object.assign(state.operations.at(-1), { status: 'CONFIRMED', rows }); state.confirmed = next; state.pending = null;
          save('MOVEMENT_CONFIRMED'); return route.fulfill({ response });
        }
        if (rpc === 'fn_write_audit') {
          const op = c1AuditPayload(state, payload);
          op.auditAttempted = true; state.pending = 'AUDIT'; save('AUDIT_PENDING'); counters.audit_requests_forwarded++;
          const response = await route.fetch({ maxRetries: 0, maxRedirects: 0, timeout: 30000 });
          requireStock(response.ok(), 'C1_AUDIT_UNKNOWN_READONLY_RECOVERY_REQUIRED');
          const view = await readView(); verifyC1View(state, view, state.confirmed);
          const expected = c1ExpectedAudit(state, state.confirmed - 1);
          // Adjustment text has no run ID and can match an immutable historical entry.
          // Reconciliation proved a new, tenant-owned row; retain that receipt, never the parent snapshot.
          const receipt = view.audit.find(r => !state.audit.some(old => old.id === r.id)
            && r.action === expected.action && r.details === expected.details
            && r.business_id === STOCK_ACTORS.A.business && r.user_id === STOCK_ACTORS.A.owner);
          requireStock(receipt, 'C1_NEW_AUDIT_RECEIPT_REQUIRED');
          op.auditRow = receipt;
          state.pending = null; save('AUDIT_CONFIRMED'); return route.fulfill({ response });
        }
        throw new StockSignal('C1_BROWSER_WRITE_OUTSIDE_AUTHORIZATION');
      } catch (error) {
        failed = true; onFailure(error instanceof StockSignal ? error : new StockSignal('C1_BROWSER_RESULT_UNCONFIRMED'));
        try { await route.abort(); } catch { /* safe diagnostic only */ }
      } finally { if (ownsMutation) mutationInFlight = false; }
  };
}
