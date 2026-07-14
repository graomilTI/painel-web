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

function numberBr(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function brDate(value: unknown): string {
  const s = String(value ?? "").slice(0, 10);
  const [y, m, d] = s.split("-");
  return y && m && d ? `${d}/${m}/${y}` : s || "-";
}

function clienteOf(row: Record<string, any>): string {
  return row.cliente_final || row.cliente_regional || row.cliente_nacional || "-";
}

// ---------------------------------------------------------------------------
// Regras por cliente, portadas dos scripts Apps Script antigos (LDC-COFCO.js,
// Sipal.js, OuroSafra.js, agricola_alvorada.js). A tabela `relatorio_resultado_diario`
// não tem as colunas "Aguardando/Carregando/Carregado/Lote" que a planilha antiga
// tinha — o destaque "rosa" (linha sem nenhum movimento) é aproximado aqui por
// remanescente > 0 e nenhuma carga/embarque no período, e vira uma coluna
// "Destaque" em vez de cor de célula (o pacote `xlsx` community não escreve estilo
// de preenchimento de forma confiável).
// ---------------------------------------------------------------------------

// Exceções manuais por O.S., herdadas literalmente de LDC-COFCO.js (mapRegional).
const REGIONAL_EXCECOES_OS: Record<string, string> = {
  "81020": "PR",
  "80110": "MT_SUL",
};

const CONTRATOS_IGNORADOS_LDC_COFCO = ["VAGOES", "RECEBIMENTO", "CIF"];

type Regra = "LDC_COFCO" | "SIPAL_USIMAT" | "OURO_SAFRA" | "AGRICOLA_ALVORADA" | "GENERICO";

function detectarRegra(cliente: string): Regra {
  const c = normalize(cliente);
  if (c.includes("LDC") || c.includes("LOUIS DREYFUS") || c.includes("COFCO")) return "LDC_COFCO";
  if (c.includes("SIPAL") || c.includes("USIMAT")) return "SIPAL_USIMAT";
  if (c.includes("OURO SAFRA")) return "OURO_SAFRA";
  if (c.includes("AGRICOLA ALVORADA") || c.includes("AGRÍCOLA ALVORADA")) return "AGRICOLA_ALVORADA";
  return "GENERICO";
}

async function carregarMapaUf(service: ReturnType<typeof createClient>): Promise<Map<string, string>> {
  const { data } = await service.from("metas_producao").select("estado,regional");
  const map = new Map<string, string>();
  for (const row of data || []) {
    const regional = normalize((row as any).regional);
    if (regional && !map.has(regional)) map.set(regional, String((row as any).estado || "").toUpperCase());
  }
  return map;
}

function resolverUf(row: Record<string, any>, mapaUf: Map<string, string>): string {
  const os = String(row.os ?? "").trim();
  if (REGIONAL_EXCECOES_OS[os]) return REGIONAL_EXCECOES_OS[os];
  const coord = normalize(row.coordenacao);
  const sup = normalize(row.supervisao);
  return mapaUf.get(coord) || mapaUf.get(sup) || "-";
}

function destaqueSemMovimento(row: Record<string, any>): boolean {
  return numberBr(row.remanescente) > 0 && numberBr(row.embarcado) === 0 && numberBr(row.cargas) === 0;
}

type Sheet = { nome: string; header: string[]; linhas: (string | number)[][] };

function montarPlanilhaLdcCofco(rows: Record<string, any>[], mapaUf: Map<string, string>): Sheet {
  const filtradas = rows.filter((r) => {
    const contrato = normalize(r.contrato);
    return !CONTRATOS_IGNORADOS_LDC_COFCO.some((c) => contrato.includes(c));
  });
  const grupos = new Map<string, any>();
  for (const row of filtradas) {
    const key = [normalize(clienteOf(row)), normalize(row.local_embarque), normalize(row.produto)].join("|");
    if (!grupos.has(key)) {
      grupos.set(key, {
        cliente: clienteOf(row),
        local: row.local_embarque || "-",
        produto: row.produto || "-",
        uf: resolverUf(row, mapaUf),
        toneladas: 0,
        remanescente: 0,
        embarcado: 0,
        destaque: false,
        observacoes: "",
      });
    }
    const g = grupos.get(key);
    g.toneladas += numberBr(row.toneladas);
    g.remanescente += numberBr(row.remanescente);
    g.embarcado += numberBr(row.embarcado);
    if (destaqueSemMovimento(row)) g.destaque = true;
    if (row.observacoes) g.observacoes = row.observacoes;
  }
  const linhas = [...grupos.values()]
    .sort((a, b) => String(a.cliente).localeCompare(String(b.cliente), "pt-BR"))
    .map((g) => [g.cliente, g.uf, g.local, g.produto, g.toneladas, g.remanescente, g.embarcado, g.destaque ? "SIM" : "", g.observacoes]);
  return {
    nome: "LDC_COFCO",
    header: ["Cliente", "UF", "Local", "Produto", "Toneladas", "Remanescente", "Embarcado", "Destaque (sem movimento)", "Observações"],
    linhas,
  };
}

function montarPlanilhaSipalUsimat(rows: Record<string, any>[], mapaUf: Map<string, string>): Sheet {
  const filtradas = rows.filter((r) => resolverUf(r, mapaUf) === "MT");
  const linhas = filtradas.map((r) => [
    brDate(r.data), r.os || "-", clienteOf(r), r.local_embarque || "-", r.destino || "-", r.produto || "-",
    numberBr(r.cargas), numberBr(r.toneladas), numberBr(r.embarcado), numberBr(r.remanescente),
  ]);
  return {
    nome: "SIPAL_USIMAT_MT",
    header: ["Data", "O.S.", "Cliente", "Local", "Destino", "Produto", "Cargas", "Toneladas", "Embarcado", "Remanescente"],
    linhas,
  };
}

function montarPlanilhaOuroSafra(rows: Record<string, any>[], mapaUf: Map<string, string>): Sheet {
  const ufsAlvo = new Set(["BA", "PR", "SP", "RS"]);
  const grupos = new Map<string, any>();
  for (const row of rows) {
    const uf = resolverUf(row, mapaUf);
    if (!ufsAlvo.has(uf)) continue;
    if (!grupos.has(uf)) grupos.set(uf, { uf, cargas: 0, toneladas: 0, embarcado: 0, remanescente: 0, os: new Set<string>() });
    const g = grupos.get(uf);
    g.cargas += numberBr(row.cargas);
    g.toneladas += numberBr(row.toneladas);
    g.embarcado += numberBr(row.embarcado);
    g.remanescente += numberBr(row.remanescente);
    if (row.os) g.os.add(String(row.os));
  }
  const linhas = [...grupos.values()]
    .sort((a, b) => String(a.uf).localeCompare(String(b.uf)))
    .map((g) => [g.uf, g.cargas, g.toneladas, g.embarcado, g.remanescente, g.os.size]);
  return {
    nome: "OURO_SAFRA",
    header: ["UF", "Cargas", "Toneladas", "Embarcado", "Remanescente", "Qtde. O.S."],
    linhas,
  };
}

function montarPlanilhaAgricolaAlvorada(rows: Record<string, any>[]): Sheet {
  const linhas = rows.map((r) => [
    clienteOf(r), r.os || "-", brDate(r.data), r.local_embarque || "-", r.destino || "-", r.funcionario || "-",
    numberBr(r.embarcado), numberBr(r.toneladas), numberBr(r.remanescente),
  ]);
  return {
    nome: "AGRICOLA_ALVORADA",
    header: ["Cliente", "O.S.", "Data", "Local Embarque", "Destino", "Responsável", "Carregado", "Tons Carreg.", "Saldo"],
    linhas,
  };
}

function montarPlanilhaGenerica(rows: Record<string, any>[]): Sheet {
  const grupos = new Map<string, any>();
  for (const row of rows) {
    const key = [normalize(clienteOf(row)), normalize(row.local_embarque), normalize(row.destino), normalize(row.produto)].join("|");
    if (!grupos.has(key)) {
      grupos.set(key, {
        cliente: clienteOf(row), origem: row.local_embarque || "-", destino: row.destino || "-", produto: row.produto || "-",
        cargas: 0, toneladas: 0, embarcado: 0, remanescente: 0, os: new Set<string>(),
      });
    }
    const g = grupos.get(key);
    g.cargas += numberBr(row.cargas);
    g.toneladas += numberBr(row.toneladas);
    g.embarcado += numberBr(row.embarcado);
    g.remanescente += numberBr(row.remanescente);
    if (row.os) g.os.add(String(row.os));
  }
  const linhas = [...grupos.values()]
    .sort((a, b) => String(a.cliente).localeCompare(String(b.cliente), "pt-BR"))
    .map((g) => [g.cliente, g.origem, g.destino, g.produto, g.cargas, g.toneladas, g.embarcado, g.remanescente, [...g.os].join(", ")]);
  return {
    nome: "RELATORIO",
    header: ["Cliente", "Origem", "Destino", "Produto", "Cargas", "Toneladas", "Embarcado", "Remanescente", "O.S."],
    linhas,
  };
}

function gerarXlsxBase64(sheet: Sheet): string {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([sheet.header, ...sheet.linhas]);
  XLSX.utils.book_append_sheet(wb, ws, sheet.nome.slice(0, 31));
  return XLSX.write(wb, { type: "base64", bookType: "xlsx" });
}

function sheetToCsv(sheet: Sheet): string {
  const linhas = [sheet.header, ...sheet.linhas];
  return linhas.map((l) => l.map((v) => `"${String(v ?? "").replaceAll('"', '""')}"`).join(";")).join("\r\n");
}

function sheetToHtml(sheet: Sheet, titulo: string): string {
  const head = sheet.header.map((h) => `<th style="border:1px solid #ccc;padding:6px;background:#f1f5f9;text-align:left">${h}</th>`).join("");
  const rows = sheet.linhas
    .map((l) => `<tr>${l.map((v) => `<td style="border:1px solid #ddd;padding:6px">${v ?? ""}</td>`).join("")}</tr>`)
    .join("");
  return `<h2 style="font-family:Arial,sans-serif">${titulo}</h2><table style="border-collapse:collapse;font-family:Arial,sans-serif;font-size:13px"><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table>`;
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

    // 2) Linhas do período.
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

    // 3) Regra específica por cliente.
    const regra = detectarRegra(cliente);
    const mapaUf = ["LDC_COFCO", "SIPAL_USIMAT", "OURO_SAFRA"].includes(regra) ? await carregarMapaUf(service) : new Map<string, string>();
    const sheet =
      regra === "LDC_COFCO" ? montarPlanilhaLdcCofco(rows, mapaUf)
      : regra === "SIPAL_USIMAT" ? montarPlanilhaSipalUsimat(rows, mapaUf)
      : regra === "OURO_SAFRA" ? montarPlanilhaOuroSafra(rows, mapaUf)
      : regra === "AGRICOLA_ALVORADA" ? montarPlanilhaAgricolaAlvorada(rows)
      : montarPlanilhaGenerica(rows);

    if (!sheet.linhas.length) {
      await registrarEnvio("ERRO", { erro: "Regras do cliente não geraram nenhuma linha para o período." });
      return json({ ok: false, error: "Nenhuma linha após aplicar as regras deste cliente para o período." }, 404);
    }

    const totalCargas = rows.reduce((s: number, r: any) => s + numberBr(r.cargas), 0);
    const totalToneladas = rows.reduce((s: number, r: any) => s + numberBr(r.toneladas), 0);
    const totalEmbarcado = rows.reduce((s: number, r: any) => s + numberBr(r.embarcado), 0);

    // 4) XLSX + corpo do e-mail conforme formato escolhido.
    const arquivoNome = `Relatorio_${cliente.replace(/[^a-zA-Z0-9]+/g, "_")}_${dataInicial}_a_${dataFinal}.xlsx`;
    const xlsxBase64 = gerarXlsxBase64(sheet);
    const titulo = `Relatório ${cliente} — ${brDate(dataInicial)} a ${brDate(dataFinal)}`;
    let corpoHtml = `<p style="font-family:Arial,sans-serif">${mensagem ? esc(mensagem) + "<br/><br/>" : ""}Segue em anexo o relatório de ${esc(cliente)}, período ${brDate(dataInicial)} a ${brDate(dataFinal)}.</p>`;
    if (formato === "HTML" || formato === "CSV_HTML") corpoHtml += sheetToHtml(sheet, titulo);
    let corpoTexto = mensagem ? `${mensagem}\n\n` : "";
    corpoTexto += `Relatório ${cliente} — ${dataInicial} a ${dataFinal}\nLinhas: ${sheet.linhas.length}\nCargas: ${totalCargas}\nToneladas: ${totalToneladas.toFixed(2)}\nEmbarcado: ${totalEmbarcado.toFixed(2)}`;
    if (formato === "CSV" || formato === "CSV_HTML") corpoTexto += `\n\n${sheetToCsv(sheet)}`;

    // 5) Credenciais SMTP (TI > Integrações > SMTP_RELATORIOS_LOGISTICA).
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

    // 6) Envio.
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
      total_linhas: sheet.linhas.length,
      total_cargas: totalCargas,
      total_toneladas: totalToneladas,
      total_embarcado: totalEmbarcado,
      arquivo_nome: arquivoNome,
    });

    return json({ ok: true, message: `Relatório enviado para ${toSet.size} destinatário(s) (${sheet.linhas.length} linha(s)).` });
  } catch (error) {
    console.error("[enviar-relatorio-cliente]", error);
    const message = error instanceof Error ? error.message : String(error);
    await registrarEnvio("ERRO", { erro: message }).catch(() => {});
    return json({ ok: false, error: message }, 500);
  }
});

function esc(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
