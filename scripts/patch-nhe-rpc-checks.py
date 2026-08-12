from pathlib import Path
import re

p = Path('agentes-grm-sync/grm-sync-lancar-nhe.js')
s = p.read_text(encoding='utf-8')

mov_pattern = re.compile(r"async function existeMovimentoReal\(dataReferencia, numeroOs\) \{.*?\n\}\n\n// Trava de segurança contra duplicidade histórica", re.S)
mov_repl = """async function existeMovimentoReal(dataReferencia, numeroOs) {
  var key = chaveUnica(dataReferencia, numeroOs);
  if (Object.prototype.hasOwnProperty.call(movimentoRealPorChaveCache, key)) {
    return movimentoRealPorChaveCache[key];
  }

  var result = await supabase.rpc('nhe_existe_movimento_real', {
    p_data: String(dataReferencia),
    p_os: String(normOs(numeroOs))
  });

  if (result.error) {
    throw new Error('Falha ao verificar movimento real para ' + key + ': ' + result.error.message);
  }

  var existe = result.data === true;
  movimentoRealPorChaveCache[key] = existe;
  return existe;
}

// Trava de segurança contra duplicidade histórica"""
s, n = mov_pattern.subn(mov_repl, s, count=1)
if n != 1:
    raise SystemExit(f'falha ao substituir existeMovimentoReal: {n}')

nhe_pattern = re.compile(r"async function existeNheReal\(dataReferencia, numeroOs\) \{.*?\n\}\n\nasync function carregarJaLancadas", re.S)
nhe_repl = """async function existeNheReal(dataReferencia, numeroOs) {
  var key = chaveUnica(dataReferencia, numeroOs);
  if (Object.prototype.hasOwnProperty.call(nheRealPorChaveCache, key)) {
    return nheRealPorChaveCache[key];
  }

  var result = await supabase.rpc('nhe_existe_nhe_real', {
    p_data: String(dataReferencia),
    p_os: String(normOs(numeroOs))
  });

  if (result.error) {
    throw new Error('Falha ao verificar NHE real para ' + key + ': ' + result.error.message);
  }

  var existe = result.data === true;
  nheRealPorChaveCache[key] = existe;
  return existe;
}

async function carregarJaLancadas"""
s, n = nhe_pattern.subn(nhe_repl, s, count=1)
if n != 1:
    raise SystemExit(f'falha ao substituir existeNheReal: {n}')

old = """      if (await existeNheReal(p.data, p.os)) {
        stats.jaExistiaGrm++;
        await salvarResultado(p, {
          status: 'JA_EXISTIA_GRM',
          erro: null,
          lancado_em: null,
          raw: {
            reconciliacao: 'NHE já existente no GRM antes desta execução',
            origem_verificacao: 'grm_nhe_importacoes',
            nao_lancado_nesta_execucao: true
          }
        });
        jaLancadas[chavePendente] = true;
        log('INFO', 'O.S. ' + p.os + ' em ' + p.data + ': NHE já existe no GRM; lançamento bloqueado.');
        continue;
      }

      if (await existeMovimentoReal(p.data, p.os)) {
        stats.jaExistiaMovimento++;
        await salvarResultado(p, {
          status: 'JA_EXISTIA_MOVIMENTO_GRM',
          erro: null,
          lancado_em: null,
          raw: {
            reconciliacao: 'Produção Diária já possui carga/movimento para esta O.S.+data',
            origem_verificacao: 'grm_producao_diaria_importacoes',
            nao_lancado_nesta_execucao: true
          }
        });
        jaLancadas[chavePendente] = true;
        log('INFO', 'O.S. ' + p.os + ' em ' + p.data + ': já existe carga/movimento no GRM; lançamento de NHE bloqueado.');
        continue;
      }
"""
new = """      var temNheReal = false;
      var temMovimentoReal = false;
      try {
        temNheReal = await existeNheReal(p.data, p.os);
        if (!temNheReal) temMovimentoReal = await existeMovimentoReal(p.data, p.os);
      } catch (checkError) {
        stats.erro++;
        var msgCheck = 'Falha na trava de segurança NHE/movimento para ' + p.data + '|' + p.os + ': ' + String(checkError.message || checkError);
        await salvarResultado(p, { status: 'ERRO', erro: msgCheck.slice(0, 2000) });
        log('ERROR', msgCheck + ' — O.S. bloqueada nesta execução; seguindo para as demais.');
        continue;
      }

      if (temNheReal) {
        stats.jaExistiaGrm++;
        await salvarResultado(p, {
          status: 'JA_EXISTIA_GRM',
          erro: null,
          lancado_em: null,
          raw: {
            reconciliacao: 'NHE já existente no GRM antes desta execução',
            origem_verificacao: 'rpc:nhe_existe_nhe_real',
            nao_lancado_nesta_execucao: true
          }
        });
        jaLancadas[chavePendente] = true;
        log('INFO', 'O.S. ' + p.os + ' em ' + p.data + ': NHE já existe no GRM; lançamento bloqueado.');
        continue;
      }

      if (temMovimentoReal) {
        stats.jaExistiaMovimento++;
        await salvarResultado(p, {
          status: 'JA_EXISTIA_MOVIMENTO_GRM',
          erro: null,
          lancado_em: null,
          raw: {
            reconciliacao: 'Produção Diária já possui carga/movimento para esta O.S.+data',
            origem_verificacao: 'rpc:nhe_existe_movimento_real',
            nao_lancado_nesta_execucao: true
          }
        });
        jaLancadas[chavePendente] = true;
        log('INFO', 'O.S. ' + p.os + ' em ' + p.data + ': já existe carga/movimento no GRM; lançamento de NHE bloqueado.');
        continue;
      }
"""
if old not in s:
    raise SystemExit('bloco de precheck nao encontrado')
s = s.replace(old, new, 1)

p.write_text(s, encoding='utf-8')
