#!/bin/bash
export SUPABASE_URL=https://xyzpnuumdqhegxakkyws.supabase.co
export SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh5enBudXVtZHFoZWd4YWtreXdzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDU1NTQyOSwiZXhwIjoyMDkwMTMxNDI5fQ.ZXShCpiJXIDpBmkko4MZeDcgsUSI-0o1PHmjzBBBdXo
export EMAIL_CREDENTIALS_KEY=H3101dOSVKYoF7Qgw5DQNvsLX36kNIHoTOOAp+VK5B0=
export OPENAI_API_KEY=
export EMAIL_WORKER_INTERVAL_SECONDS=180
/usr/nodejs/node-v14.9.0/bin/node "$(dirname "$0")/worker.bundle.cjs" --once
