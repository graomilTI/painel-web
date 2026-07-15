import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";
import * as XLSX from "npm:xlsx@0.18.5";
import { authorizeRequest } from "../_shared/authorization.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json; charset=utf-8" },
  });
}

function normalize(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .toUpperCase();
}

// normalize() colapsa tudo pra letras/números (bom pra comparar cliente),
// mas os buckets regionais/agrupamento por local+contrato precisam manter
// espaço simples (sem virar tudo maiúsculo+trim é o normText do script antigo).
function normText(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ /g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

function normOs(value: unknown): string {
  let s = String(value ?? "").trim();
  if (!s) return "";
  if (/^\d+(\.0+)?$/.test(s)) s = s.replace(/\.0+$/, "");
  if (s.includes("/")) s = s.split("/")[0].trim();
  return s.replace(/\s+/g, " ").trim();
}

function numLoose(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const s = String(value ?? "").trim();
  if (!s) return 0;
  const cleaned = s.replace(/\./g, "").replace(",", ".").replace(/[^0-9.-]/g, "");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

function brDate(value: unknown): string {
  const s = String(value ?? "").slice(0, 10);
  const [y, m, d] = s.split("-");
  return y && m && d ? `${d}/${m}/${y}` : s || "-";
}

// yyyy-mm-dd -> dd/mm/yyyy (formato do campo "Data" dentro de dados_json).
function isoParaDataBr(iso: string): string {
  const [y, m, d] = iso.split("-");
  return y && m && d ? `${d}/${m}/${y}` : iso;
}

function clienteOf(row: Record<string, any>): string {
  return row.cliente_final || row.cliente_regional || row.cliente_nacional || "-";
}

function esc(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

// ---------------------------------------------------------------------------
// Regras por cliente, portadas literalmente dos scripts Apps Script antigos
// (LDC-COFCO.js, Sipal.js, OuroSafra.js, agricola_alvorada.js).
//
// LDC/COFCO/Sipal/Ouro Safra vêm de `grm_mapa_embarque_importacoes` -- é o
// equivalente vivo (sincronizado pelo agente) da antiga aba "Movimentação_hoje":
// tem UF, Cidade, Lote, Aguardando e Carregando, que `relatorio_resultado_diario`
// NÃO tem. Agrícola Alvorada e o fallback genérico continuam em
// `relatorio_resultado_diario` -- o script antigo já lia Agrícola Alvorada de
// "Resultado_diario", não de "Movimentação_hoje".
// ---------------------------------------------------------------------------

type Regra = "LDC" | "COFCO" | "SIPAL_USIMAT" | "OURO_SAFRA" | "AGRICOLA_ALVORADA" | "GENERICO";

function detectarRegra(cliente: string): Regra {
  const c = normalize(cliente);
  if (c.includes("LDC") || c.includes("LOUIS DREYFUS")) return "LDC";
  if (c.includes("COFCO")) return "COFCO";
  if (c.includes("SIPAL") || c.includes("USIMAT")) return "SIPAL_USIMAT";
  if (c.includes("OURO SAFRA")) return "OURO_SAFRA";
  if (c.includes("AGRICOLA ALVORADA") || c.includes("AGRÍCOLA ALVORADA")) return "AGRICOLA_ALVORADA";
  return "GENERICO";
}

const CONTRATOS_IGNORADOS_LDC_COFCO = ["VAGOES", "RECEBIMENTO", "CIF"];

// Regional exato de LDC-COFCO.js (mapRegional + ajustes manuais por O.S. 81020/80110).
function mapRegionalLdc(uf: unknown, supervisao: unknown, os: unknown): string {
  const osNorm = normOs(os);
  if (osNorm === "81020") return "PR";
  if (osNorm === "80110") return "MT_SUL";
  const sSup = normText(supervisao);
  const sUf = normText(uf);
  if (sSup.includes("MATO GROSSO MT3")) return "MT3";
  if (sSup.includes("MATO GROSSO MT2")) return "MT2";
  if (sUf === "MG" || sUf === "GO") return "GO/MG";
  if (["PR", "SP", "RS"].includes(sUf)) return sUf;
  if (sSup.includes("MATO GROSSO MT4")) return "MT4";
  return "OUTROS";
}

type Bucket = { nome: string; titulo: string; header: string[]; linhas: { destaque: boolean; valores: (string | number)[] }[] };

const HEADER_BUCKET_REGIONAL = ["Data", "OS", "Contrato", "Localização", "Remanescente", "Aguardando", "Carregando", "Carregado", "Última Atualização", "Observações"];

// Agrupa por Local+Contrato dentro de cada bucket regional (LDC/COFCO) --
// igual unificarBucketImagem_ do script antigo. "Carregado" vem de "Cargas Hoje".
function montarBucketsPorRegional(linhasCliente: Record<string, any>[], prefixo: string, regionalFn: (row: Record<string, any>) => string, nomesRegionais: string[]): Bucket[] {
  const grupos = new Map<string, Map<string, any>>();

  function addLinha(nomeBucket: string, row: Record<string, any>) {
    if (!grupos.has(nomeBucket)) grupos.set(nomeBucket, new Map());
    const mapaBucket = grupos.get(nomeBucket)!;
    const local = String(row.Local ?? "").trim();
    const cidade = String(row.Cidade ?? "").trim();
    const uf = String(row.UF ?? "").trim();
    const contrato = String(row.Contrato ?? "");
    const chave = `${normText(local)}|${normText(contrato)}`;
    const remanescente = numLoose(row.Remanescente);
    const aguardando = numLoose(row.Aguardando);
    const carregando = numLoose(row.Carregando);
    const cargasHoje = numLoose(row["Cargas Hoje"]);
    const obs = String(row["Observações"] ?? "").trim();
    if (!mapaBucket.has(chave)) {
      mapaBucket.set(chave, {
        data: row.Data, os: row.OS, contrato, localizacao: `${local}/${cidade}/${uf}`,
        remanescente, aguardando, carregando, cargasHoje,
        ultimaAtualizacao: row["Última Atualização"], obsSet: obs ? new Set([obs]) : new Set<string>(),
      });
    } else {
      const g = mapaBucket.get(chave);
      g.remanescente += remanescente;
      g.aguardando += aguardando;
      g.carregando += carregando;
      g.cargasHoje += cargasHoje;
      if (obs) g.obsSet.add(obs);
      g.ultimaAtualizacao = row["Última Atualização"] || g.ultimaAtualizacao;
    }
  }

  linhasCliente.forEach((row) => {
    addLinha(`${prefixo}_Geral`, row);
    const reg = regionalFn(row);
    if (nomesRegionais.includes(reg)) addLinha(`${prefixo}_${reg.replace("/", "_")}`, row);
  });

  const buckets: Bucket[] = [];
  grupos.forEach((mapaBucket, nomeBucket) => {
    if (!mapaBucket.size) return;
    const linhas = [...mapaBucket.values()]
      .sort((a, b) => String(a.localizacao).localeCompare(String(b.localizacao), "pt-BR"))
      .map((g) => ({
        destaque: g.aguardando === 0 && g.carregando === 0 && g.cargasHoje === 0,
        valores: [String(g.data ?? ""), g.os, g.contrato, g.localizacao, g.remanescente, g.aguardando, g.carregando, g.cargasHoje, String(g.ultimaAtualizacao ?? ""), Array.from(g.obsSet).join(" | ")],
      }));
    buckets.push({ nome: nomeBucket, titulo: nomeBucket.replace(/_/g, " "), header: HEADER_BUCKET_REGIONAL, linhas });
  });
  return buckets;
}

function montarBucketsLdc(rows: Record<string, any>[]): Bucket[] {
  const linhasCliente = rows.filter((r) => {
    const cli = normText(r.Cliente);
    const contrato = normText(r.Contrato);
    return cli.includes("LOUIS DREYFUS COMPANY BRASIL") && !CONTRATOS_IGNORADOS_LDC_COFCO.some((c) => contrato.includes(c));
  });
  return montarBucketsPorRegional(linhasCliente, "LDC", (r) => mapRegionalLdc(r.UF, r["Supervisão"], r.OS), ["MT2", "MT3", "GO/MG", "PR", "SP", "RS", "MT4", "MT_SUL"]);
}

function montarBucketsCofco(rows: Record<string, any>[]): Bucket[] {
  const linhasCliente = rows.filter((r) => {
    const cli = normText(r.Cliente);
    const contrato = normText(r.Contrato);
    return cli.includes("COFCO INTERNATIONAL") && !CONTRATOS_IGNORADOS_LDC_COFCO.some((c) => contrato.includes(c));
  });
  return montarBucketsPorRegional(linhasCliente, "COFCO", (r) => normText(r.UF), ["MT", "PR", "RS"]);
}

// Agrupa por Cliente+Local (Sipal/Usimat MT e Ouro Safra por UF) -- mesma
// lógica de pegarDadosPorClientesUF_/pegarDadosOuroSafra_PorUF_ do script antigo.
function montarBucketClienteLocal(linhas: Record<string, any>[], nome: string, titulo: string): Bucket | null {
  const mapa = new Map<string, any>();
  linhas.forEach((row) => {
    const cliente = normText(row.Cliente);
    const local = String(row.Local ?? "").trim();
    const chave = `${cliente}|${normText(local)}`;
    const remanescente = numLoose(row.Remanescente);
    const aguardando = numLoose(row.Aguardando);
    const carregando = numLoose(row.Carregando);
    const cargasHoje = numLoose(row["Cargas Hoje"]);
    const obs = String(row["Observações"] ?? "").trim();
    if (!mapa.has(chave)) {
      mapa.set(chave, { os: row.OS, local, remanescente, aguardando, carregando, cargasHoje, ultimaAtualizacao: row["Última Atualização"], obsSet: obs ? new Set([obs]) : new Set<string>() });
    } else {
      const g = mapa.get(chave);
      g.remanescente += remanescente;
      g.aguardando += aguardando;
      g.carregando += carregando;
      g.cargasHoje += cargasHoje;
      if (obs) g.obsSet.add(obs);
      g.ultimaAtualizacao = row["Última Atualização"] || g.ultimaAtualizacao;
    }
  });
  if (!mapa.size) return null;
  const linhasOut = [...mapa.values()]
    .sort((a, b) => String(a.local).localeCompare(String(b.local), "pt-BR"))
    .map((g) => ({ destaque: false, valores: [g.os, g.local, g.remanescente, g.aguardando, g.carregando, g.cargasHoje, String(g.ultimaAtualizacao ?? ""), Array.from(g.obsSet).join(" | ")] }));
  return { nome, titulo, header: ["OS", "Local", "Remanescente", "Aguardando", "Carregando", "Cargas Hoje", "Última Atualização", "Observações"], linhas: linhasOut };
}

function montarBucketsSipalUsimat(rows: Record<string, any>[]): Bucket[] {
  const linhas = rows.filter((r) => {
    const cli = normText(r.Cliente);
    const uf = normText(r.UF);
    return (cli.includes("SIPAL") || cli.includes("USIMAT")) && uf === "MT";
  });
  const b = montarBucketClienteLocal(linhas, "SIPAL_USIMAT_MT", "SIPAL/USIMAT — MT");
  return b ? [b] : [];
}

function montarBucketsOuroSafra(rows: Record<string, any>[]): Bucket[] {
  const linhasCliente = rows.filter((r) => normText(r.Cliente).includes("OURO SAFRA"));
  const buckets: Bucket[] = [];
  for (const uf of ["BA", "PR", "SP", "RS"]) {
    const linhasUf = linhasCliente.filter((r) => normText(r.UF) === uf);
    const b = montarBucketClienteLocal(linhasUf, `OURO_SAFRA_${uf}`, `Ouro Safra — ${uf}`);
    if (b) buckets.push(b);
  }
  return buckets;
}

// Agrícola Alvorada e o fallback genérico continuam vindo de
// relatorio_resultado_diario -- é a fonte certa pra eles.
function montarBucketAgricolaAlvorada(rows: Record<string, any>[]): Bucket {
  const linhas = rows.map((r) => ({
    destaque: false,
    valores: [clienteOf(r), r.os || "-", brDate(r.data), r.local_embarque || "-", r.destino || "-", r.funcionario || "-", numLoose(r.embarcado), numLoose(r.toneladas), numLoose(r.remanescente)],
  }));
  return { nome: "AGRICOLA_ALVORADA", titulo: "Agrícola Alvorada", header: ["Cliente", "O.S.", "Data", "Local Embarque", "Destino", "Responsável", "Carregado", "Tons Carreg.", "Saldo"], linhas };
}

function montarBucketGenerico(cliente: string, rows: Record<string, any>[]): Bucket {
  const grupos = new Map<string, any>();
  for (const row of rows) {
    const key = [normalize(clienteOf(row)), normalize(row.local_embarque), normalize(row.destino), normalize(row.produto)].join("|");
    if (!grupos.has(key)) {
      grupos.set(key, { cliente: clienteOf(row), origem: row.local_embarque || "-", destino: row.destino || "-", produto: row.produto || "-", cargas: 0, toneladas: 0, embarcado: 0, remanescente: 0, os: new Set<string>() });
    }
    const g = grupos.get(key);
    g.cargas += numLoose(row.cargas);
    g.toneladas += numLoose(row.toneladas);
    g.embarcado += numLoose(row.embarcado);
    g.remanescente += numLoose(row.remanescente);
    if (row.os) g.os.add(String(row.os));
  }
  const linhas = [...grupos.values()]
    .sort((a, b) => String(a.cliente).localeCompare(String(b.cliente), "pt-BR"))
    .map((g) => ({ destaque: false, valores: [g.cliente, g.origem, g.destino, g.produto, g.cargas, g.toneladas, g.embarcado, g.remanescente, [...g.os].join(", ")] }));
  return { nome: "RELATORIO", titulo: cliente, header: ["Cliente", "Origem", "Destino", "Produto", "Cargas", "Toneladas", "Embarcado", "Remanescente", "O.S."], linhas };
}

function gerarXlsxMultiBucketBase64(buckets: Bucket[]): string {
  const wb = XLSX.utils.book_new();
  for (const bucket of buckets) {
    const ws = XLSX.utils.aoa_to_sheet([bucket.header, ...bucket.linhas.map((l) => l.valores)]);
    XLSX.utils.book_append_sheet(wb, ws, bucket.nome.slice(0, 31));
  }
  return XLSX.write(wb, { type: "base64", bookType: "xlsx" });
}

function bucketsToCsv(buckets: Bucket[]): string {
  return buckets.map((b) => {
    const linhas = [b.header, ...b.linhas.map((l) => l.valores)];
    const csv = linhas.map((l) => l.map((v) => `"${String(v ?? "").replaceAll('"', '""')}"`).join(";")).join("\r\n");
    return `${b.titulo}\r\n${csv}`;
  }).join("\r\n\r\n");
}

function bucketsToHtml(buckets: Bucket[]): string {
  return buckets.map((b) => {
    const head = b.header.map((h) => `<th style="border:1px solid #ccc;padding:6px;background:#f1f5f9;text-align:left">${h}</th>`).join("");
    const rows = b.linhas.map((l) => `<tr style="background:${l.destaque ? "#F8C8DC" : "#fff"}">${l.valores.map((v) => `<td style="border:1px solid #ddd;padding:6px">${v ?? ""}</td>`).join("")}</tr>`).join("");
    return `<h3 style="font-family:Arial,sans-serif">${esc(b.titulo)}</h3><table style="border-collapse:collapse;font-family:Arial,sans-serif;font-size:13px;margin-bottom:18px"><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table>`;
  }).join("");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return json({ ok: false, error: "Método não permitido." }, 405);

  const auth = await authorizeRequest(req, ["logistica_relatorios_cliente", "LOGISTICA_ADM", "ADM_LOGISTICA"], { requireEdit: true });
  if (!auth.ok) return json({ ok: false, error: auth.error }, auth.status);

  let body: Record<string, any>;
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: "Body JSON inválido." }, 400);
  }

  const cliente = String(body.cliente || "").trim();
  const dataInicial = String(body.data_inicial || "").trim();
  const dataFinal = String(body.data_final || "").trim();
  const formato = String(body.formato || "CSV").trim().toUpperCase();
  const destinatariosManuais: string[] = Array.isArray(body.destinatarios) ? body.destinatarios.filter(Boolean) : [];
  const destinatariosCcManuais: string[] = Array.isArray(body.destinatarios_cc) ? body.destinatarios_cc.filter(Boolean) : [];
  const mensagem = String(body.mensagem || "").trim();

  if (!cliente) return json({ ok: false, error: "Informe o cliente." }, 400);
  if (!dataInicial || !dataFinal) return json({ ok: false, error: "Informe data inicial e final." }, 400);

  const service = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  async function registrarEnvio(status: string, extra: Record<string, unknown> = {}) {
    await service.from("logistica_relatorios_envios").insert({
      cliente,
      data_inicial: dataInicial,
      data_final: dataFinal,
      formato,
      destinatarios: destinatariosManuais,
      destinatarios_cc: destinatariosCcManuais,
      mensagem,
      status,
      enviado_por: auth.userId,
      enviado_em: new Date().toISOString(),
      payload: body,
      ...extra,
    });
  }

  try {
    // 1) Destinatários fixos cadastrados (cliente vazio = todos os relatórios).
    const { data: fixosData, error: fixosError } = await service
      .from("logistica_relatorios_destinatarios")
      .select("*")
      .eq("ativo", true);
    if (fixosError) throw new Error(`Falha ao buscar destinatários fixos: ${fixosError.message}`);

    const nCliente = normalize(cliente);
    const fixos = (fixosData || []).filter((d: any) => {
      const dc = normalize(d.cliente || "");
      return !dc || dc === "TODOS" || nCliente.includes(dc) || dc.includes(nCliente);
    });

    const toSet = new Set<string>([
      ...fixos.filter((d: any) => normalize(d.tipo) !== "CC").map((d: any) => String(d.email).toLowerCase()),
      ...destinatariosManuais.map((e) => e.toLowerCase()),
    ]);
    const ccSet = new Set<string>([
      ...fixos.filter((d: any) => normalize(d.tipo) === "CC").map((d: any) => String(d.email).toLowerCase()),
      ...destinatariosCcManuais.map((e) => e.toLowerCase()),
    ]);
    for (const email of toSet) ccSet.delete(email);

    if (!toSet.size) {
      await registrarEnvio("ERRO", { erro: "Nenhum destinatário (fixo ou manual) para este cliente." });
      return json({ ok: false, error: "Nenhum destinatário cadastrado para este cliente. Cadastre na lista fixa ou informe manualmente." }, 400);
    }

    // 2) Regra + dados: LDC/COFCO/Sipal/Ouro Safra vêm de grm_mapa_embarque_importacoes
    // (um único dia -- igual "Movimentação_hoje" do script antigo, que era sempre um
    // retrato do dia; usamos data_inicial como esse dia). Agrícola Alvorada e o
    // fallback genérico vêm de relatorio_resultado_diario, por período.
    const regra = detectarRegra(cliente);
    let buckets: Bucket[] = [];
    let totalLinhas = 0, totalCargas = 0, totalToneladas = 0, totalEmbarcado = 0;

    if (regra === "LDC" || regra === "COFCO" || regra === "SIPAL_USIMAT" || regra === "OURO_SAFRA") {
      const dataAlvoBr = isoParaDataBr(dataInicial);
      const { data: movData, error: movError } = await service
        .from("grm_mapa_embarque_importacoes")
        .select("dados_json,created_at")
        .eq("dados_json->>Data", dataAlvoBr)
        .order("created_at", { ascending: false })
        .limit(20000);
      if (movError) throw new Error(`Falha ao buscar movimentação do dia: ${movError.message}`);

      const vistos = new Set<string>();
      const rows: Record<string, any>[] = [];
      for (const row of movData || []) {
        const os = String((row as any).dados_json?.OS ?? "").trim();
        if (!os || vistos.has(os)) continue;
        vistos.add(os);
        rows.push((row as any).dados_json || {});
      }

      if (regra === "LDC") buckets = montarBucketsLdc(rows);
      else if (regra === "COFCO") buckets = montarBucketsCofco(rows);
      else if (regra === "SIPAL_USIMAT") buckets = montarBucketsSipalUsimat(rows);
      else buckets = montarBucketsOuroSafra(rows);

      // Totais informativos pro histórico (não têm toneladas/embarcado nessa
      // fonte -- usa a bucket "_Geral" quando existir pra não contar 2x linhas
      // que também aparecem em um bucket regional).
      const totalBucket = buckets.find((b) => b.nome.endsWith("_Geral")) || buckets[0];
      if (totalBucket) {
        totalLinhas = totalBucket.linhas.length;
        const idxCargas = totalBucket.header.indexOf("Carregado") >= 0 ? totalBucket.header.indexOf("Carregado") : totalBucket.header.indexOf("Cargas Hoje");
        if (idxCargas >= 0) totalCargas = totalBucket.linhas.reduce((s, l) => s + numLoose(l.valores[idxCargas]), 0);
      }
    } else {
      const { data: rowsData, error: rowsError } = await service
        .from("relatorio_resultado_diario")
        .select("*")
        .gte("data", dataInicial)
        .lte("data", dataFinal)
        .limit(20000);
      if (rowsError) throw new Error(`Falha ao buscar dados: ${rowsError.message}`);

      const rows = (rowsData || []).filter((r: any) => normalize(clienteOf(r)).includes(nCliente));
      if (!rows.length) {
        await registrarEnvio("ERRO", { erro: "Nenhum registro encontrado para este cliente/período." });
        return json({ ok: false, error: "Nenhum registro encontrado para este cliente/período." }, 404);
      }

      const bucket = regra === "AGRICOLA_ALVORADA" ? montarBucketAgricolaAlvorada(rows) : montarBucketGenerico(cliente, rows);
      buckets = bucket.linhas.length ? [bucket] : [];
      totalLinhas = bucket.linhas.length;
      totalCargas = rows.reduce((s: number, r: any) => s + numLoose(r.cargas), 0);
      totalToneladas = rows.reduce((s: number, r: any) => s + numLoose(r.toneladas), 0);
      totalEmbarcado = rows.reduce((s: number, r: any) => s + numLoose(r.embarcado), 0);
    }

    if (!buckets.length) {
      const motivo = ["LDC", "COFCO", "SIPAL_USIMAT", "OURO_SAFRA"].includes(regra)
        ? `Nenhum registro encontrado para este cliente em ${isoParaDataBr(dataInicial)}.`
        : "Nenhuma linha após aplicar as regras deste cliente para o período.";
      await registrarEnvio("ERRO", { erro: motivo });
      return json({ ok: false, error: motivo }, 404);
    }

    // 3) XLSX (uma aba por bucket) + corpo do e-mail conforme formato escolhido.
    const arquivoNome = `Relatorio_${cliente.replace(/[^a-zA-Z0-9]+/g, "_")}_${dataInicial}_a_${dataFinal}.xlsx`;
    const xlsxBase64 = gerarXlsxMultiBucketBase64(buckets);
    const titulo = `Relatório ${cliente} — ${brDate(dataInicial)} a ${brDate(dataFinal)}`;
    let corpoHtml = `<p style="font-family:Arial,sans-serif">${mensagem ? esc(mensagem) + "<br/><br/>" : ""}Segue em anexo o relatório de ${esc(cliente)}, período ${brDate(dataInicial)} a ${brDate(dataFinal)} (${buckets.length} tabela(s): ${buckets.map((b) => esc(b.titulo)).join(", ")}).</p>`;
    if (formato === "HTML" || formato === "CSV_HTML") corpoHtml += bucketsToHtml(buckets);
    let corpoTexto = mensagem ? `${mensagem}\n\n` : "";
    corpoTexto += `Relatório ${cliente} — ${dataInicial} a ${dataFinal}\nTabelas: ${buckets.map((b) => b.titulo).join(", ")}\nLinhas (geral): ${totalLinhas}`;
    if (totalToneladas || totalEmbarcado) corpoTexto += `\nCargas: ${totalCargas}\nToneladas: ${totalToneladas.toFixed(2)}\nEmbarcado: ${totalEmbarcado.toFixed(2)}`;
    if (formato === "CSV" || formato === "CSV_HTML") corpoTexto += `\n\n${bucketsToCsv(buckets)}`;

    // 4) Credenciais SMTP (TI > Integrações > SMTP_RELATORIOS_LOGISTICA).
    const { data: integracao } = await service.from("ti_integracoes").select("id").eq("codigo", "SMTP_RELATORIOS_LOGISTICA").maybeSingle();
    if (!integracao) throw new Error("Integração SMTP_RELATORIOS_LOGISTICA não está cadastrada em TI > Integrações.");
    const { data: segredos, error: segredosError } = await service
      .from("ti_integracao_segredos")
      .select("chave,valor")
      .eq("integracao_id", (integracao as any).id)
      .eq("ativo", true);
    if (segredosError) throw new Error(`Falha ao buscar credenciais SMTP: ${segredosError.message}`);
    const smtp: Record<string, string> = {};
    for (const s of segredos || []) smtp[String((s as any).chave)] = String((s as any).valor ?? "");
    const smtpHost = smtp.SMTP_HOST;
    const smtpPort = Number(smtp.SMTP_PORT || 587);
    const smtpUser = smtp.SMTP_USER;
    const smtpPass = smtp.SMTP_PASS;
    const smtpFrom = smtp.SMTP_FROM || smtpUser;
    const smtpFromName = smtp.SMTP_FROM_NAME || "Logística Grão 1000";
    if (!smtpHost || !smtpUser || !smtpPass) {
      throw new Error("Credenciais SMTP incompletas em TI > Integrações (SMTP_HOST/SMTP_USER/SMTP_PASS).");
    }

    // 5) Envio.
    const client = new SMTPClient({
      connection: {
        hostname: smtpHost,
        port: smtpPort,
        tls: smtpPort === 465,
        auth: { username: smtpUser, password: smtpPass },
      },
    });
    try {
      await client.send({
        from: `${smtpFromName} <${smtpFrom}>`,
        to: [...toSet],
        cc: ccSet.size ? [...ccSet] : undefined,
        subject: titulo,
        content: corpoTexto,
        html: corpoHtml,
        attachments: [
          {
            filename: arquivoNome,
            content: xlsxBase64,
            encoding: "base64",
            contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          },
        ],
      });
    } finally {
      await client.close();
    }

    await registrarEnvio("ENVIADO", {
      assunto: titulo,
      total_linhas: totalLinhas,
      total_cargas: totalCargas,
      total_toneladas: totalToneladas,
      total_embarcado: totalEmbarcado,
      arquivo_nome: arquivoNome,
    });

    return json({ ok: true, message: `Relatório enviado para ${toSet.size} destinatário(s) (${buckets.length} tabela(s), ${totalLinhas} linha(s) na geral).` });
  } catch (error) {
    console.error("[enviar-relatorio-cliente]", error);
    const message = error instanceof Error ? error.message : String(error);
    await registrarEnvio("ERRO", { erro: message }).catch(() => {});
    return json({ ok: false, error: message }, 500);
  }
});
