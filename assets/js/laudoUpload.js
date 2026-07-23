// Helper compartilhado de upload de laudo (bucket os-laudos), usado pelas 3
// telas que anexam laudo: Programação (programacao-equipe.js), Distribuir
// O.S. (os.js) e App Gestor (gestor-app.js). Antes cada tela reimplementava
// o mesmo fluxo de upload sem captura de localização; aqui a captura de
// geolocalização é feita uma vez só e nunca bloqueia o envio do laudo — se o
// usuário negar permissão ou o insert de auditoria falhar, o laudo continua
// sendo aceito normalmente (só perde o sinal para a aba "Alertas").
import { supabase } from './supabaseClient.js';

export function capturarGeolocalizacao(timeoutMs = 6000) {
  return new Promise((resolve) => {
    if (!navigator.geolocation) { resolve(null); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 60000 }
    );
  });
}

export async function anexarLaudoComGeolocalizacao(osId, files, { origem, usuario } = {}) {
  const geo = await capturarGeolocalizacao();

  const urls = [];
  for (const file of files) {
    const path = `${osId}/${Date.now()}_${file.name.replace(/\s+/g, '_')}`;
    const { data: up, error: upErr } = await supabase.storage.from('os-laudos').upload(path, file, { upsert: true });
    if (upErr) throw upErr;
    const { data: urlData } = supabase.storage.from('os-laudos').getPublicUrl(up.path);
    urls.push(urlData.publicUrl);
  }

  const laudoText = `LAUDO:${urls.join(',')}`;
  const { error } = await supabase.from('operacional_os')
    .update({ observacao_logistica: laudoText, updated_at: new Date().toISOString() })
    .eq('id', osId);
  if (error) throw error;

  try {
    await supabase.from('operacional_laudos').insert({
      os_id: osId,
      arquivos_urls: urls,
      origem: origem || 'desconhecida',
      geo_capturada: !!geo,
      geo_latitude: geo?.lat ?? null,
      geo_longitude: geo?.lng ?? null,
      geo_precisao_m: geo?.accuracy ?? null,
      enviado_por: usuario?.id ?? null,
      enviado_por_nome: usuario?.nome ?? usuario?.email ?? null,
    });
  } catch (auditErr) {
    console.warn('[laudoUpload] falha ao registrar auditoria de localização (upload já foi aceito):', auditErr);
  }

  return urls;
}
