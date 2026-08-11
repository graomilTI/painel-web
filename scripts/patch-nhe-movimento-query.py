from pathlib import Path

p = Path('agentes-grm-sync/grm-sync-lancar-nhe.js')
s = p.read_text(encoding='utf-8')

old = '''var nheRealPorChaveCache = {};
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
'''

new = '''var nheRealPorChaveCache = {};
var movimentoRealPorChaveCache = {};

// Uma NHE não pode ser criada se a O.S. já tiver carga ou outro movimento no
// mesmo dia. Consulta diretamente Data + O.S.; não pagina o dia inteiro, pois
// grm_producao_diaria_importacoes é uma tabela volumosa e isso pode estourar o
// statement_timeout do Postgres.
async function existeMovimentoReal(dataReferencia, numeroOs) {
  var key = chaveUnica(dataReferencia, numeroOs);
  if (Object.prototype.hasOwnProperty.call(movimentoRealPorChaveCache, key)) {
    return movimentoRealPorChaveCache[key];
  }

  var wanted = normOs(numeroOs);
  var result = await supabase
    .from('grm_producao_diaria_importacoes')
    .select('id,dados_json')
    .eq('dados_json->>Data', String(dataReferencia))
    .eq('dados_json->>O.S.', String(wanted))
    .limit(100);

  if (result.error) {
    throw new Error('Falha ao verificar movimento real para ' + key + ': ' + result.error.message);
  }

  var existe = (result.data || []).some(function (row) {
    var dados = row && row.dados_json ? row.dados_json : {};
    var cargas = normText(dados.Cargas);
    var tons = toNumberLoose(dados.Tons);
    return cargas === 'NHE' || toNumberLoose(dados.Cargas) > 0 || tons > 0;
  });

  movimentoRealPorChaveCache[key] = existe;
  return existe;
}
'''

if s.count(old) != 1:
    raise SystemExit('bloco existeMovimentoReal esperado nao encontrado exatamente uma vez')

s = s.replace(old, new, 1)
p.write_text(s, encoding='utf-8')
