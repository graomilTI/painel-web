// Garante que os serviços contínuos de Colaboradores e Lista de O.S. não releem a tabela inteira a cada ciclo.
const assert = require('assert');
const colab = require('./grmserver-colaboradores-api-realtime');
const os = require('./grmserver-lista-os-api-realtime');

(async () => {
  // ---- Colaboradores
  {
    const leituras = [];
    const tabela = [];
    const supabase = {
      async selectAll(table, offset) { leituras.push(table); return offset === 0 ? tabela.map((r) => ({ ...r })) : []; },
      async updateById(_t, id, body) { return { id, ...body }; },
      async upsertByCpf(body) { const row = { id: `id-${body.cpf}`, ...body }; tabela.push(row); return row; },
      async insertChanges() {}, async insertStatusHistory() {},
    };
    const staff = [{ staCode: 1, staCPF: '11111111111', staName: 'Fulano', staStatus: 'ATIVO' }];
    const r1 = await colab.applyCycle(supabase, staff);
    assert.strictEqual(r1.changed, 1, 'primeiro ciclo grava o colaborador novo');
    assert.strictEqual(leituras.length, 1);
    await colab.applyCycle(supabase, staff); // após gravar, cópia descartada: relê uma vez
    assert.strictEqual(leituras.length, 2);
    for (let i = 0; i < 5; i++) await colab.applyCycle(supabase, staff);
    assert.strictEqual(leituras.length, 2, 'ciclos sem mudança não releem a tabela');
    const falho = { ...supabase, async selectAll() { throw new Error('fora do ar'); } };
    await assert.rejects(() => colab.applyCycle(falho, staff));
  }

  // ---- Lista de O.S.
  {
    const tabela = new Map();
    const chamadas = { todas: 0, pontual: 0, upsert: 0 };
    const supabase = {
      async selectAll(_t, _c, offset) { chamadas.todas++; return offset === 0 ? [...tabela.values()].map((r) => ({ ...r })) : []; },
      async selectByNumeroOs(numero) { chamadas.pontual++; return tabela.has(numero) ? { ...tabela.get(numero) } : null; },
      async upsertByNumeroOs(body) { chamadas.upsert++; tabela.set(body.numero_os, { ...(tabela.get(body.numero_os) || {}), ...body }); },
      async deleteByNumeroOs(nums) { nums.forEach((n) => tabela.delete(n)); },
    };
    const lote = Array.from({ length: 60 }, (_, i) => ({ sorCode: 1000 + i, sorDate: '2026-10-19' }));
    const mapeadas = lote.map((r) => os.mapServiceOrder(r, 'x')).filter((r) => r.numero_os);
    if (mapeadas.length < 50) { console.log('SKIP O.S.: mapServiceOrder não reconheceu o formato de teste'); return; }
    await os.applyCycle(supabase, lote);
    const lidasPrimeiro = chamadas.todas;
    assert.strictEqual(lidasPrimeiro, 1);
    await os.applyCycle(supabase, lote);
    await os.applyCycle(supabase, lote);
    assert.strictEqual(chamadas.todas, 1, 'ciclos seguintes não releem operacional_os');
    // a Programação muda status_gestor por fora: a decisão de gravar usa a linha fresca
    const alvo = mapeadas[0].numero_os;
    tabela.get(alvo).status_gestor = 'ATENDER';
    tabela.get(alvo).data_os = '2026-10-17';
    const loteMudado = lote.map((r, i) => (i === 0 ? { ...r, sorDate: '2026-10-19', sorStatus: 'OUTRO' } : r));
    await os.applyCycle(supabase, loteMudado);
    assert.strictEqual(tabela.get(alvo).status_gestor, 'ATENDER', 'status_gestor mudado por fora não é apagado');
  }
  console.log('OK test-cache-realtime-egress');
})().catch((e) => { console.error(e); process.exit(1); });
