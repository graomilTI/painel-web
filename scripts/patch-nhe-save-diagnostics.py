from pathlib import Path

p = Path('agentes-grm-sync/grm-sync-lancar-nhe.js')
s = p.read_text(encoding='utf-8')

old = "var AUTO_CONTINUACAO = String(process.env.NHE_LANCAMENTO_AUTO_CONTINUACAO || 'true').toLowerCase() !== 'false';"
new = old + "\n// Somente diagnóstico manual: permite repetir SALVO_NAO_CONFIRMADO de uma O.S. explícita.\nvar REPETIR_NAO_CONFIRMADO = String(process.env.NHE_LANCAMENTO_REPETIR_NAO_CONFIRMADO || 'false').toLowerCase() === 'true';"
if s.count(old) != 1:
    raise SystemExit('AUTO_CONTINUACAO nao encontrado exatamente uma vez')
s = s.replace(old, new, 1)

old = """  var result = await supabase
    .from(TABLE_RESULTADOS)
    .select('data_referencia,numero_os,cliente,supervisao,funcionario,status,raw')
    .gte('data_referencia', ymd(inicio))
    .lt('data_referencia', dataReferencia)
    .in('status', ['SEM_LOGIN', 'SEM_COORDENADA_OS', 'FORA_DO_RAIO', 'ERRO', 'SEM_FUNCIONARIO'])
    .order('data_referencia', { ascending: true });"""
new = """  var statusesHistoricos = ['SEM_LOGIN', 'SEM_COORDENADA_OS', 'FORA_DO_RAIO', 'ERRO', 'SEM_FUNCIONARIO'];
  if (REPETIR_NAO_CONFIRMADO) statusesHistoricos.push('SALVO_NAO_CONFIRMADO');
  var result = await supabase
    .from(TABLE_RESULTADOS)
    .select('data_referencia,numero_os,cliente,supervisao,funcionario,status,raw')
    .gte('data_referencia', ymd(inicio))
    .lt('data_referencia', dataReferencia)
    .in('status', statusesHistoricos)
    .order('data_referencia', { ascending: true });"""
if s.count(old) != 1:
    raise SystemExit('buscarPendenciasAnteriores nao encontrado exatamente uma vez')
s = s.replace(old, new, 1)

old = """  var result = await supabase
    .from(TABLE_RESULTADOS)
    .select('data_referencia,numero_os,status')
    .gte('data_referencia', ymd(inicio))
    .lte('data_referencia', dataReferencia)
    .in('status', ['JA_EXISTIA_GRM', 'SALVO_NAO_CONFIRMADO']);"""
new = """  var statusesResolvidos = ['JA_EXISTIA_GRM'];
  if (!REPETIR_NAO_CONFIRMADO) statusesResolvidos.push('SALVO_NAO_CONFIRMADO');
  var result = await supabase
    .from(TABLE_RESULTADOS)
    .select('data_referencia,numero_os,status')
    .gte('data_referencia', ymd(inicio))
    .lte('data_referencia', dataReferencia)
    .in('status', statusesResolvidos);"""
if s.count(old) != 1:
    raise SystemExit('carregarJaLancadas nao encontrado exatamente uma vez')
s = s.replace(old, new, 1)

old = """  var salvo = await page.evaluate(function () {
    var dialogs = Array.from(document.querySelectorAll('.v-overlay--active'));
    var dialog = dialogs.reverse().find(function (d) { return (d.innerText || '').toUpperCase().indexOf('ADICIONAR NHE') !== -1; });
    var btn = dialog && Array.from(dialog.querySelectorAll('button')).find(function (b) { return (b.innerText || '').toUpperCase().indexOf('SALVAR') !== -1; });
    if (!btn) return false;
    btn.click();
    return true;
  });
  if (!salvo) throw new Error('Botão \"Salvar\" não encontrado no modal Adicionar NHE.');
  await wait(2000);"""
new = """  // Diagnóstico da atualização do GRM: captura XHR/fetch disparados pelo Salvar.
  // Não registra headers/tokens; somente método, URL, status, payload e resposta limitada.
  var respostasSalvar = [];
  var falhasSalvar = [];
  var promessasSalvar = [];
  function onResponseSalvar(response) {
    try {
      var req = response.request();
      var tipo = req.resourceType();
      if (tipo !== 'xhr' && tipo !== 'fetch') return;
      if (response.url().indexOf('/api/') === -1) return;
      var promessa = response.text().catch(function () { return ''; }).then(function (body) {
        respostasSalvar.push({
          metodo: req.method(),
          url: response.url(),
          status: response.status(),
          payload: String(req.postData() || '').slice(0, 1500),
          resposta: String(body || '').slice(0, 1500)
        });
      });
      promessasSalvar.push(promessa);
    } catch (_) {}
  }
  function onFalhaSalvar(request) {
    try {
      var tipo = request.resourceType();
      if ((tipo === 'xhr' || tipo === 'fetch') && request.url().indexOf('/api/') !== -1) {
        falhasSalvar.push({ metodo: request.method(), url: request.url(), erro: request.failure() });
      }
    } catch (_) {}
  }
  page.on('response', onResponseSalvar);
  page.on('requestfailed', onFalhaSalvar);

  var salvo = await page.evaluate(function () {
    var dialogs = Array.from(document.querySelectorAll('.v-overlay--active'));
    var dialog = dialogs.reverse().find(function (d) { return (d.innerText || '').toUpperCase().indexOf('ADICIONAR NHE') !== -1; });
    var btn = dialog && Array.from(dialog.querySelectorAll('button')).find(function (b) { return (b.innerText || '').toUpperCase().indexOf('SALVAR') !== -1; });
    if (!btn) return false;
    btn.click();
    return true;
  });
  if (!salvo) {
    page.removeListener('response', onResponseSalvar);
    page.removeListener('requestfailed', onFalhaSalvar);
    throw new Error('Botão \"Salvar\" não encontrado no modal Adicionar NHE.');
  }
  await wait(4000);
  page.removeListener('response', onResponseSalvar);
  page.removeListener('requestfailed', onFalhaSalvar);
  await Promise.allSettled(promessasSalvar);

  var mensagensUi = await page.evaluate(function () {
    var seletores = '.v-snackbar--active,.v-alert,[role=\"alert\"],.v-messages__message';
    return Array.from(document.querySelectorAll(seletores))
      .map(function (el) { return String(el.innerText || el.textContent || '').trim(); })
      .filter(Boolean)
      .slice(-20);
  }).catch(function () { return []; });

  log('INFO', 'DIAGNOSTICO_SALVAR_HTTP=' + JSON.stringify(respostasSalvar));
  if (falhasSalvar.length) log('WARN', 'DIAGNOSTICO_SALVAR_FALHAS=' + JSON.stringify(falhasSalvar));
  if (mensagensUi.length) log('INFO', 'DIAGNOSTICO_SALVAR_UI=' + JSON.stringify(mensagensUi));"""
if s.count(old) != 1:
    raise SystemExit('bloco Salvar nao encontrado exatamente uma vez')
s = s.replace(old, new, 1)

p.write_text(s, encoding='utf-8')
