# NEXALVO v1.5.2 — Phase 4 Cash Register Render Fix

Fixes the Dashboard cash-register modal crash introduced in v1.5.1.

## Root cause
The Dashboard rendered `cashRegisterOps={ctx.cashRegisterOps}` even though `ctx` does not exist inside the Dashboard component. The error only happened after clicking the register card, causing a blank React screen before the Supabase RPC could run.

## Fix
- `cashRegisterOps` is now received as a normal Dashboard prop from the existing `{...ctx}` spread.
- CashRegisterModal receives `cashRegisterOps={cashRegisterOps}` directly.
- Visible build marker updated to `v1.5.2`.
- No SQL change is required.

## Test
1. Deploy files.
2. Hard refresh and confirm `v1.5.2`.
3. Dashboard → Cash Register → Open Register.
4. Opening cash: 0.00.
5. Verify `cash_registers` has an OPEN row for the location.
