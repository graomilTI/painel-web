(function () {
  const base = window.FROTAS_RASTREADORES;
  if (!base || typeof base.openHome !== 'function') return;

  const INSTALLED_STATUS = 'concluido';

  const _L2D = { A:'0',B:'1',C:'2',D:'3',E:'4',F:'5',G:'6',H:'7',I:'8',J:'9' };

  function rawPlaca(v) {
    return String(v || '')
      .toUpperCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^A-Z0-9]/g, '')
      .slice(0, 7);
  }

  function placaKey(v) {
    const p = rawPlaca(v);
    if (p.length !== 7) return p;
    const c4 = p[4];
    return _L2D[c4] !== undefined ? p.slice(0, 4) + _L2D[c4] + p.slice(5) : p;
  }

  function hasBfleet(v) {
    const st = String(v?.bfleet_status || '').toUpperCase().trim();
    return Boolean(
      v?.bfleet_confirmado ||
      v?.rastreador_bfleet ||
      v?.bfleet_rastreador ||
      st === 'COM_RASTREADOR' ||
      st === 'ATIVO' ||
      st === 'ACTIVE' ||
      st === 'OK' ||
      st === 'INSTALADO'
    );
  }

  async function syncBfleetInstalled(root, opts = {}, config = {}) {
    const supabase = opts?.supabase;
    if (!supabase || !root || root.dataset.bfleetStatusSyncing === '1') {
      return { criados: 0, atualizados: 0, falhas: 0 };
    }

    root.dataset.bfleetStatusSyncing = '1';

    try {
      const [resV, resR, resRem] = await Promise.all([
        supabase
          .from('frotas_veiculos')
          .select('id,placa,motorista_atual,status,bfleet_idgps,bfleet_confirmado,rastreador_bfleet,bfleet_rastreador,bfleet_status')
          .eq('status', 'ATIVO'),
        supabase
          .from('frotas_rastreadores')
          .select('id,placa,veiculo_id,imei,status'),
        supabase
          .from('frotas_rastreadores_removidos')
          .select('placa')
      ]);

      if (resV.error) throw resV.error;
      if (resR.error) throw resR.error;

      const existentes = new Map((resR.data || []).map(r => [placaKey(r.placa), r]));
      const removidos = new Set((resRem.data || []).map(r => placaKey(r.placa)));
      const alvos = (resV.data || []).filter(v => hasBfleet(v) && !removidos.has(placaKey(v.placa)));

      let criados = 0;
      let atualizados = 0;
      let falhas = 0;

      for (const veiculo of alvos) {
        const placaFonte = rawPlaca(veiculo.placa);
        if (!placaFonte) continue;

        const existente = existentes.get(placaKey(placaFonte));
        const jaInstalado = existente?.status === INSTALLED_STATUS;
        const jaTemImei = Boolean(existente?.imei);
        const precisaImei = Boolean(veiculo.bfleet_idgps && !jaTemImei);

        if (existente && jaInstalado && !precisaImei) continue;

        const payload = {
          placa: rawPlaca(existente?.placa || veiculo.placa),
          veiculo_id: veiculo.id || existente?.veiculo_id || null,
          status: INSTALLED_STATUS
        };

        if (precisaImei) payload.imei = veiculo.bfleet_idgps;
        if (!existente && veiculo.motorista_atual) payload.contato = veiculo.motorista_atual;

        const { error } = await supabase
          .from('frotas_rastreadores')
          .upsert(payload, { onConflict: 'placa' });

        if (error) {
          falhas++;
          console.warn('[FROTAS_RASTREADORES] Falha ao marcar BFleet como instalado:', placaFonte, error);
          continue;
        }

        if (existente) atualizados++;
        else criados++;
      }

      if ((criados || atualizados) && config.refresh !== false) {
        setTimeout(() => root.querySelector('[data-refresh]')?.click(), 350);
      }

      if (criados || atualizados || falhas) {
        console.info('[FROTAS_RASTREADORES] BFleet ativo => Instalado:', { criados, atualizados, falhas });
      }

      return { criados, atualizados, falhas };
    } catch (error) {
      console.warn('[FROTAS_RASTREADORES] Não foi possível sincronizar status BFleet:', error);
      return { criados: 0, atualizados: 0, falhas: 1 };
    } finally {
      delete root.dataset.bfleetStatusSyncing;
    }
  }

  function openHomePatched(container, opts = {}) {
    base.openHome(container, opts);

    // Garante automaticamente que todo veículo ATIVO na BFleet apareça como Instalado no painel.
    setTimeout(() => syncBfleetInstalled(container, opts), 900);

    const btn = container.querySelector('[data-sync-bfleet]');
    if (btn && btn.dataset.bfleetStatusHooked !== '1') {
      btn.dataset.bfleetStatusHooked = '1';
      btn.addEventListener('click', () => {
        // Executa logo após a rotina original do botão concluir a leitura de BFleet.
        setTimeout(() => syncBfleetInstalled(container, opts), 1400);
      });
    }
  }

  window.FROTAS_RASTREADORES = { ...base, openHome: openHomePatched };
})();
