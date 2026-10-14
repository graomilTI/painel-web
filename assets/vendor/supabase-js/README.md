# supabase-js hospedado localmente

`supabase-js-2.117.3.js` é o `@supabase/supabase-js@2.117.3` empacotado em **um único
arquivo ESM** (sem imports externos). Antes o painel importava de
`https://esm.sh/@supabase/supabase-js@2`, que gerava ~28 requisições em 6 níveis
seriais a cada abertura de página (e dependia de um terceiro estar no ar).

Para atualizar a versão:

```bash
mkdir /tmp/b && cd /tmp/b && npm init -y
npm i @supabase/supabase-js@<versao> esbuild
echo "export * from '@supabase/supabase-js';" > entry.js
npx esbuild entry.js --bundle --format=esm --platform=browser --target=es2022 \
  --minify --legal-comments=none --define:process.env.NODE_ENV='"production"' \
  --outfile=supabase-js-<versao>.js
```

Depois aponte `assets/js/supabaseClient.js` para o novo arquivo (o nome leva a versão,
então o cache nunca serve um bundle velho).
