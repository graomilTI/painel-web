const RELEASE = '20260713-bfleet-strict1';

const text = value => String(value ?? '').trim();
const norm = value => text(value)
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toUpperCase()
  .replace(/[^A-Z0-9]+/g, ' ')
  .trim();
const plate = value => text(value).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 7);

function isFleet(row, meta) {
  const type = norm(meta?.tipo);
  return type === 'MOTORISTA'
    || type === 'FROTA'
    || Boolean(
      row?.veiculoId
      || row?.veiculo_id
      || row?.vehicle_id
      || row?.frota_id
      || plate(row?.veiculoPlaca || row?.veiculo_placa || row?.placa_veiculo || row?.placa),
    );
}

function clearWrongPosition(row) {
  if (!row) return;
  row.lat = null;
  row.lng = null;
  row.latitude = null;
  row.longitude = null;
  row.colab_lat = null;
  row.colab_lng = null;
  row.endereco = '';
  row.endereco_base = '';
  row.origem_posicao = 'BFLEET_SEM_POSICAO';
}

function install() {
  const L = window.L;
  const proto = L?.LayerGroup?.prototype;
  if (!proto) return false;

  const current = proto.addLayer;
  if (current.__programacaoBfleetStrict === RELEASE) return true;
  // Aguarda primeiro o patch que consulta BFleet e enriquece a frota.
  if (!current.__programacaoBfleetAuditorPatch) return false;

  function addLayerStrict(layer) {
    const meta = layer?.__pmgMeta;
    const row = meta?.colab;
    const fleet = row && isFleet(row, meta);
    const result = current.call(this, layer);

    if (fleet && row.origem_posicao !== 'BFLEET') {
      try { this.removeLayer(layer); } catch { /* camada pode não ter sido adicionada */ }
      clearWrongPosition(row);
      layer.__pmgSemPosicaoBfleet = true;
    }
    return result;
  }

  addLayerStrict.__programacaoBfleetStrict = RELEASE;
  addLayerStrict.__programacaoBfleetAuditorPatch = current.__programacaoBfleetAuditorPatch;
  addLayerStrict.__original = current;
  proto.addLayer = addLayerStrict;
  return true;
}

function boot() {
  const tryInstall = () => install();
  [0, 80, 250, 700, 1500, 3000, 6000].forEach(delay => window.setTimeout(tryInstall, delay));
  const timer = window.setInterval(() => {
    if (install()) window.clearInterval(timer);
  }, 250);
}

if (!window.__programacaoMapaBfleetStrictInstalled) {
  window.__programacaoMapaBfleetStrictInstalled = RELEASE;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
}
