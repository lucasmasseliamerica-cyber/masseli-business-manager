import { checkExistingOwner } from './staff-owner-session-readonly.mjs';

const button = document.getElementById('verify');
const result = document.getElementById('result');
button.addEventListener('click', async () => {
  button.disabled = true;
  result.textContent = 'Conferindo…';
  try {
    const receipt = await checkExistingOwner({
      origin: window.location.origin,
      projectUrl: import.meta.env.VITE_SUPABASE_URL,
      publicKey: import.meta.env.VITE_SUPABASE_ANON_KEY,
      readStoredSession: () => window.localStorage.getItem('nexalvo.supabase.session.v1'),
    });
    result.textContent = [receipt.code, receipt.http ? 'HTTP ' + receipt.http : '', receipt.expiresUtc || ''].filter(Boolean).join(' · ');
  } catch {
    result.textContent = 'LOCAL_CHECK_UNAVAILABLE';
  }
}, { once: true });
