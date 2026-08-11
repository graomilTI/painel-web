from pathlib import Path

launcher = Path('agentes-grm-sync/grm-sync-lancar-nhe.js')
syncer = Path('agentes-grm-sync/grm-sync-nhe.js')
text = launcher.read_text(encoding='utf-8')
sync_text = syncer.read_text(encoding='utf-8')


def replace_exact(src, old, new, expected, label):
    count = src.count(old)
    if count != expected:
        raise SystemExit(f'{label}: esperado {expected}, encontrado {count}')
    return src.replace(old, new)

# operational_os: carregar situação para impedir tentativa em OS finalizada.
old_select = ".select('numero_os,data_os,cliente,embarque,ponto1_nome,ponto1_latitude,ponto1_longitude,servico,supervisao,observacao_logistica')"
new_select = ".select('numero_os,data_os,cliente,embarque,ponto1_nome,ponto1_latitude,ponto1_longitude,servico,supervisao,situacao,observacao_logistica')"
text = replace_exact(text, old_select, new_select, 2, 'select situacao')
text = replace_exact(text, "        servico: row.servico,\n        supervisao: row.supervisao,", "        servico: row.servico,\n        supervisao: row.supervisao,\n        situacao: row.situacao,", 1, 'situacao lote')
text = replace_exact(text, "    servico: row.servico,\n    supervisao: row.supervisao,", "    servico: row.servico,\n    supervisao: row.supervisao,\n    situacao: row.situacao,", 1, 'situacao avulsa')

# A regra automática também ignora OS explicitamente não abertas.
text = replace_exact(
    text,
    "    return !!(info && info.servico && SERVICOS_FOB_CIF.indexOf(normText(info.servico)) !== -1);",
    "    return !!(info && (!info.situacao || normText(info.situacao) === 'ABERTA') && info.servico && SERVICOS_FOB_CIF.indexOf(normText(info.servico)) !== -1);",
    1,
    'filtro situacao'
)

# Limpa erro antigo em cada nova gravação de status, salvo quando o patch atual traz um erro novo.
text = replace_exact(
    text,
    "    observacao: candidato.loginMatch ? observacaoPara(candidato) : OBS_FIXA,\n    raw:",
    "    observacao: candidato.loginMatch ? observacaoPara(candidato) : OBS_FIXA,\n    erro: null,\n    raw:",
    1,
    'limpar erro anterior'
)

# Bloqueia também qualquer tentativa cujo Salvar foi acionado mas ainda não foi confirmado.
text = replace_exact(
    text,
    ".in('status', ['SUCESSO', 'JA_EXISTIA_GRM']);",
    ".in('status', ['SUCESSO', 'JA_EXISTIA_GRM', 'SALVO_NAO_CONFIRMADO']);",
    1,
    'bloqueio nao confirmado'
)

# Fallback de Coordenação pelo UF e consulta NHE ao vivo no GRM.
marker = "async function preencherEModalNhe(page, candidato, dryRun, debug) {"
insert = r'''var COORDENACAO_POR_UF = {
  AC: 'ACRE', AL: 'ALAGOAS', AP: 'AMAPA', AM: 'AMAZONAS', BA: 'BAHIA', CE: 'CEARA',
  DF: 'DISTRITO FEDERAL', ES: 'ESPIRITO SANTO', GO: 'GOIAS', MA: 'MARANHAO', MT: 'MATO GROSSO',
  MS: 'MATO GROSSO DO SUL', MG: 'MINAS GERAIS', PA: 'PARA', PB: 'PARAIBA', PR: 'PARANA',
  PE: 'PERNAMBUCO', PI: 'PIAUI', RJ: 'RIO DE JANEIRO', RN: 'RIO GRANDE DO NORTE',
  RS: 'RIO GRANDE DO SUL', RO: 'RONDONIA', RR: 'RORAIMA', SC: 'SANTA CATARINA',
  SP: 'SAO PAULO', SE: 'SERGIPE', TO: 'TOCANTINS'
};

function coordenacaoPorUf(osCoord) {
  var embarque = normText(osCoord && osCoord.embarque);
  var match = embarque.match(/^([A-Z]{2})\s*-/);
  return match ? (COORDENACAO_POR_UF[match[1]] || '') : '';
}

// Fonte de verdade ao vivo: consulta o endpoint do relatório NHE na sessão já
// autenticada do GRM. Serve tanto como trava pré-lançamento quanto como
// confirmação pós-Salvar. Assim não dependemos da defasagem do sync Supabase.
async function existeNheNoGrmAoVivo(page, dataYmd, numeroOs) {
  var dataBr = brDate(dataYmd);
  return page.evaluate(async function (payload) {
    var token = '';
    for (var i = 0; i < localStorage.length; i++) {
      try {
        var value = JSON.parse(localStorage.getItem(localStorage.key(i)));
        if (value && value.userToken) token = value.userToken;
      } catch (_) {}
    }
    if (!token) throw new Error('Token do GRM não encontrado para confirmar NHE.');
    var response = await fetch('/api/reports/classification/nhe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: JSON.stringify({ lnsDateFrom: payload.dataBr, lnsDateTo: payload.dataBr })
    });
    var json = await response.json();
    if (!response.ok || json.result === false) {
      throw new Error('Consulta NHE GRM falhou: ' + JSON.stringify(json).slice(0, 500));
    }
    var rows = json.searchData || [];
    return rows.some(function (row) { return String(row.sorCode) === String(payload.os); });
  }, { dataBr: dataBr, os: String(numeroOs) });
}

async function preencherEModalNhe(page, candidato, dryRun, debug) {'''
text = replace_exact(text, marker, insert, 1, 'helpers UF/live')

old_coord = """  var coordEscolhida = await selecionarOpcaoAberta(page, regiaoAlvo, 'substring');
  if (!coordEscolhida) throw new Error('Não achei opção de Coordenação compatível com "' + regiaoAlvo + '".');
  log('INFO', 'Coordenação selecionada: ' + coordEscolhida);"""
new_coord = """  var coordEscolhida = await selecionarOpcaoAberta(page, regiaoAlvo, 'substring');
  if (!coordEscolhida) {
    var coordUf = coordenacaoPorUf(candidato.osCoord);
    if (coordUf && normText(coordUf) !== normText(regiaoAlvo)) {
      coordEscolhida = await selecionarOpcaoAberta(page, coordUf, 'substring');
      if (coordEscolhida) log('INFO', 'Coordenação resolvida por UF do embarque (' + coordUf + '): ' + coordEscolhida);
    }
  }
  if (!coordEscolhida) throw new Error('Não achei opção de Coordenação compatível com "' + regiaoAlvo + '" nem com a UF da O.S.');
  log('INFO', 'Coordenação selecionada: ' + coordEscolhida);"""
text = replace_exact(text, old_coord, new_coord, 1, 'fallback coordenacao')

# Sync pós-lançamento precisa abranger toda a janela histórica (05-11 quando REPROCESSAR_DIAS=5).
old_exec = "childProcess.execFile(process.execPath, [scriptPath], { timeout: Number(process.env.NHE_LANCAMENTO_POS_SYNC_TIMEOUT_MS || 150000), env: process.env }, function (error, stdout, stderr) {"
new_exec = "var syncEnv = Object.assign({}, process.env, { NHE_SYNC_DAYS_BACK: String(Math.max(REPROCESSAR_DIAS + 1, Number(process.env.NHE_SYNC_DAYS_BACK) || 1)) });\n    childProcess.execFile(process.execPath, [scriptPath], { timeout: Number(process.env.NHE_LANCAMENTO_POS_SYNC_TIMEOUT_MS || 150000), env: syncEnv }, function (error, stdout, stderr) {"
text = replace_exact(text, old_exec, new_exec, 1, 'sync historico')

# Estatísticas adicionais.
old_stats = "var stats = { pendentes: 0, candidatos: 0, sucesso: 0, erro: 0, semLogin: 0, semFuncionario: 0, foraDoRaio: 0, semCoordenadaOs: 0, semServico: 0, viaGestor: 0, jaExistiaGrm: 0 };"
new_stats = "var stats = { pendentes: 0, candidatos: 0, sucesso: 0, erro: 0, semLogin: 0, semFuncionario: 0, foraDoRaio: 0, semCoordenadaOs: 0, semServico: 0, viaGestor: 0, jaExistiaGrm: 0, osNaoAberta: 0, salvoNaoConfirmado: 0 };"
text = replace_exact(text, old_stats, new_stats, 1, 'stats novos')

# Não abrir Puppeteer para OS já finalizada/fechada.
needle = """      if (!osCoord) {
        stats.semCoordenadaOs++;
        await salvarResultado(p, { status: 'SEM_COORDENADA_OS' });
        continue;
      }

      // Defensivo:"""
replacement = """      if (!osCoord) {
        stats.semCoordenadaOs++;
        await salvarResultado(p, { status: 'SEM_COORDENADA_OS' });
        continue;
      }

      if (osCoord.situacao && normText(osCoord.situacao) !== 'ABERTA') {
        stats.osNaoAberta++;
        await salvarResultado(Object.assign({}, p, { osCoord: osCoord }), {
          status: 'OS_NAO_ABERTA',
          erro: 'O.S. está com situação "' + osCoord.situacao + '" em operacional_os; lançamento não executado.'
        });
        continue;
      }

      // Defensivo:"""
text = replace_exact(text, needle, replacement, 1, 'skip OS fechada')

# Trava ao vivo antes do lançamento e confirmação real após clicar Salvar.
old_body = """          try {
            log('INFO', 'Lançando NHE para O.S. ' + candidato.os + ' (' + (candidato.viaGestor ? 'via gestor ' + candidato.gestorNome + ', colaborador original=' + candidato.funcionario : 'colaborador=' + candidato.funcionario) + ', distância=' + Math.round(candidato.loginMatch.distancia) + 'm)...');
            await lancarNheParaCandidato(page, candidato, dryRun, debug);
            stats.sucesso++;
            await salvarResultado(candidato, { status: dryRun ? 'DRY_RUN_OK' : 'SUCESSO', lancado_em: new Date().toISOString(), erro: null });
            log('SUCCESS', 'O.S. ' + candidato.os + ': NHE ' + (dryRun ? 'validado (dry-run)' : 'lançado') + '.');
          } catch (error) {"""
new_body = """          try {
            if (!dryRun && await existeNheNoGrmAoVivo(page, candidato.data, candidato.os)) {
              stats.jaExistiaGrm++;
              await salvarResultado(candidato, {
                status: 'JA_EXISTIA_GRM',
                lancado_em: null,
                raw: { origem_verificacao: 'grm_api_ao_vivo', nao_lancado_nesta_execucao: true }
              });
              log('INFO', 'O.S. ' + candidato.os + ' em ' + candidato.data + ': NHE já existe no GRM (consulta ao vivo); lançamento bloqueado.');
              continue;
            }

            log('INFO', 'Lançando NHE para O.S. ' + candidato.os + ' (' + (candidato.viaGestor ? 'via gestor ' + candidato.gestorNome + ', colaborador original=' + candidato.funcionario : 'colaborador=' + candidato.funcionario) + ', distância=' + Math.round(candidato.loginMatch.distancia) + 'm)...');
            await lancarNheParaCandidato(page, candidato, dryRun, debug);

            if (dryRun) {
              stats.sucesso++;
              await salvarResultado(candidato, { status: 'DRY_RUN_OK', lancado_em: new Date().toISOString() });
              log('SUCCESS', 'O.S. ' + candidato.os + ': NHE validado (dry-run).');
              continue;
            }

            var confirmado = false;
            var erroConfirmacao = null;
            for (var tentativaConf = 1; tentativaConf <= 3; tentativaConf++) {
              await wait(1500 * tentativaConf);
              try {
                delete nheRealPorChaveCache[chaveUnica(candidato.data, candidato.os)];
                if (await existeNheNoGrmAoVivo(page, candidato.data, candidato.os)) {
                  confirmado = true;
                  break;
                }
              } catch (confErr) {
                erroConfirmacao = confErr;
                break;
              }
            }

            if (!confirmado) {
              stats.erro++;
              stats.salvoNaoConfirmado++;
              var msgConfirmacao = erroConfirmacao
                ? 'Salvar foi acionado, mas a confirmação ao vivo falhou: ' + erroConfirmacao.message
                : 'Salvar foi acionado, mas a NHE não apareceu no relatório do GRM para O.S. ' + candidato.os + ' na data ' + candidato.data + '.';
              await salvarResultado(candidato, { status: 'SALVO_NAO_CONFIRMADO', lancado_em: null, erro: msgConfirmacao.slice(0, 2000) });
              log('ERROR', 'O.S. ' + candidato.os + ': ' + msgConfirmacao + ' Bloqueada contra nova tentativa automática.');
              continue;
            }

            stats.sucesso++;
            await salvarResultado(candidato, { status: 'SUCESSO', lancado_em: new Date().toISOString() });
            log('SUCCESS', 'O.S. ' + candidato.os + ': NHE lançado e confirmado no GRM em ' + candidato.data + '.');
          } catch (error) {"""
text = replace_exact(text, old_body, new_body, 1, 'live pre/post check')

text = replace_exact(
    text,
    "var totalFalhas = stats.erro + stats.semLogin + stats.semFuncionario + stats.foraDoRaio + stats.semCoordenadaOs;",
    "var totalFalhas = stats.erro + stats.semLogin + stats.semFuncionario + stats.foraDoRaio + stats.semCoordenadaOs + stats.salvoNaoConfirmado;",
    1,
    'total falhas'
)

# grm-sync-nhe: permitir ampliar janela por variável de ambiente.
sync_text = replace_exact(
    sync_text,
    "daysBack: 1",
    "daysBack: Math.max(1, Number(process.env.NHE_SYNC_DAYS_BACK) || 1)",
    1,
    'NHE_SYNC_DAYS_BACK'
)

launcher.write_text(text, encoding='utf-8')
syncer.write_text(sync_text, encoding='utf-8')
print('Patch aplicado aos dois agentes.')
