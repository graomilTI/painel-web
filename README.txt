Correção TI Agentes - Supabase Functions

Arquivos alterados:
- assets/js/ti-agentes.js
- ti-agentes.html
- sw.js
- service-worker.js

Correções:
1. Troca endpoint antigo:
   https://xyzpnuumdqhegxakkyws.functions.supabase.co/${agentId}

   pelo endpoint correto:
   https://xyzpnuumdqhegxakkyws.supabase.co/functions/v1/${agentId}

2. Adiciona cache-buster no ti-agentes.html:
   ./assets/js/ti-agentes.js?v=20260618-1730

3. Atualiza versão de cache PWA:
   v3 -> v4

Depois de subir, abrir /painel/ti-agentes com Ctrl+F5.
