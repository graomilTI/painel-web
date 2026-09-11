import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, apikey, content-type"};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,"Content-Type":"application/json"}});
const supabaseUrl=Deno.env.get("SUPABASE_URL")!;
const serviceKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function brNow(){return new Date(new Date().toLocaleString("en-US",{timeZone:"America/Sao_Paulo"}));}
function isoDate(d:Date){return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;}
function addDays(d:Date,n:number){const x=new Date(d);x.setDate(x.getDate()+n);return x;}
function money(v:unknown){return Number(v||0).toLocaleString("pt-BR",{style:"currency",currency:"BRL"});}

const guestGuidance=`🏨 Quando estiver hospedado...
🚭 Não fume nas dependências do hotel;
💸 Não deixe para pagar consumo apenas na saída;
💍 Não deixe objetos de valor nos quartos;
🧳 Mantenha seus pertences sempre organizados na mala se por acaso precisar sair antes do previsto;
🔑 Se o hotel tiver recepção, sempre deixe a chave do quarto com o responsável;
🕒 Fique atento aos horários de checkout;
⚠️ Não deixe diárias reservadas para outros dias sem solicitação do supervisor;
🚫 Não faça alteração de quarto sem autorização do seu supervisor;
👖 Para serviço de lavanderia consulte antes o seu supervisor;
🛫 Na saída, faça o checkout na recepção. Nunca saia sem avisar o hotel .
BOA ESTADIA!!`;

function message(template:string,p:any){
  switch(template){
    case "COTACAO_HOTEL": return `Olá! Solicitação de cotação de hospedagem.\nReferência: ${p.cotacao_id}\nCidade: ${p.cidade}/${p.uf}\nColaboradores e períodos:\n${(p.itens||[]).map((i:any)=>`• ${i.nome} (${i.sexo}) — ${i.checkin} a ${i.checkout}, chegada ${i.horario||"não informada"}`).join("\n")}\n\nInforme disponibilidade por período, composição e valor por quarto, capacidade máxima, café, almoço, janta, estacionamento, pagamento no checkout, formas de pagamento e emissão de NFS-e.`;
    case "COTACAO_CANCELADA": return `A cotação de ${p.colaborador||"colaborador"} foi cancelada. Desconsidere a solicitação ${p.cotacao_id||""}.`;
    case "RESERVA_SOLICITAR": return `Olá! Confirme a reserva ${p.pedido_id}.\n${(p.itens||[]).map((i:any)=>`• ${i.nome} — ${i.checkin} a ${i.checkout}, chegada ${i.horario||"não informada"}`).join("\n")}\nValor diário informado: ${money(p.valor_diaria)}.\nResponda CONFIRMAR ${p.pedido_id} ou RECUSAR ${p.pedido_id}.`;
    case "RESERVA_CONFIRMADA_GESTOR": return `Reserva confirmada.\nColaborador(es): ${p.colaboradores||"não informado"}\nCódigo: ${p.codigo}\nHotel: ${p.hotel}\nLocalização: ${p.localizacao||"não informada"}`;
    case "RESERVA_CONFIRMADA_COLABORADOR": return `${guestGuidance}\n${p.hotel||"HOTEL"}\n${p.localizacao||"Localização não informada"}\nCódigo da reserva: ${p.codigo}`;
    case "SOLICITACAO_RECUSADA": return `A solicitação de hotel para ${p.colaborador} foi recusada.\nMotivo: ${p.motivo}`;
    case "CHECKOUT_GESTOR": return `O checkout de ${p.colaborador} está previsto para ${p.checkout}. Informe no painel se fará checkout ou se precisa permanecer mais dias.`;
    case "CHECKOUT_SOLICITAR": return `Confirme o checkout de ${p.colaborador} na data ${p.checkout_atual}. Responda CONFIRMAR CHECKOUT ${p.decisao_id}.`;
    case "PRORROGACAO_SOLICITAR": return `Solicitamos prorrogar a hospedagem de ${p.colaborador} por ${p.dias_adicionais} dia(s). Responda CONFIRMAR PRORROGAÇÃO ${p.decisao_id} ou RECUSAR ${p.decisao_id}.`;
    case "COMPROVANTE_E_PEDIDO_NFSE": return `Pagamento de ${money(p.valor)} referente à reserva ${p.codigo}. Comprovante: ${p.comprovante_url}\nEnvie a NFS-e exatamente no valor pago, em PDF e XML.`;
    case "LEMBRETE_NFSE": return `Lembrete: aguardamos a NFS-e correta no valor de ${money(p.valor)} referente à reserva ${p.codigo}. Envie PDF e XML.`;
    case "CHECKOUT_SEM_RESPOSTA_ADM": return `Alerta Hospedagem: o gestor não respondeu até 07h sobre o checkout previsto. Decisão: ${p.decisao_id}. Consulte a fila no painel.`;
    default:return String(p.message||"Atualização de hospedagem disponível no painel.");
  }
}

async function seed(s:any){
  const now=brNow(),today=isoDate(now),tomorrow=isoDate(addDays(now,1));
  if(now.getHours()>=20){
    const {data:items}=await s.from("hospedagem_v3_itens").select("*").eq("status_item","RESERVADO").eq("data_checkout_prevista",tomorrow);
    for(const i of items||[]){
      const {data:decision}=await s.from("hospedagem_checkout_decisoes").upsert({solicitacao_colaborador_id:i.item_id,reserva_id:i.reserva_id,data_checkout_prevista:i.data_checkout_prevista,avisado_gestor_em:new Date().toISOString()},{onConflict:"solicitacao_colaborador_id,data_checkout_prevista",ignoreDuplicates:true}).select("id").maybeSingle();
      const {data:profile}=await s.from("profiles").select("id,email,full_name").eq("id",i.solicitante_id).maybeSingle();
      let phone="";if(profile?.email){const {data:c}=await s.from("colaboradores").select("whatsapp").or(`email_empresa.eq.${profile.email},email_pessoal.eq.${profile.email}`).limit(1).maybeSingle();phone=c?.whatsapp||"";}
      const did=decision?.id; if(!did)continue;
      await s.from("hospedagem_outbox").upsert({template:"CHECKOUT_GESTOR",destinatario_tipo:"GESTOR",chave_dedup:`checkout-gestor:${did}`,payload:{decisao_id:did,colaborador:i.nome_colaborador,checkout:i.data_checkout_prevista},solicitacao_id:i.solicitacao_id,reserva_id:i.reserva_id,destinatario_id:i.solicitante_id,telefone:phone,nome:profile?.full_name},{onConflict:"chave_dedup",ignoreDuplicates:true});
      await s.from("painel_notificacoes").upsert({tipo:"hospedagem_checkout_decisao",titulo:`Definir permanência de ${i.nome_colaborador}`,descricao:`Checkout previsto para ${i.data_checkout_prevista}. Informe checkout ou prorrogação.`,prioridade:"urgente",icone:"hotel-alert",modulo_url:"hospedagem",destinatario_usuario_id:i.solicitante_id,referencia_tabela:"hospedagem_checkout_decisoes",referencia_id:did,chave_dedup:`checkout-painel:${did}`,meta:{decisao_id:did}},{onConflict:"chave_dedup",ignoreDuplicates:true});
    }
  }
  if(now.getHours()>=7){
    const {data:late}=await s.from("hospedagem_checkout_decisoes").select("id").eq("data_checkout_prevista",today).eq("status","AGUARDANDO_GESTOR");
    for(const d of late||[]){await s.from("hospedagem_checkout_decisoes").update({status:"SEM_RESPOSTA",escalado_adm_em:new Date().toISOString()}).eq("id",d.id);await s.from("painel_notificacoes").upsert({tipo:"hospedagem_checkout_sem_resposta",titulo:"Gestor não respondeu sobre checkout",descricao:"A Hospedagem precisa tratar a permanência do colaborador.",prioridade:"urgente",icone:"hotel-alert",modulo_url:"adm-hotel",destinatario_modulo:"HOSPEDAGEM",referencia_tabela:"hospedagem_checkout_decisoes",referencia_id:d.id,chave_dedup:`checkout-sem-resposta:${d.id}`},{onConflict:"chave_dedup",ignoreDuplicates:true});const {data:contacts}=await s.from("compras_notificacoes_config").select("id,nome,telefone").eq("setor","HOSPEDAGEM").eq("ativo",true);for(const c of contacts||[])await s.from("hospedagem_outbox").upsert({template:"CHECKOUT_SEM_RESPOSTA_ADM",destinatario_tipo:"ADM",destinatario_id:c.id,telefone:c.telefone,nome:c.nome,chave_dedup:`checkout-sem-resposta-adm:${d.id}:${c.id}`,payload:{decisao_id:d.id}},{onConflict:"chave_dedup",ignoreDuplicates:true});}
  }
  const {data:parts}=await s.from("hospedagem_pagamento_parcelas").select("id,valor,pagamento_id,proxima_cobranca_nfse_em,hospedagem_pagamentos_v3!inner(reserva_id,hospedagem_reservas!inner(id,solicitacao_id,hotel_id,codigo_operacional,hospedagem_hoteis!inner(nome,whatsapp)))").in("nfse_status",["AGUARDANDO","DIVERGENTE"]).lte("proxima_cobranca_nfse_em",new Date().toISOString());
  for(const p of parts||[]){const pay:any=p.hospedagem_pagamentos_v3,res:any=pay.hospedagem_reservas,hotel:any=res.hospedagem_hoteis;await s.from("hospedagem_outbox").upsert({template:"LEMBRETE_NFSE",destinatario_tipo:"HOTEL",chave_dedup:`nfse-lembrete:${p.id}:${today}`,payload:{parcela_id:p.id,valor:p.valor,codigo:res.codigo_operacional},solicitacao_id:res.solicitacao_id,reserva_id:res.id,hotel_id:res.hotel_id,telefone:hotel.whatsapp,nome:hotel.nome},{onConflict:"chave_dedup",ignoreDuplicates:true});await s.from("hospedagem_pagamento_parcelas").update({proxima_cobranca_nfse_em:addDays(new Date(),2).toISOString()}).eq("id",p.id);}
}

async function processOutbox(s:any){
  const {data:rows}=await s.from("hospedagem_outbox").select("*").in("status",["PENDENTE","FALHA"]).lte("agendado_para",new Date().toISOString()).lt("tentativas",8).order("agendado_para").limit(30);
  const results=[];
  for(const row of rows||[]){await s.from("hospedagem_outbox").update({status:"PROCESSANDO",tentativas:row.tentativas+1,updated_at:new Date().toISOString()}).eq("id",row.id).in("status",["PENDENTE","FALHA"]);
    if(!row.telefone){await s.from("hospedagem_outbox").update({status:"FALHA",ultimo_erro:"Telefone não cadastrado",agendado_para:addDays(new Date(),1).toISOString()}).eq("id",row.id);await s.from("painel_notificacoes").upsert({tipo:"hospedagem_whatsapp_sem_telefone",titulo:"WhatsApp não enviado",descricao:`Cadastre o telefone de ${row.nome||row.destinatario_tipo}.`,prioridade:"atencao",icone:"phone-off",modulo_url:"adm-hotel",destinatario_modulo:"HOSPEDAGEM",referencia_tabela:"hospedagem_outbox",referencia_id:row.id,chave_dedup:`outbox-sem-fone:${row.id}`},{onConflict:"chave_dedup",ignoreDuplicates:true});continue;}
    try{const res=await fetch(`${supabaseUrl}/functions/v1/botconversa-send`,{method:"POST",headers:{Authorization:`Bearer ${serviceKey}`,apikey:serviceKey,"Content-Type":"application/json"},body:JSON.stringify({phone:row.telefone,nome:row.nome,message:message(row.template,row.payload)})});const body=await res.json();if(!res.ok||body?.ok===false)throw new Error(body?.error||`HTTP ${res.status}`);const sentAt=new Date().toISOString();await s.from("hospedagem_outbox").update({status:"ENVIADO",enviado_em:sentAt,ultimo_erro:null,external_message_id:String(body?.messageId||body?.id||"")}).eq("id",row.id);if(row.template==="COTACAO_HOTEL"&&row.payload?.cotacao_id)await s.from("hospedagem_cotacoes").update({status:"ENVIADA",enviado_em:sentAt}).eq("id",row.payload.cotacao_id);if(row.template==="COMPROVANTE_E_PEDIDO_NFSE"&&row.payload?.parcela_id)await s.from("hospedagem_pagamento_parcelas").update({comprovante_enviado_hotel_em:sentAt}).eq("id",row.payload.parcela_id);results.push(row.id);}catch(e){await s.from("hospedagem_outbox").update({status:"FALHA",ultimo_erro:String((e as Error).message),agendado_para:new Date(Date.now()+Math.min(3600000,60000*2**row.tentativas)).toISOString()}).eq("id",row.id);}
  }return results;
}

serve(async(req)=>{if(req.method==="OPTIONS")return new Response("ok",{headers:cors});if(req.method!=="POST")return json({error:"Método não permitido"},405);const token=(req.headers.get("authorization")||"").replace(/^Bearer\s+/i,"");if(token!==serviceKey)return json({error:"Não autorizado"},401);const s=createClient(supabaseUrl,serviceKey);try{await seed(s);const sent=await processOutbox(s);return json({ok:true,sent:sent.length});}catch(e){return json({ok:false,error:(e as Error).message},500);}});
