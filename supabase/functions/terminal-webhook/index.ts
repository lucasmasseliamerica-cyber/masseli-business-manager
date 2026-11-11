import { terminalEnvironment, terminalHttp } from '../_shared/terminal-http.mjs';

Deno.serve(terminalHttp(terminalEnvironment(Deno.env), { webhook: true }));
