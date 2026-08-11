from pathlib import Path

p = Path('agentes-grm-sync/grm-sync-lancar-nhe.js')
s = p.read_text(encoding='utf-8')

# 1) Cache + detector de movimento real na Produção Diária.
anchor = "var nheRealPorChaveCache = {};\n"
insert = """var nheRealPorChaveCache = {};
var movimentosProducaoPorDataCache = {};

// Uma NHE não pode ser criada se a O.S. já tiver carga ou outro movimento no
// mesmo dia. A recuperação histórica precisa revalidar a Produção Diária atual,
// pois a auditoria antiga pode ter ficado pendente antes da carga aparecer.
async function existeMovimentoReal(dataReferencia, numeroOs) {
  var rows = movimentosProducaoPorDataCache[dataReferencia];
  if (!rows) {
    rows = await fetchPaged(function (from, to) {
      return supabase
        .from('grm_producao_diaria_importacoes')
        .select('id,dados_json')
        .eq('dados_json->>Data', String(dataReferencia))
        .order('id', { ascending: true })
        .range(from, to);
    }, 20000);
    movimentosProducaoPorDataCache[dataReferencia] = rows;
  }

  var wanted = normOs(numeroOs);
  return rows.some(function (row) {
    var dados = row && row.dados_json ? row.dados_json : {};
    var os = normOs(dados['O.S.'] != null ? dados['O.S.'] : dados.OS);
    if (os !== wanted) return false;
    var cargas = normText(dados.Cargas);
    var tons = toNumberLoose(dados.Tons);
    return cargas === 'NHE' || toNumberLoose(dados.Cargas) > 0 || tons > 0;
  });
}
"""
if s.count(anchor) != 1:
    raise SystemExit('anchor nheRealPorChaveCache nao encontrado exatamente uma vez')
s = s.replace(anchor, insert, 1)

# 2) Status terminal adicional.
old = ".in('status', ['JA_EXISTIA_GRM', 'SALVO_NAO_CONFIRMADO']);"
new = ".in('status', ['JA_EXISTIA_GRM', 'JA_EXISTIA_MOVIMENTO_GRM', 'SALVO_NAO_CONFIRMADO']);"
if s.count(old) != 1:
    raise SystemExit('lista de status resolvidos nao encontrada exatamente uma vez')
s = s.replace(old, new, 1)

# 3) Estatística.
old = "jaExistiaGrm: 0, osNaoAberta: 0, salvoNaoConfirmado: 0"
new = "jaExistiaGrm: 0, jaExistiaMovimento: 0, osNaoAberta: 0, salvoNaoConfirmado: 0"
if s.count(old) != 1:
    raise SystemExit('stats nao encontrado exatamente uma vez')
s = s.replace(old, new, 1)

# 4) Pré-checagem de movimento real antes de login/GRM.
anchor = """        log('INFO', 'O.S. ' + p.os + ' em ' + p.data + ': NHE já existe no GRM; lançamento bloqueado.');
        continue;
      }

      if (!p.funcionario) {"""
replacement = """        log('INFO', 'O.S. ' + p.os + ' em ' + p.data + ': NHE já existe no GRM; lançamento bloqueado.');
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

      if (!p.funcionario) {"""
if s.count(anchor) != 1:
    raise SystemExit('anchor precheck movimento nao encontrado exatamente uma vez')
s = s.replace(anchor, replacement, 1)

# 5) Converter resposta explícita do backend em erro tipado.
anchor = """  log('INFO', 'DIAGNOSTICO_SALVAR_HTTP=' + JSON.stringify(respostasSalvar));
  if (falhasSalvar.length) log('WARN', 'DIAGNOSTICO_SALVAR_FALHAS=' + JSON.stringify(falhasSalvar));
  if (mensagensUi.length) log('INFO', 'DIAGNOSTICO_SALVAR_UI=' + JSON.stringify(mensagensUi));"""
replacement = """  log('INFO', 'DIAGNOSTICO_SALVAR_HTTP=' + JSON.stringify(respostasSalvar));
  if (falhasSalvar.length) log('WARN', 'DIAGNOSTICO_SALVAR_FALHAS=' + JSON.stringify(falhasSalvar));
  if (mensagensUi.length) log('INFO', 'DIAGNOSTICO_SALVAR_UI=' + JSON.stringify(mensagensUi));

  var jaTemMovimento = respostasSalvar.some(function (item) {
    return String(item && item.resposta || '').indexOf('sOrderHasDayMovement') !== -1;
  });
  if (jaTemMovimento) {
    var errMov = new Error('GRM informou que a O.S. já possui carga ou dia sem embarque nesta data.');
    errMov.code = 'GRM_JA_POSSUI_MOVIMENTO';
    throw errMov;
  }"""
if s.count(anchor) != 1:
    raise SystemExit('anchor diagnostico salvar nao encontrado exatamente uma vez')
s = s.replace(anchor, replacement, 1)

# 6) Tratar backend como resolvido, não ERRO.
anchor = """          } catch (error) {
            stats.erro++;
            log('ERROR', 'O.S. ' + candidato.os + ': ' + error.message);"""
replacement = """          } catch (error) {
            if (error && error.code === 'GRM_JA_POSSUI_MOVIMENTO') {
              stats.jaExistiaMovimento++;
              await salvarResultado(candidato, {
                status: 'JA_EXISTIA_MOVIMENTO_GRM',
                lancado_em: null,
                erro: null,
                raw: Object.assign({}, candidato.viaGestor ? {
                  via_gestor: true,
                  colaborador_original: candidato.funcionario,
                  gestor: candidato.gestorNome
                } : {}, {
                  reconciliacao: 'Backend GRM recusou NHE porque já existe movimento no dia',
                  origem_verificacao: 'api/loadNoShip/setRecord:sOrderHasDayMovement',
                  nao_lancado_nesta_execucao: true
                })
              });
              log('INFO', 'O.S. ' + candidato.os + ': GRM confirmou movimento já existente; NHE não necessária.');
              await fecharModais(page);
              continue;
            }
            stats.erro++;
            log('ERROR', 'O.S. ' + candidato.os + ': ' + error.message);"""
if s.count(anchor) != 1:
    raise SystemExit('catch principal nao encontrado exatamente uma vez')
s = s.replace(anchor, replacement, 1)

# 7) Export para teste isolado.
old = "  existeNheReal: existeNheReal\n};"
new = "  existeNheReal: existeNheReal,\n  existeMovimentoReal: existeMovimentoReal\n};"
if s.count(old) != 1:
    raise SystemExit('module.exports nao encontrado exatamente uma vez')
s = s.replace(old, new, 1)

p.write_text(s, encoding='utf-8')
