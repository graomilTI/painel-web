import { initProtectedPage } from './pageInit.js';
import { supabase as sbDefault } from './supabaseClient.js';

/* ── Coordenação → UF (para mapa regional) ── */
const COORD_TO_UF = {
  'SÃO PAULO': 'SP', 'SAO PAULO': 'SP',
  'GOIAS': 'GO', 'GOIÁS': 'GO',
  'MATO GROSSO MT1': 'MT', 'MATO GROSSO MT2': 'MT',
  'MATO GROSSO MT3 - QUERENCIA': 'MT', 'MATO GROSSO MT3 - CONFRESA': 'MT',
  'MATO GROSSO MT4': 'MT', 'MATO GROSSO': 'MT',
  'CASCAVEL': 'PR', 'LONDRINA': 'PR',
  'PONTA GROSSA': 'PR', 'MARINGA E TERMINAIS': 'PR', 'MARINGÁ': 'PR',
  'RIO GRANDE DO SUL': 'RS',
  'MINAS GERAIS': 'MG',
  'MATO GROSSO DO SUL': 'MS',
  'TOCANTINS': 'TO',
  'BAHIA': 'BA',
  'MARANHAO': 'MA', 'MARANHÃO': 'MA',
  'PARA': 'PA', 'PARÁ': 'PA',
  'ESPIRITO SANTO': 'ES', 'ESPÍRITO SANTO': 'ES',
  'CEARA': 'CE', 'CEARÁ': 'CE',
  'RIO DE JANEIRO': 'RJ',
  'PARANA': 'PR', 'PARANÁ': 'PR',
  'PERNAMBUCO': 'PE', 'RONDONIA': 'RO', 'RONDÔNIA': 'RO',
  'RORAIMA': 'RR', 'AMAPA': 'AP', 'AMAPÁ': 'AP',
  'AMAZONAS': 'AM', 'ACRE': 'AC', 'PIAUÍ': 'PI', 'PIAUI': 'PI',
  'RIO GRANDE DO NORTE': 'RN', 'PARAÍBA': 'PB', 'PARAIBA': 'PB',
  'ALAGOAS': 'AL', 'SERGIPE': 'SE',
  'DISTRITO FEDERAL': 'DF',
};

/* ── Mapa SVG — 27 estados ── */
const STATES = [
  {uf:'AC',name:'Acre',d:'M23.34,259.60L90.84,279.56L159.17,312.07L163.20,313.66L125.50,337.17L85.14,335.06L85.44,305.72L73.05,316.00L55.50,315.17L51.39,304.44L35.13,303.98L41.05,297.40L29.27,282.74L24.71,274.57L24.64,272.08L20.08,268.67L20.00,263.83L23.72,263.83Z'},
  {uf:'AL',name:'Alagoas',d:'M774.15,293.93L769.66,301.03L762.06,309.50L756.06,317.29L751.27,321.45L751.35,322.35L749.37,325.23L748.30,323.41L746.10,323.64L746.02,321.90L744.66,320.54L743.52,321.14L738.65,317.44L738.50,315.78L718.36,305.95L713.87,302.47L722.31,293.40L738.65,303.76L739.72,301.56L743.67,301.64L745.11,303.07L757.81,293.32L762.75,294.61L766.24,292.72Z'},
  {uf:'AM',name:'Amazonas',d:'M225.45,79.13L238.22,86.01L247.34,128.12L242.70,136.74L262.46,152.16L260.41,137.72L268.62,130.99L277.89,138.86L285.57,134.92L283.37,131.52L290.21,117.00L312.55,116.48L313.09,129.63L323.80,143.92L361.96,165.39L322.13,253.63L326.84,263.61L322.05,292.04L261.32,292.49L249.62,291.88L235.94,276.54L222.03,276.61L208.27,294.68L196.11,294.91L196.26,304.81L168.90,304.44L159.17,312.07L90.84,279.56L23.34,259.60L25.40,252.27L36.11,247.20L33.61,238.88L42.57,220.81L68.42,207.28L97.91,205.16L108.55,141.27L96.62,125.25L96.31,110.43L113.64,110.05L113.57,101.35L100.26,101.50L100.26,88.42L131.88,88.20L146.40,79.73L153.32,86.38L153.70,99.16L183.72,109.22Z'},
  {uf:'AP',name:'Amapá',d:'M482.66,109.14L452.03,135.91L453.02,143.54L439.87,144.53L415.24,97.50L400.95,88.05L392.97,88.05L390.39,73.91L394.64,73.68L398.90,79.28L406.57,79.73L411.14,76.10L420.56,76.33L422.54,79.35L429.53,79.35L458.64,35.35L469.81,76.93L488.13,90.39L487.67,102.03Z'},
  {uf:'BA',name:'Bahia',d:'M713.87,302.47L718.36,305.95L718.66,314.87L721.78,315.40L723.53,322.13L721.47,323.04L721.47,329.31L717.98,330.37L717.37,329.23L714.41,329.39L713.11,331.50L718.13,341.79L728.62,347.00L711.06,374.22L707.26,371.73L700.04,378.46L697.76,407.87L701.64,429.26L693.05,456.48L696.16,464.35L693.58,468.28L688.94,470.32L685.90,477.20L674.05,469.49L675.57,465.63L667.36,458.52L669.79,449.30L674.27,448.62L680.20,431.91L597.66,397.74L562.24,416.86L562.47,409.76L558.13,372.94L551.98,341.18L566.57,320.54L577.59,331.58L599.18,327.95L608.22,316.31L604.65,306.93L611.80,301.41L625.78,308.22L635.97,301.18L642.96,301.18L655.04,289.54L665.15,299.07L665.00,304.36L671.77,304.51L690.84,286.97L705.28,295.89L708.02,293.32L712.51,296.95L711.21,299.22Z'},
  {uf:'CE',name:'Ceará',d:'M731.81,215.14L725.35,217.71L707.18,245.01L703.38,256.50L707.79,263.08L704.45,272.00L696.32,272.00L685.52,263.91L668.80,265.12L671.84,253.02L665.91,250.60L659.22,216.81L653.75,178.25L644.02,174.47L653.75,178.25L679.06,176.81L709.08,193.44L720.26,205.77L731.74,212.12Z'},
  {uf:'DF',name:'Distrito Federal',d:'M537.54,432.89L518.76,432.89L518.69,422.38L537.54,422.46Z'},
  {uf:'ES',name:'Espírito Santo',d:'M661.43,534.89L646.07,531.26L646.15,525.66L642.81,524.76L644.71,513.49L652.46,513.19L661.96,495.27L658.84,491.19L661.20,485.67L656.11,477.58L660.59,473.57L664.47,473.72L667.51,469.56L674.05,469.49L685.90,477.20L683.24,485.82L685.37,496.55L683.24,502.38L677.92,506.08L675.03,514.62L668.50,525.89L664.32,526.12Z'},
  {uf:'GO',name:'Goiás',d:'M474.07,369.84L498.32,377.17L558.13,372.94L562.47,409.76L546.66,412.25L547.26,429.49L537.54,432.89L537.54,422.46L518.69,422.38L518.76,432.89L537.54,432.89L538.07,471.83L526.74,480.98L519.14,477.35L504.40,477.50L496.95,483.85L479.31,484.31L467.08,499.28L430.29,482.87L425.50,470.62L422.31,463.67L426.94,448.17L441.31,429.79L449.75,428.43L454.00,413.92L464.04,412.25Z'},
  {uf:'MA',name:'Maranhão',d:'M513.59,221.87L532.90,209.93L545.82,190.95L561.55,141.88L586.86,151.33L593.55,167.81L601.69,170.53L610.58,164.86L630.80,174.77L644.10,174.62L621.45,203.88L622.74,251.06L611.95,255.37L609.06,250.60L600.09,253.85L590.67,263.76L573.56,270.49L563.76,293.47L566.57,320.54L555.32,317.82L551.67,309.88L542.70,296.35L547.42,283.95L553.65,282.96L552.59,274.42L542.70,276.69L530.47,262.02L536.40,243.12L533.81,228.00Z'},
  {uf:'MG',name:'Minas Gerais',d:'M680.20,431.91L674.27,448.62L669.79,449.30L667.36,458.52L675.57,465.63L674.05,469.49L667.51,469.56L664.47,473.72L660.59,473.57L656.11,477.58L661.20,485.67L658.84,491.19L661.96,495.27L652.46,513.19L644.71,513.49L642.81,524.76L641.36,528.16L638.78,528.08L633.61,541.09L634.67,542.83L619.55,550.01L614.46,547.82L587.24,556.13L556.31,565.81L534.80,509.26L466.54,507.97L467.08,499.28L479.31,484.31L496.95,483.85L504.40,477.50L519.14,477.35L526.74,480.98L538.07,471.83L537.54,432.89L547.26,429.49L546.66,412.25L562.47,409.76L562.24,416.86L597.73,397.96Z'},
  {uf:'MS',name:'Mato Grosso do Sul',d:'M425.50,470.62L430.29,482.87L467.08,499.28L466.54,507.97L437.66,551.67L425.27,559.61L415.70,566.34L408.63,576.09L402.93,587.74L394.34,585.09L381.57,586.98L372.14,553.49L331.02,552.28L331.56,528.23L325.25,508.65L340.37,469.26L355.50,457.77L369.63,454.44L386.28,463.89L405.66,463.44L413.80,454.97L413.72,463.82L406.42,470.70Z'},
  {uf:'MT',name:'Mato Grosso',d:'M278.20,387.30L294.39,360.23L294.54,335.13L261.17,334.75L261.32,292.49L322.05,292.04L326.84,263.61L354.21,304.06L480.99,312.53L471.03,343.45L474.07,369.84L464.04,412.25L454.00,413.92L449.75,428.43L441.31,429.79L426.94,448.17L422.31,463.67L425.50,470.62L406.42,470.70L413.72,463.82L413.80,454.97L405.66,463.44L386.28,463.89L369.63,454.44L355.50,457.77L340.37,469.26L323.88,456.48L323.88,437.05L287.93,437.13L287.70,422.31L280.10,413.84L286.48,414.14L286.10,404.77L283.59,393.50Z'},
  {uf:'PA',name:'Pará',d:'M561.55,141.88L545.82,190.95L532.90,209.93L513.59,221.87L509.56,225.50L520.43,229.96L509.87,252.12L504.09,253.63L497.33,268.90L501.58,273.36L480.99,312.53L354.21,304.06L326.84,263.61L322.13,253.63L361.96,165.39L323.80,143.92L313.09,129.63L312.55,116.48L313.01,96.89L346.76,84.64L368.57,83.89L367.73,73.76L390.39,73.91L392.97,88.05L400.95,88.05L415.24,97.50L439.87,144.53L453.02,143.54L452.03,135.91L482.66,109.14L485.70,115.49L493.00,114.89L515.65,126.76L516.03,131.52L525.15,134.70L531.00,130.16Z'},
  {uf:'PB',name:'Paraíba',d:'M777.04,247.50L780.00,268.07L775.21,265.12L767.23,266.41L766.09,270.11L757.05,273.51L752.33,272.76L745.72,275.40L745.19,279.56L737.82,282.89L731.43,275.55L738.42,266.33L732.34,262.62L718.89,271.55L704.45,272.00L707.79,263.08L703.38,256.50L707.18,245.01L716.15,247.58L732.57,237.83L734.40,240.77L728.39,251.21L743.44,257.11L749.75,247.20Z'},
  {uf:'PE',name:'Pernambuco',d:'M780.00,268.07L774.15,293.93L766.24,292.72L762.75,294.61L757.81,293.32L745.11,303.07L743.67,301.64L739.72,301.56L738.65,303.76L722.31,293.40L713.87,302.47L711.21,299.22L712.51,296.95L708.02,293.32L705.28,295.89L690.84,286.97L671.77,304.51L665.00,304.36L665.15,299.07L655.04,289.54L668.80,278.05L668.72,273.36L665.46,272.15L665.53,266.48L668.80,265.12L685.52,263.91L696.32,272.00L704.45,272.00L718.89,271.55L732.34,262.62L738.42,266.33L731.43,275.55L737.82,282.89L745.19,279.56L745.72,275.40L752.33,272.76L757.05,273.51L766.09,270.11L767.23,266.41L775.21,265.12Z'},
  {uf:'PI',name:'Piauí',d:'M644.10,174.62L653.75,178.25L659.22,216.81L665.91,250.60L671.84,253.02L668.80,265.12L665.53,266.48L665.46,272.15L668.72,273.36L668.80,278.05L655.04,289.54L642.96,301.18L635.97,301.18L625.78,308.22L611.80,301.41L604.65,306.93L608.22,316.31L599.18,327.95L577.59,331.58L566.57,320.54L563.76,293.47L573.56,270.49L590.67,263.76L600.09,253.85L609.06,250.60L611.95,255.37L622.74,251.06L621.45,203.88Z'},
  {uf:'PR',name:'Paraná',d:'M425.27,559.61L489.95,568.76L500.82,598.10L523.70,610.95L512.53,625.47L501.43,625.47L494.59,629.85L487.22,626.22L473.99,626.37L471.33,630.23L460.84,631.67L458.56,638.09L414.71,630.91L408.70,618.89L396.31,617.98L402.93,587.74L408.63,576.09L415.70,566.34Z'},
  {uf:'RJ',name:'Rio de Janeiro',d:'M587.40,574.66L585.04,567.78L597.43,563.32L595.83,559.54L590.59,561.20L587.24,556.13L614.46,547.82L619.55,550.01L634.67,542.83L633.61,541.09L638.78,528.08L641.36,528.16L642.81,524.76L646.15,525.66L646.07,531.26L661.43,534.89L658.69,539.05L660.44,548.12L655.65,550.84L649.19,552.96L640.83,559.91L643.11,562.41L640.07,566.64L620.76,567.10L609.89,568.76L604.80,566.19L590.13,571.25L590.97,573.60Z'},
  {uf:'RN',name:'Rio Grande do Norte',d:'M731.81,215.14L744.05,220.28L757.88,219.60L769.43,222.93L777.04,247.50L749.75,247.20L743.44,257.11L728.39,251.21L734.40,240.77L732.57,237.83L716.15,247.58L707.18,245.01L725.35,217.71Z'},
  {uf:'RO',name:'Rondônia',d:'M159.17,312.07L168.90,304.44L196.26,304.81L196.11,294.91L208.27,294.68L222.03,276.61L235.94,276.54L249.62,291.88L261.32,292.49L261.17,334.75L294.54,335.13L294.39,360.23L278.20,387.30L271.21,383.60L255.09,384.20L249.09,377.40L217.24,362.50L209.56,365.45L188.20,348.89L188.28,313.81L163.20,313.66Z'},
  {uf:'RR',name:'Roraima',d:'M313.01,96.89L312.55,116.48L290.21,117.00L283.37,131.52L285.57,134.92L277.89,138.86L268.62,130.99L260.41,137.72L262.46,152.16L242.70,136.74L247.34,128.12L238.22,86.01L225.45,79.13L225.14,74.97L213.82,75.04L209.49,52.51L197.10,39.88L198.85,38.45L202.57,41.70L211.46,42.23L213.97,46.01L229.48,45.33L233.35,51.76L238.60,50.24L236.39,44.80L246.05,40.87L251.60,42.30L277.29,29.07L277.06,20.30L290.97,20.00L291.42,33.99L298.49,36.71L298.80,48.05L291.96,63.63L292.34,75.95L296.21,77.31L296.29,85.48L306.09,95.31Z'},
  {uf:'RS',name:'Rio Grande do Sul',d:'M410.91,648.53L451.04,653.29L474.30,671.74L488.28,675.37L484.86,685.42L490.03,689.96L479.77,712.87L469.66,726.33L462.14,732.90L445.26,744.85L445.19,739.03L448.91,739.03L458.03,732.60L472.09,713.32L462.29,711.43L452.94,727.46L441.39,738.95L444.43,740.69L444.43,745.23L439.94,750.37L435.99,761.71L431.73,766.93L419.80,776.00L416.76,773.43L419.04,766.62L426.79,757.32L430.97,759.82L435.00,751.50L431.58,749.31L423.30,754.53L378.15,720.88L369.48,724.74L341.89,704.32L375.94,667.20Z'},
  {uf:'SC',name:'Santa Catarina',d:'M414.71,630.91L458.56,638.09L460.84,631.67L471.33,630.23L473.99,626.37L487.22,626.22L494.59,629.85L501.43,625.47L512.53,625.47L514.81,630.38L511.09,639.60L512.99,652.23L512.83,661.76L509.72,674.46L490.03,689.96L484.86,685.42L488.28,675.37L474.30,671.74L451.04,653.29L410.91,648.53Z'},
  {uf:'SE',name:'Sergipe',d:'M718.36,305.95L738.50,315.78L738.65,317.44L743.52,321.14L744.66,320.54L746.02,321.90L746.10,323.64L748.30,323.41L749.37,325.23L748.84,326.06L746.71,326.06L739.41,331.05L728.62,347.00L718.13,341.79L713.11,331.50L714.41,329.39L717.37,329.23L717.98,330.37L721.47,329.31L721.47,323.04L723.53,322.13L721.78,315.40L718.66,314.87Z'},
  {uf:'SP',name:'São Paulo',d:'M587.40,574.66L574.10,580.25L575.16,582.14L572.42,583.96L567.94,582.52L562.39,583.35L546.66,591.29L523.70,610.95L500.82,598.10L489.95,568.76L425.27,559.61L437.66,551.67L466.54,507.97L534.80,509.26L556.31,565.81L587.24,556.13L590.59,561.20L595.83,559.54L597.43,563.32L585.04,567.78Z'},
  {uf:'TO',name:'Tocantins',d:'M566.57,320.54L551.98,341.18L558.13,372.94L498.32,377.17L474.07,369.84L471.03,343.45L480.99,312.53L501.58,273.36L497.33,268.90L504.09,253.63L509.87,252.12L520.43,229.96L509.56,225.50L513.59,221.87L533.81,228.00L536.40,243.12L530.47,262.02L542.70,276.69L552.59,274.42L553.65,282.96L547.42,283.95L542.70,296.35L551.67,309.88L555.32,317.82Z'},
];

const CENTROIDS = {
  AC:{x:90,y:300},AL:{x:752,y:310},AM:{x:185,y:205},AP:{x:450,y:100},
  BA:{x:643,y:388},CE:{x:700,y:233},DF:{x:528,y:428},ES:{x:664,y:505},
  GO:{x:492,y:440},MA:{x:582,y:255},MG:{x:580,y:490},MS:{x:385,y:530},
  MT:{x:370,y:400},PA:{x:435,y:225},PB:{x:748,y:264},PE:{x:718,y:283},
  PI:{x:635,y:255},PR:{x:460,y:595},RJ:{x:628,y:557},RN:{x:744,y:234},
  RO:{x:215,y:340},RR:{x:270,y:85},RS:{x:438,y:710},SC:{x:462,y:658},
  SE:{x:733,y:330},SP:{x:510,y:578},TO:{x:520,y:340}
};
const TINY = new Set(['AP','ES','RJ','DF','AL','SE','PB','RN','AC','RR','SC','PR']);

/* ── Helpers ── */
function panelUrl(t = '') {
  const n = String(t || '').replace(/^\/+/, '').replace(/\.html$/i, '');
  const h = String(window.location.hostname || '').toLowerCase();
  if (h === 'grao1000.com.br' || h === 'www.grao1000.com.br') return n ? `/painel/${n}` : '/painel';
  if (String(window.location.pathname || '').includes('/painel')) return n ? `/painel/${n}` : '/painel';
  return n ? `./${n}` : './';
}

function fmtBRL(v) {
  return 'R$ ' + Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

/* ── CSS ── */
const CSS = `
:root{
  --fd-bg:#06130e;--fd-sb:#0b1220;--fd-green:#3fa878;--fd-green2:#6fd0a5;
  --fd-line:rgba(111,208,165,.12);--fd-line2:rgba(111,208,165,.22);
  --fd-text:#eef7f2;--fd-muted:#9fb7aa;--fd-card:rgba(8,22,17,.72);
  --fd-gd:rgba(111,208,165,;
}
.fd-host{padding:0!important;overflow:hidden!important;display:flex!important;flex-direction:column;height:100%}
.fd-wrap{display:flex;flex-direction:column;height:100%;overflow:hidden;font-family:"DM Sans",system-ui,sans-serif;font-size:13px;color:var(--fd-text)}

/* TABS */
.fd-tabs{background:var(--fd-sb);border-bottom:1px solid var(--fd-line);padding:0 20px;display:flex;align-items:center;gap:2px;flex-shrink:0}
.fd-tab{padding:11px 14px;border:none;background:none;cursor:pointer;font-family:"DM Sans",system-ui,sans-serif;font-size:12px;font-weight:600;color:var(--fd-muted);border-bottom:2px solid transparent;transition:all .18s;white-space:nowrap}
.fd-tab:hover{color:var(--fd-green2)}
.fd-tab.active{color:var(--fd-green2);border-bottom-color:var(--fd-green)}

/* SCROLLABLE BODY */
.fd-body{flex:1;overflow-y:auto;overflow-x:hidden;padding:16px 20px 20px;display:flex;flex-direction:column;gap:14px;min-height:0}
.fd-body::-webkit-scrollbar{width:3px}
.fd-body::-webkit-scrollbar-thumb{background:rgba(111,208,165,.15);border-radius:4px}

/* PAGE HEADER */
.fd-hdr{display:flex;align-items:center;gap:12px;flex-wrap:wrap}
.fd-hdr-title{flex:1}
.fd-hdr-title h1{font-family:"Syne",system-ui,sans-serif;font-size:20px;font-weight:800;letter-spacing:-.03em;color:var(--fd-text);line-height:1.1}
.fd-hdr-title p{font-size:11px;color:var(--fd-muted);margin-top:3px}
.fd-badge{display:inline-flex;align-items:center;gap:5px;padding:5px 12px;border-radius:20px;background:rgba(63,168,120,.15);border:1px solid rgba(111,208,165,.22);font-size:11px;font-weight:700;color:var(--fd-green2)}
.fd-upbtn{display:flex;align-items:center;gap:6px;padding:8px 16px;background:var(--fd-green);border:none;border-radius:12px;color:#fff;font-family:"DM Sans",system-ui,sans-serif;font-size:12px;font-weight:700;cursor:pointer;transition:all .2s;white-space:nowrap}
.fd-upbtn:hover{background:var(--fd-green2);box-shadow:0 6px 20px rgba(63,168,120,.35);transform:translateY(-1px)}
.fd-upbtn svg{width:13px;height:13px;flex-shrink:0}

/* STATUS CARDS */
.fd-status-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}
.fd-scard{background:var(--fd-card);border:1px solid var(--fd-line);border-radius:16px;padding:14px 16px;display:flex;flex-direction:column;gap:4px;transition:border-color .3s,box-shadow .3s;position:relative;overflow:hidden}
.fd-scard::before{content:'';position:absolute;inset:0 0 auto 0;height:2px;background:var(--fd-scard-accent,var(--fd-green));opacity:.6}
.fd-scard:hover{border-color:var(--fd-line2);box-shadow:0 6px 24px rgba(0,0,0,.2)}
.fd-scard-label{font-size:9px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--fd-muted)}
.fd-scard-val{font-family:"Syne",system-ui,sans-serif;font-size:32px;font-weight:800;letter-spacing:-.03em;color:var(--fd-text);line-height:1}
.fd-scard-val.loading{color:rgba(159,183,170,.3)}
.fd-scard-sub{font-size:10px;color:var(--fd-muted)}
.fd-scard-icon{position:absolute;right:14px;top:14px;font-size:22px;opacity:.35}

/* CHART GRID */
.fd-row{display:grid;gap:10px}
.fd-row-2{grid-template-columns:3fr 2fr}
.fd-row-3{grid-template-columns:1.8fr 1fr 1.2fr}
.fd-card{background:var(--fd-card);border:1px solid var(--fd-line);border-radius:16px;padding:14px 16px 12px;display:flex;flex-direction:column;transition:border-color .3s,box-shadow .3s}
.fd-card:hover{border-color:var(--fd-line2);box-shadow:0 6px 24px rgba(0,0,0,.18)}
.fd-card-title{font-size:9px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--fd-muted);margin-bottom:10px;display:flex;align-items:center;gap:5px;flex-shrink:0}
.fd-card-title .dot{width:5px;height:5px;border-radius:50%;background:var(--fd-green);flex-shrink:0}
.fd-cw{flex:1;position:relative;min-height:120px}
.fd-cw canvas{max-height:100%}

/* DESPESAS EMPTY STATE */
.fd-empty{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;padding:20px 12px;text-align:center;flex:1}
.fd-empty-icon{font-size:28px;opacity:.4}
.fd-empty-title{font-size:12px;font-weight:700;color:var(--fd-muted)}
.fd-empty-sub{font-size:10px;color:rgba(159,183,170,.55);line-height:1.5}
.fd-categories{display:flex;flex-direction:column;gap:5px;margin-top:6px;width:100%}
.fd-cat-row{display:flex;align-items:center;gap:8px;font-size:10px;color:var(--fd-muted)}
.fd-cat-dot{width:8px;height:8px;border-radius:50%;flex-shrink:0}

/* MAP */
.fd-br-state{transition:filter .14s;cursor:pointer}
.fd-br-state:hover{filter:brightness(1.6) saturate(1.15)}
.fd-map-tip{position:fixed;z-index:9999;background:#0b1220;border:1px solid rgba(111,208,165,.28);border-radius:10px;padding:8px 12px;pointer-events:none;display:none;font-size:12px;max-width:220px;box-shadow:0 8px 32px rgba(0,0,0,.6);line-height:1.45;font-family:"DM Sans",system-ui,sans-serif}
.fd-map-tip .tn{font-weight:700;color:var(--fd-text);font-family:"Syne",system-ui,sans-serif;font-size:13px;margin-bottom:2px}
.fd-map-tip .tv{color:var(--fd-green2);font-weight:700}
.fd-map-tip .ts{color:var(--fd-muted);font-size:10px;margin-top:2px}
.fd-map-legend{display:flex;align-items:center;gap:6px;margin-top:6px;flex-shrink:0}
.fd-legend-bar{height:3px;flex:1;border-radius:3px;background:linear-gradient(90deg,rgba(63,168,120,.15),rgba(111,208,165,.9))}
.fd-legend-lbl{font-size:9px;color:rgba(159,183,170,.55)}

/* COORD LIST (when chart not available) */
.fd-coord-list{display:flex;flex-direction:column;gap:5px;flex:1;overflow-y:auto}
.fd-coord-row{display:flex;align-items:center;gap:8px}
.fd-coord-name{font-size:10px;color:var(--fd-muted);min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:1}
.fd-coord-bar-wrap{flex:2;height:6px;background:rgba(255,255,255,.06);border-radius:4px;overflow:hidden}
.fd-coord-bar{height:100%;border-radius:4px;background:var(--fd-green);transition:width .8s ease}
.fd-coord-count{font-size:10px;font-weight:700;color:var(--fd-green2);min-width:24px;text-align:right}

/* UPLOAD MODAL */
.fd-overlay{display:none;position:fixed;inset:0;background:rgba(0,0,0,.78);z-index:200;align-items:center;justify-content:center;backdrop-filter:blur(6px)}
.fd-overlay.on{display:flex}
.fd-modal{background:#0b1220;border:1px solid var(--fd-line2);border-radius:24px;padding:28px 30px;width:460px;position:relative;box-shadow:0 24px 60px rgba(0,0,0,.3)}
.fd-modal h3{font-family:"Syne",system-ui,sans-serif;font-size:18px;font-weight:800;color:var(--fd-text);letter-spacing:-.02em;margin-bottom:6px}
.fd-modal p{font-size:12px;color:var(--fd-muted);margin-bottom:20px}
.fd-drop{border:2px dashed rgba(111,208,165,.25);border-radius:16px;padding:30px;text-align:center;cursor:pointer;transition:all .25s}
.fd-drop:hover{border-color:var(--fd-green);background:rgba(111,208,165,.08)}
.fd-mclose{position:absolute;top:16px;right:16px;background:none;border:none;color:var(--fd-muted);font-size:16px;cursor:pointer;padding:3px 6px;border-radius:8px;transition:color .2s}
.fd-mclose:hover{color:var(--fd-text)}
`;

/* ── Expense categories (for donut) ── */
const EXPENSE_CATS = [
  { label: 'Combustíveis e Troca de Óleo', color: '#3fa878', pct: 42 },
  { label: 'Manutenção', color: '#6fd0a5', pct: 28 },
  { label: 'Pedágios', color: '#2d7a58', pct: 12 },
  { label: 'Impostos e Taxas', color: '#9fe8c8', pct: 9 },
  { label: 'Seguros e Franquias', color: '#1f6f4a', pct: 6 },
  { label: 'Outros', color: '#5db898', pct: 3 },
];

/* ── Monthly demo data (invest. values) ── */
const MONTHS = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
const MONTHLY_DEMO = [48200,52400,45800,61000,58700,67300,63100,70500,55900,72800,68400,74200];

/* ── Build SVG map ── */
function buildMapSvg(stateVals) {
  const vals = Object.values(stateVals).filter(v => v > 0);
  const maxVal = vals.length ? Math.max(...vals) : 1;
  const paths = STATES.map(s => {
    const v = stateVals[s.uf] || 0;
    const has = v > 0;
    const ratio = has ? v / maxVal : 0;
    const alpha = has ? (0.15 + ratio * 0.75).toFixed(2) : '0.04';
    const fill = has ? `rgba(63,168,120,${alpha})` : 'rgba(255,255,255,0.04)';
    const sAlpha = has ? Math.min(1, 0.35 + ratio * 0.55).toFixed(2) : '0.15';
    const stroke = has ? `rgba(111,208,165,${sAlpha})` : 'rgba(111,208,165,0.15)';
    const sw = has ? 1.5 : 1;
    const c = CENTROIDS[s.uf] || { x: 400, y: 400 };
    const fs = TINY.has(s.uf) ? 6 : 8;
    const txtFill = has ? '#ecfdf5' : '#4b5563';
    return (
      `<path class="fd-br-state" d="${s.d}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" stroke-linejoin="round" data-uf="${s.uf}" data-name="${s.name}" data-value="${v}"></path>` +
      `<text x="${c.x}" y="${c.y}" text-anchor="middle" dominant-baseline="central" font-size="${fs}" font-weight="700" fill="${txtFill}" stroke="#06130e" stroke-width="2.5" paint-order="stroke fill" style="pointer-events:none;user-select:none">${s.uf}</text>`
    );
  }).join('');
  return `<svg viewBox="0 0 800 796" width="100%" height="100%" style="display:block;overflow:visible">${paths}</svg>`;
}

/* ── Render ── */
function renderFrotasDashboard(container, opts = {}) {
  const sb = opts.supabase || sbDefault;

  container.classList.add('fd-host');

  const style = document.createElement('style');
  style.textContent = CSS;
  container.appendChild(style);

  container.insertAdjacentHTML('beforeend', `
<div class="fd-wrap">

  <!-- TABS -->
  <nav class="fd-tabs">
    <button class="fd-tab active">Dashboard</button>
    <button class="fd-tab" data-nav="frotas">Excesso de Velocidade</button>
    <button class="fd-tab" data-nav="frotas-veiculos">Veículos</button>
    <button class="fd-tab" data-nav="frotas-multas">Multas</button>
    <button class="fd-tab" data-nav="frotas-historico">Histórico</button>
  </nav>

  <!-- BODY -->
  <div class="fd-body">

    <!-- HEADER -->
    <div class="fd-hdr">
      <div class="fd-hdr-title">
        <h1>Dashboard de Frotas</h1>
        <p id="fd-sub">Módulo de Frotas · ${new Date().toLocaleDateString('pt-BR',{day:'2-digit',month:'long',year:'numeric'})}</p>
      </div>
      <div class="fd-badge" id="fd-total-badge">⋯ carregando</div>
      <button class="fd-upbtn" id="fd-open-upload">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
        Importar Planilha
      </button>
    </div>

    <!-- STATUS CARDS -->
    <div class="fd-status-grid">
      <div class="fd-scard" style="--fd-scard-accent:#3fa878">
        <span class="fd-scard-icon">📡</span>
        <span class="fd-scard-label">Ativo com Rastreador</span>
        <span class="fd-scard-val loading" id="fd-s-rastreador">—</span>
        <span class="fd-scard-sub" id="fd-s-rastreador-sub">veículos monitorados</span>
      </div>
      <div class="fd-scard" style="--fd-scard-accent:#6fd0a5">
        <span class="fd-scard-icon">🚗</span>
        <span class="fd-scard-label">Ativo sem Rastreador</span>
        <span class="fd-scard-val loading" id="fd-s-sem">—</span>
        <span class="fd-scard-sub">veículos sem monitoramento</span>
      </div>
      <div class="fd-scard" style="--fd-scard-accent:#f59e0b">
        <span class="fd-scard-icon">🔧</span>
        <span class="fd-scard-label">Em Manutenção</span>
        <span class="fd-scard-val loading" id="fd-s-manut">—</span>
        <span class="fd-scard-sub">em reparo / aguardando</span>
      </div>
      <div class="fd-scard" style="--fd-scard-accent:#ef4444">
        <span class="fd-scard-icon">⚠️</span>
        <span class="fd-scard-label">Outras Pendências</span>
        <span class="fd-scard-val loading" id="fd-s-outras">—</span>
        <span class="fd-scard-sub">situações diversas</span>
      </div>
    </div>

    <!-- ROW 1: coordenação + mapa despesas -->
    <div class="fd-row fd-row-2">
      <div class="fd-card" style="min-height:220px">
        <div class="fd-card-title"><span class="dot"></span>Veículos por Coordenação</div>
        <div class="fd-cw" id="fd-coord-wrap">
          <div class="fd-coord-list" id="fd-coord-list"></div>
        </div>
      </div>
      <div class="fd-card" style="min-height:220px">
        <div class="fd-card-title"><span class="dot"></span>Mapa de Despesas · Categorias</div>
        <div class="fd-cw" id="fd-expense-wrap">
          <div class="fd-empty">
            <div class="fd-empty-icon">📊</div>
            <div class="fd-empty-title">Aguardando importação de dados</div>
            <div class="fd-empty-sub">Use "Importar Planilha" para carregar as despesas da frota. As categorias abaixo serão preenchidas automaticamente.</div>
            <div class="fd-categories">
              ${EXPENSE_CATS.map(c=>`<div class="fd-cat-row"><span class="fd-cat-dot" style="background:${c.color}"></span><span>${c.label}</span></div>`).join('')}
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- ROW 2: linha + mapa regional -->
    <div class="fd-row fd-row-2">
      <div class="fd-card" style="min-height:200px">
        <div class="fd-card-title"><span class="dot"></span>Valores Investidos por Mês · Demo</div>
        <div class="fd-cw"><canvas id="fd-line-chart"></canvas></div>
      </div>
      <div class="fd-card" style="min-height:200px">
        <div class="fd-card-title"><span class="dot"></span>Veículos por Regional</div>
        <div class="fd-cw" id="fd-map-wrap" style="overflow:hidden"></div>
        <div class="fd-map-legend">
          <span class="fd-legend-lbl" id="fd-map-min">0</span>
          <div class="fd-legend-bar"></div>
          <span class="fd-legend-lbl" id="fd-map-max">—</span>
        </div>
      </div>
    </div>

  </div><!-- /fd-body -->
</div><!-- /fd-wrap -->

<!-- TOOLTIP -->
<div class="fd-map-tip" id="fd-tip">
  <div class="tn" id="fd-tip-name"></div>
  <div class="tv" id="fd-tip-val"></div>
  <div class="ts" id="fd-tip-sub"></div>
</div>

<!-- UPLOAD MODAL -->
<div class="fd-overlay" id="fd-overlay">
  <div class="fd-modal">
    <button class="fd-mclose" id="fd-close-modal">✕</button>
    <h3>Importar Planilha de Despesas</h3>
    <p>Faça upload da planilha com as despesas da frota (combustível, manutenção, pedágios, impostos, seguros). O dashboard será atualizado automaticamente com os dados reais.</p>
    <div class="fd-drop" id="fd-drop">
      <div style="font-size:32px;margin-bottom:10px">📊</div>
      <div style="font-size:12px;color:#9fb7aa">Arraste o arquivo ou clique para selecionar</div>
      <div style="font-size:10px;color:rgba(159,183,170,.55);margin-top:4px">Suporta .xlsx, .xls e .csv · Máx 10 MB</div>
    </div>
    <div style="display:flex;gap:8px;margin-top:16px">
      ${['xlsx','xls','csv'].map(f=>`<span style="padding:4px 11px;border-radius:8px;background:rgba(63,168,120,.15);font-size:10px;font-weight:700;color:#6fd0a5;letter-spacing:.05em;text-transform:uppercase;border:1px solid rgba(111,208,165,.2)">${f}</span>`).join('')}
    </div>
  </div>
</div>
`);

  /* ── Tab navigation ── */
  container.querySelectorAll('.fd-tab[data-nav]').forEach(btn => {
    btn.addEventListener('click', () => window.location.assign(panelUrl(btn.dataset.nav)));
  });

  /* ── Upload modal ── */
  const overlay = container.querySelector('#fd-overlay');
  container.querySelector('#fd-open-upload').onclick = () => overlay.classList.add('on');
  container.querySelector('#fd-close-modal').onclick = () => overlay.classList.remove('on');
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.classList.remove('on'); });
  const drop = container.querySelector('#fd-drop');
  drop.addEventListener('dragover', e => { e.preventDefault(); drop.style.borderColor = '#3fa878'; });
  drop.addEventListener('dragleave', () => { drop.style.borderColor = ''; });
  drop.addEventListener('drop', e => {
    e.preventDefault(); drop.style.borderColor = '';
    const f = e.dataTransfer.files[0];
    if (f) { overlay.classList.remove('on'); alert(`Arquivo recebido: ${f.name}`); }
  });
  drop.addEventListener('click', () => {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = '.xlsx,.xls,.csv';
    inp.onchange = ev => { const f = ev.target.files[0]; if (f) { overlay.classList.remove('on'); alert(`Arquivo selecionado: ${f.name}`); } };
    inp.click();
  });

  /* ── Line chart (demo) ── */
  if (typeof Chart !== 'undefined') {
    const G = '#3fa878', G2 = '#6fd0a5';
    const GRID_C = 'rgba(111,208,165,0.07)';
    const TT = { backgroundColor:'#0b1220', borderColor:'rgba(111,208,165,.28)', borderWidth:1, titleFont:{family:"'Syne',system-ui",size:11,weight:'700'}, bodyFont:{size:11}, padding:10 };
    Chart.defaults.color = '#9fb7aa';
    Chart.defaults.borderColor = GRID_C;
    Chart.defaults.font.family = "'DM Sans',system-ui,sans-serif";
    Chart.defaults.font.size = 11;

    new Chart(container.querySelector('#fd-line-chart'), {
      type: 'line',
      data: {
        labels: MONTHS,
        datasets: [{
          label: 'Despesas (R$)',
          data: MONTHLY_DEMO,
          borderColor: G,
          backgroundColor: ctx => {
            const gr = ctx.chart.ctx.createLinearGradient(0, 0, 0, ctx.chart.height);
            gr.addColorStop(0, 'rgba(63,168,120,0.22)');
            gr.addColorStop(1, 'rgba(63,168,120,0)');
            return gr;
          },
          fill: true, tension: .42, pointRadius: 4, pointHoverRadius: 6,
          pointBackgroundColor: G2, pointBorderColor: '#0a1e17', pointBorderWidth: 2, borderWidth: 2
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        animation: { duration: 1200, easing: 'easeOutQuart' },
        plugins: {
          legend: { display: false }, tooltip: { ...TT, callbacks: { label: ctx => '  ' + fmtBRL(ctx.parsed.y) } }
        },
        scales: {
          x: { grid: { color: GRID_C }, ticks: { font: { size: 10 } } },
          y: { grid: { color: GRID_C }, ticks: { font: { size: 10 }, callback: v => 'R$' + (v/1000).toFixed(0) + 'k' } }
        }
      }
    });
  }

  /* ── Load live data ── */
  loadVehicleData(container, sb);
}

async function loadVehicleData(container, sb) {
  try {
    const { data: vehicles, error } = await sb
      .from('frotas_veiculos')
      .select('status, possui_rastreador, bfleet_rastreador, patrimonio_coordenacao');

    if (error || !vehicles) throw error || new Error('sem dados');

    /* Status breakdown */
    let comRastreador = 0, semRastreador = 0, manutencao = 0, outras = 0;
    const coordMap = {};

    for (const v of vehicles) {
      const hasTracker = v.possui_rastreador || v.bfleet_rastreador;
      const st = (v.status || '').toUpperCase();
      if (st === 'ATIVO' && hasTracker) comRastreador++;
      else if (st === 'ATIVO' && !hasTracker) semRastreador++;
      else if (st.includes('MANUT')) manutencao++;
      else outras++;

      /* Coordenação count */
      const coord = (v.patrimonio_coordenacao || '').trim();
      if (coord) coordMap[coord] = (coordMap[coord] || 0) + 1;
    }

    const total = vehicles.length;

    /* Update KPI cards */
    setCard(container, '#fd-s-rastreador', comRastreador);
    setCard(container, '#fd-s-sem', semRastreador);
    setCard(container, '#fd-s-manut', manutencao);
    setCard(container, '#fd-s-outras', outras);
    const badge = container.querySelector('#fd-total-badge');
    if (badge) badge.textContent = `🚗 ${total} veículos cadastrados`;

    /* Coordenação list */
    const sorted = Object.entries(coordMap).sort((a, b) => b[1] - a[1]);
    const maxCoord = sorted.length ? sorted[0][1] : 1;
    const listEl = container.querySelector('#fd-coord-list');
    if (listEl && sorted.length) {
      listEl.innerHTML = sorted.map(([name, cnt]) => `
        <div class="fd-coord-row">
          <span class="fd-coord-name" title="${name}">${name}</span>
          <div class="fd-coord-bar-wrap"><div class="fd-coord-bar" style="width:${(cnt/maxCoord*100).toFixed(1)}%"></div></div>
          <span class="fd-coord-count">${cnt}</span>
        </div>
      `).join('');
    }

    /* Aggregate by state for map */
    const stateVals = {};
    for (const [coord, cnt] of Object.entries(coordMap)) {
      const key = coord.toUpperCase().trim();
      let uf = COORD_TO_UF[key];
      if (!uf) {
        /* Fuzzy: try if any key starts with the coord or vice versa */
        for (const [k, u] of Object.entries(COORD_TO_UF)) {
          if (key.startsWith(k) || k.startsWith(key.split(' ')[0])) { uf = u; break; }
        }
      }
      if (uf) stateVals[uf] = (stateVals[uf] || 0) + cnt;
    }

    /* Render map */
    const mapWrap = container.querySelector('#fd-map-wrap');
    if (mapWrap) {
      mapWrap.innerHTML = buildMapSvg(stateVals);
      const vals = Object.values(stateVals).filter(v => v > 0);
      const mapMax = container.querySelector('#fd-map-max');
      const mapMin = container.querySelector('#fd-map-min');
      if (mapMax) mapMax.textContent = vals.length ? String(Math.max(...vals)) : '—';
      if (mapMin) mapMin.textContent = vals.length ? String(Math.min(...vals)) : '0';

      /* Tooltip */
      let tip = document.getElementById('fd-tip');
      if (!tip) {
        tip = document.createElement('div');
        tip.id = 'fd-tip';
        tip.className = 'fd-map-tip';
        tip.innerHTML = '<div class="tn" id="fd-tip-name"></div><div class="tv" id="fd-tip-val"></div><div class="ts" id="fd-tip-sub"></div>';
        document.body.appendChild(tip);
      }
      const tipName = document.getElementById('fd-tip-name');
      const tipVal  = document.getElementById('fd-tip-val');
      const tipSub  = document.getElementById('fd-tip-sub');

      mapWrap.querySelectorAll('.fd-br-state').forEach(path => {
        path.addEventListener('mouseenter', () => {
          const v = parseInt(path.dataset.value) || 0;
          tipName.textContent = path.dataset.name + ' (' + path.dataset.uf + ')';
          tipVal.textContent  = v ? `${v} veículo${v > 1 ? 's' : ''}` : 'Sem veículos';
          tipSub.textContent  = v ? `${(v / total * 100).toFixed(1)}% da frota` : '';
          tip.style.display = 'block';
        });
        path.addEventListener('mousemove', e => {
          tip.style.left = (e.clientX + 14) + 'px';
          tip.style.top  = (e.clientY - 36) + 'px';
        });
        path.addEventListener('mouseleave', () => { tip.style.display = 'none'; });
      });
    }

  } catch (err) {
    console.error('[frotas-dashboard] Erro ao carregar dados:', err);
    ['#fd-s-rastreador','#fd-s-sem','#fd-s-manut','#fd-s-outras'].forEach(id => {
      const el = container.querySelector(id);
      if (el) { el.textContent = '—'; el.classList.remove('loading'); }
    });
  }
}

function setCard(container, selector, value) {
  const el = container.querySelector(selector);
  if (!el) return;
  el.classList.remove('loading');
  el.textContent = value;
}

export function renderContent(content, ctx) {
  renderFrotasDashboard(content, { supabase: sbDefault, auth: ctx });
}

initProtectedPage('Dashboard de Frotas', renderContent);
