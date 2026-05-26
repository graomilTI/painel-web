import { initProtectedPage } from './pageInit.js';
import { flattenAllowedMenu, buildAllowedMenu } from './menuBuilder.js';
import { toPanelUrl } from './paths.js';
import { supabase } from './supabaseClient.js';

const ICON_MODULES = `<svg viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>`;
const ICON_USER    = `<svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>`;
const ICON_SECTOR  = `<svg viewBox="0 0 24 24"><path d="M3 21V7l9-5 9 5v14"/><path d="M9 21V12h6v9"/></svg>`;
const ICON_STATUS  = `<svg viewBox="0 0 24 24"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`;

const BR = new Intl.NumberFormat('pt-BR');
const MESES_FULL = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
const GESTOR_CACHE_KEY = 'grao1000:gestor-dash:v2';
const GESTOR_CACHE_TTL = 5 * 60 * 1000;

/* Brazil state SVG paths — viewBox 0 0 800 796, sourced from adm-hotel.js */
const BR_STATES = [
  {uf:'AC',d:'M23.34,259.60L90.84,279.56L159.17,312.07L163.20,313.66L125.50,337.17L85.14,335.06L85.44,305.72L73.05,316.00L55.50,315.17L51.39,304.44L35.13,303.98L41.05,297.40L29.27,282.74L24.71,274.57L24.64,272.08L20.08,268.67L20.00,263.83L23.72,263.83Z'},
  {uf:'AL',d:'M774.15,293.93L769.66,301.03L762.06,309.50L756.06,317.29L751.27,321.45L751.35,322.35L749.37,325.23L748.30,323.41L746.10,323.64L746.02,321.90L744.66,320.54L743.52,321.14L738.65,317.44L738.50,315.78L718.36,305.95L713.87,302.47L722.31,293.40L738.65,303.76L739.72,301.56L743.67,301.64L745.11,303.07L757.81,293.32L762.75,294.61L766.24,292.72Z'},
  {uf:'AM',d:'M225.45,79.13L238.22,86.01L247.34,128.12L242.70,136.74L262.46,152.16L260.41,137.72L268.62,130.99L277.89,138.86L285.57,134.92L283.37,131.52L290.21,117.00L312.55,116.48L313.09,129.63L323.80,143.92L361.96,165.39L322.13,253.63L326.84,263.61L322.05,292.04L261.32,292.49L249.62,291.88L235.94,276.54L222.03,276.61L208.27,294.68L196.11,294.91L196.26,304.81L168.90,304.44L159.17,312.07L90.84,279.56L23.34,259.60L25.40,252.27L36.11,247.20L33.61,238.88L42.57,220.81L68.42,207.28L97.91,205.16L108.55,141.27L96.62,125.25L96.31,110.43L113.64,110.05L113.57,101.35L100.26,101.50L100.26,88.42L131.88,88.20L146.40,79.73L153.32,86.38L153.70,99.16L183.72,109.22Z'},
  {uf:'AP',d:'M482.66,109.14L452.03,135.91L453.02,143.54L439.87,144.53L415.24,97.50L400.95,88.05L392.97,88.05L390.39,73.91L394.64,73.68L398.90,79.28L406.57,79.73L411.14,76.10L420.56,76.33L422.54,79.35L429.53,79.35L458.64,35.35L469.81,76.93L488.13,90.39L487.67,102.03Z'},
  {uf:'BA',d:'M713.87,302.47L718.36,305.95L718.66,314.87L721.78,315.40L723.53,322.13L721.47,323.04L721.47,329.31L717.98,330.37L717.37,329.23L714.41,329.39L713.11,331.50L718.13,341.79L728.62,347.00L711.06,374.22L707.26,371.73L700.04,378.46L697.76,407.87L701.64,429.26L693.05,456.48L696.16,464.35L693.58,468.28L688.94,470.32L685.90,477.20L674.05,469.49L675.57,465.63L667.36,458.52L669.79,449.30L674.27,448.62L680.20,431.91L597.66,397.74L562.24,416.86L562.47,409.76L558.13,372.94L551.98,341.18L566.57,320.54L577.59,331.58L599.18,327.95L608.22,316.31L604.65,306.93L611.80,301.41L625.78,308.22L635.97,301.18L642.96,301.18L655.04,289.54L665.15,299.07L665.00,304.36L671.77,304.51L690.84,286.97L705.28,295.89L708.02,293.32L712.51,296.95L711.21,299.22Z'},
  {uf:'CE',d:'M731.81,215.14L725.35,217.71L707.18,245.01L703.38,256.50L707.79,263.08L704.45,272.00L696.32,272.00L685.52,263.91L668.80,265.12L671.84,253.02L665.91,250.60L659.22,216.81L653.75,178.25L644.02,174.47L653.75,178.25L679.06,176.81L709.08,193.44L720.26,205.77L731.74,212.12Z'},
  {uf:'DF',d:'M537.54,432.89L518.76,432.89L518.69,422.38L537.54,422.46Z'},
  {uf:'ES',d:'M661.43,534.89L646.07,531.26L646.15,525.66L642.81,524.76L644.71,513.49L652.46,513.19L661.96,495.27L658.84,491.19L661.20,485.67L656.11,477.58L660.59,473.57L664.47,473.72L667.51,469.56L674.05,469.49L685.90,477.20L683.24,485.82L685.37,496.55L683.24,502.38L677.92,506.08L675.03,514.62L668.50,525.89L664.32,526.12Z'},
  {uf:'GO',d:'M474.07,369.84L498.32,377.17L558.13,372.94L562.47,409.76L546.66,412.25L547.26,429.49L537.54,432.89L537.54,422.46L518.69,422.38L518.76,432.89L537.54,432.89L538.07,471.83L526.74,480.98L519.14,477.35L504.40,477.50L496.95,483.85L479.31,484.31L467.08,499.28L430.29,482.87L425.50,470.62L422.31,463.67L426.94,448.17L441.31,429.79L449.75,428.43L454.00,413.92L464.04,412.25Z'},
  {uf:'MA',d:'M513.59,221.87L532.90,209.93L545.82,190.95L561.55,141.88L586.86,151.33L593.55,167.81L601.69,170.53L610.58,164.86L630.80,174.77L644.10,174.62L621.45,203.88L622.74,251.06L611.95,255.37L609.06,250.60L600.09,253.85L590.67,263.76L573.56,270.49L563.76,293.47L566.57,320.54L555.32,317.82L551.67,309.88L542.70,296.35L547.42,283.95L553.65,282.96L552.59,274.42L542.70,276.69L530.47,262.02L536.40,243.12L533.81,228.00Z'},
  {uf:'MG',d:'M680.20,431.91L674.27,448.62L669.79,449.30L667.36,458.52L675.57,465.63L674.05,469.49L667.51,469.56L664.47,473.72L660.59,473.57L656.11,477.58L661.20,485.67L658.84,491.19L661.96,495.27L652.46,513.19L644.71,513.49L642.81,524.76L641.36,528.16L638.78,528.08L633.61,541.09L634.67,542.83L619.55,550.01L614.46,547.82L587.24,556.13L556.31,565.81L534.80,509.26L466.54,507.97L467.08,499.28L479.31,484.31L496.95,483.85L504.40,477.50L519.14,477.35L526.74,480.98L538.07,471.83L537.54,432.89L547.26,429.49L546.66,412.25L562.47,409.76L562.24,416.86L597.73,397.96Z'},
  {uf:'MS',d:'M425.50,470.62L430.29,482.87L467.08,499.28L466.54,507.97L437.66,551.67L425.27,559.61L415.70,566.34L408.63,576.09L402.93,587.74L394.34,585.09L381.57,586.98L372.14,553.49L331.02,552.28L331.56,528.23L325.25,508.65L340.37,469.26L355.50,457.77L369.63,454.44L386.28,463.89L405.66,463.44L413.80,454.97L413.72,463.82L406.42,470.70Z'},
  {uf:'MT',d:'M278.20,387.30L294.39,360.23L294.54,335.13L261.17,334.75L261.32,292.49L322.05,292.04L326.84,263.61L354.21,304.06L480.99,312.53L471.03,343.45L474.07,369.84L464.04,412.25L454.00,413.92L449.75,428.43L441.31,429.79L426.94,448.17L422.31,463.67L425.50,470.62L406.42,470.70L413.72,463.82L413.80,454.97L405.66,463.44L386.28,463.89L369.63,454.44L355.50,457.77L340.37,469.26L323.88,456.48L323.88,437.05L287.93,437.13L287.70,422.31L280.10,413.84L286.48,414.14L286.10,404.77L283.59,393.50Z'},
  {uf:'PA',d:'M561.55,141.88L545.82,190.95L532.90,209.93L513.59,221.87L509.56,225.50L520.43,229.96L509.87,252.12L504.09,253.63L497.33,268.90L501.58,273.36L480.99,312.53L354.21,304.06L326.84,263.61L322.13,253.63L361.96,165.39L323.80,143.92L313.09,129.63L312.55,116.48L313.01,96.89L346.76,84.64L368.57,83.89L367.73,73.76L390.39,73.91L392.97,88.05L400.95,88.05L415.24,97.50L439.87,144.53L453.02,143.54L452.03,135.91L482.66,109.14L485.70,115.49L493.00,114.89L515.65,126.76L516.03,131.52L525.15,134.70L531.00,130.16Z'},
  {uf:'PB',d:'M777.04,247.50L780.00,268.07L775.21,265.12L767.23,266.41L766.09,270.11L757.05,273.51L752.33,272.76L745.72,275.40L745.19,279.56L737.82,282.89L731.43,275.55L738.42,266.33L732.34,262.62L718.89,271.55L704.45,272.00L707.79,263.08L703.38,256.50L707.18,245.01L716.15,247.58L732.57,237.83L734.40,240.77L728.39,251.21L743.44,257.11L749.75,247.20Z'},
  {uf:'PE',d:'M780.00,268.07L774.15,293.93L766.24,292.72L762.75,294.61L757.81,293.32L745.11,303.07L743.67,301.64L739.72,301.56L738.65,303.76L722.31,293.40L713.87,302.47L711.21,299.22L712.51,296.95L708.02,293.32L705.28,295.89L690.84,286.97L671.77,304.51L665.00,304.36L665.15,299.07L655.04,289.54L668.80,278.05L668.72,273.36L665.46,272.15L665.53,266.48L668.80,265.12L685.52,263.91L696.32,272.00L704.45,272.00L718.89,271.55L732.34,262.62L738.42,266.33L731.43,275.55L737.82,282.89L745.19,279.56L745.72,275.40L752.33,272.76L757.05,273.51L766.09,270.11L767.23,266.41L775.21,265.12Z'},
  {uf:'PI',d:'M644.10,174.62L653.75,178.25L659.22,216.81L665.91,250.60L671.84,253.02L668.80,265.12L665.53,266.48L665.46,272.15L668.72,273.36L668.80,278.05L655.04,289.54L642.96,301.18L635.97,301.18L625.78,308.22L611.80,301.41L604.65,306.93L608.22,316.31L599.18,327.95L577.59,331.58L566.57,320.54L563.76,293.47L573.56,270.49L590.67,263.76L600.09,253.85L609.06,250.60L611.95,255.37L622.74,251.06L621.45,203.88Z'},
  {uf:'PR',d:'M425.27,559.61L489.95,568.76L500.82,598.10L523.70,610.95L512.53,625.47L501.43,625.47L494.59,629.85L487.22,626.22L473.99,626.37L471.33,630.23L460.84,631.67L458.56,638.09L414.71,630.91L408.70,618.89L396.31,617.98L402.93,587.74L408.63,576.09L415.70,566.34Z'},
  {uf:'RJ',d:'M587.40,574.66L585.04,567.78L597.43,563.32L595.83,559.54L590.59,561.20L587.24,556.13L614.46,547.82L619.55,550.01L634.67,542.83L633.61,541.09L638.78,528.08L641.36,528.16L642.81,524.76L646.15,525.66L646.07,531.26L661.43,534.89L658.69,539.05L660.44,548.12L655.65,550.84L649.19,552.96L640.83,559.91L643.11,562.41L640.07,566.64L620.76,567.10L609.89,568.76L604.80,566.19L590.13,571.25L590.97,573.60Z'},
  {uf:'RN',d:'M731.81,215.14L744.05,220.28L757.88,219.60L769.43,222.93L777.04,247.50L749.75,247.20L743.44,257.11L728.39,251.21L734.40,240.77L732.57,237.83L716.15,247.58L707.18,245.01L725.35,217.71Z'},
  {uf:'RO',d:'M159.17,312.07L168.90,304.44L196.26,304.81L196.11,294.91L208.27,294.68L222.03,276.61L235.94,276.54L249.62,291.88L261.32,292.49L261.17,334.75L294.54,335.13L294.39,360.23L278.20,387.30L271.21,383.60L255.09,384.20L249.09,377.40L217.24,362.50L209.56,365.45L188.20,348.89L188.28,313.81L163.20,313.66Z'},
  {uf:'RR',d:'M313.01,96.89L312.55,116.48L290.21,117.00L283.37,131.52L285.57,134.92L277.89,138.86L268.62,130.99L260.41,137.72L262.46,152.16L242.70,136.74L247.34,128.12L238.22,86.01L225.45,79.13L225.14,74.97L213.82,75.04L209.49,52.51L197.10,39.88L198.85,38.45L202.57,41.70L211.46,42.23L213.97,46.01L229.48,45.33L233.35,51.76L238.60,50.24L236.39,44.80L246.05,40.87L251.60,42.30L277.29,29.07L277.06,20.30L290.97,20.00L291.42,33.99L298.49,36.71L298.80,48.05L291.96,63.63L292.34,75.95L296.21,77.31L296.29,85.48L306.09,95.31Z'},
  {uf:'RS',d:'M410.91,648.53L451.04,653.29L474.30,671.74L488.28,675.37L484.86,685.42L490.03,689.96L479.77,712.87L469.66,726.33L462.14,732.90L445.26,744.85L445.19,739.03L448.91,739.03L458.03,732.60L472.09,713.32L462.29,711.43L452.94,727.46L441.39,738.95L444.43,740.69L444.43,745.23L439.94,750.37L435.99,761.71L431.73,766.93L419.80,776.00L416.76,773.43L419.04,766.62L426.79,757.32L430.97,759.82L435.00,751.50L431.58,749.31L423.30,754.53L378.15,720.88L369.48,724.74L341.89,704.32L375.94,667.20Z'},
  {uf:'SC',d:'M414.71,630.91L458.56,638.09L460.84,631.67L471.33,630.23L473.99,626.37L487.22,626.22L494.59,629.85L501.43,625.47L512.53,625.47L514.81,630.38L511.09,639.60L512.99,652.23L512.83,661.76L509.72,674.46L490.03,689.96L484.86,685.42L488.28,675.37L474.30,671.74L451.04,653.29L410.91,648.53Z'},
  {uf:'SE',d:'M718.36,305.95L738.50,315.78L738.65,317.44L743.52,321.14L744.66,320.54L746.02,321.90L746.10,323.64L748.30,323.41L749.37,325.23L748.84,326.06L746.71,326.06L739.41,331.05L728.62,347.00L718.13,341.79L713.11,331.50L714.41,329.39L717.37,329.23L717.98,330.37L721.47,329.31L721.47,323.04L723.53,322.13L721.78,315.40L718.66,314.87Z'},
  {uf:'SP',d:'M587.40,574.66L574.10,580.25L575.16,582.14L572.42,583.96L567.94,582.52L562.39,583.35L546.66,591.29L523.70,610.95L500.82,598.10L489.95,568.76L425.27,559.61L437.66,551.67L466.54,507.97L534.80,509.26L556.31,565.81L587.24,556.13L590.59,561.20L595.83,559.54L597.43,563.32L585.04,567.78Z'},
  {uf:'TO',d:'M566.57,320.54L551.98,341.18L558.13,372.94L498.32,377.17L474.07,369.84L471.03,343.45L480.99,312.53L501.58,273.36L497.33,268.90L504.09,253.63L509.87,252.12L520.43,229.96L509.56,225.50L513.59,221.87L533.81,228.00L536.40,243.12L530.47,262.02L542.70,276.69L552.59,274.42L553.65,282.96L547.42,283.95L542.70,296.35L551.67,309.88L555.32,317.82Z'},
];

const BR_CENTROIDS = {
  AC:{x:90,y:300},AL:{x:752,y:310},AM:{x:185,y:205},AP:{x:450,y:100},
  BA:{x:643,y:388},CE:{x:700,y:233},DF:{x:528,y:428},ES:{x:664,y:505},
  GO:{x:492,y:440},MA:{x:582,y:255},MG:{x:580,y:490},MS:{x:385,y:530},
  MT:{x:370,y:400},PA:{x:435,y:225},PB:{x:748,y:264},PE:{x:718,y:283},
  PI:{x:635,y:255},PR:{x:460,y:595},RJ:{x:628,y:557},RN:{x:744,y:234},
  RO:{x:215,y:340},RR:{x:270,y:85},RS:{x:438,y:710},SC:{x:462,y:658},
  SE:{x:733,y:330},SP:{x:510,y:578},TO:{x:520,y:340},
};

const BR_YBOUNDS = {
  GO:{min:369,max:500},BA:{min:286,max:478},MA:{min:141,max:332},
  MG:{min:431,max:567},MS:{min:454,max:589},MT:{min:263,max:471},
  PA:{min:73,max:313},PR:{min:559,max:639},RS:{min:648,max:776},
  SP:{min:508,max:611},TO:{min:221,max:378},
};

const STATE_FROM_COORD = {
  'GOIAS': 'GO', 'BAHIA': 'BA', 'MARANHAO': 'MA', 'MINAS GERAIS': 'MG',
  'MATO GROSSO DO SUL': 'MS',
  'MATO GROSSO MT1': 'MT', 'MATO GROSSO MT2': 'MT',
  'MATO GROSSO MT3 CONFRESA': 'MT', 'MATO GROSSO MT3 QUERENCIA': 'MT',
  'MATO GROSSO MT4': 'MT',
  'PARA': 'PA',
  'CASCAVEL': 'PR', 'LONDRINA': 'PR', 'MARINGA E TERMINAIS': 'PR', 'PONTA GROSSA': 'PR',
  'RIO GRANDE DO SUL': 'RS', 'SAO PAULO': 'SP', 'TOCANTINS': 'TO',
};

function esc(v) {
  return String(v ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');
}

function normalizeStr(value) {
  return String(value ?? '').normalize('NFD').replace(/[̀-ͯ]/g,'').toUpperCase().replace(/[^A-Z0-9]+/g,' ').trim();
}

function fmtTons(val) { return BR.format(Math.round(Number(val) || 0)) + ' t'; }

function fmtDelta(val) {
  const v = Number(val) || 0;
  return (v >= 0 ? '+' : '−') + BR.format(Math.round(Math.abs(v))) + ' t';
}

function isGestorOrMaster(ctx) {
  const role = normalizeStr(ctx?.user?.role || ctx?.perfil_codigo || ctx?.perfil_nome || '');
  const dept = normalizeStr(ctx?.department?.code || ctx?.department?.name || ctx?.setor || '');
  return !!ctx?.user?.is_master || role === 'GESTOR' || dept === 'GESTOR' || role === 'MASTER';
}

function injectDashStyles() {
  if (document.getElementById('dbGestorStyles')) return;
  const s = document.createElement('style');
  s.id = 'dbGestorStyles';
  s.textContent = `
    @keyframes db-fill-in { from { width: 0 !important; } }
    @keyframes db-pulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.45;transform:scale(.65)} }
    @keyframes db-fade-up { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:translateY(0)} }
    @keyframes db-wave { to { transform: translateX(60px); } }
    @keyframes db-state-rise { from { transform: scaleY(0); } }
    @keyframes db-glow-pulse { 0%,100%{opacity:.55} 50%{opacity:1} }

    .db-section { margin-bottom: 24px; animation: db-fade-up .35s ease both; }
    .db-section-head {
      display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px;
    }
    .db-section-title {
      font-size: 11px; font-weight: 950; letter-spacing: .12em; text-transform: uppercase; color: #6b7280;
    }
    .db-period-info { display: flex; align-items: baseline; gap: 8px; }
    .db-period-month { font-size: 11px; font-weight: 900; letter-spacing: .10em; color: #6b7280; text-transform: uppercase; }
    .db-period-year  { font-size: 20px; font-weight: 1000; letter-spacing: -.04em; color: #e2e2f0; }
    .db-region-tag {
      font-size: 10px; font-weight: 950; letter-spacing: .08em; text-transform: uppercase;
      color: #6ee7b7; border: 1px solid rgba(45,212,160,.28); border-radius: 999px; padding: 5px 12px;
    }
    .db-refresh-btn {
      border: 1px solid rgba(255,255,255,.08); background: rgba(21,21,42,.75);
      color: #94a3b8; border-radius: 10px; padding: 7px 12px;
      font-size: 11px; font-weight: 900; cursor: pointer; transition: .15s;
    }
    .db-refresh-btn:hover { background: rgba(45,212,160,.12); border-color: rgba(45,212,160,.28); color: #e2e2f0; }
    .db-refresh-btn.loading { opacity: .6; cursor: wait; }

    .db-prod-card {
      border: 1px solid rgba(255,255,255,.07); border-radius: 20px; padding: 22px 20px;
      background: rgba(13,13,24,.88); box-shadow: 0 16px 48px rgba(0,0,0,.26);
      position: relative; overflow: hidden; margin-bottom: 14px;
      animation: db-fade-up .35s .04s ease both;
    }
    .db-prod-card.is-on-track  { border-color: rgba(0,200,122,.28); }
    .db-prod-card.is-off-track { border-color: rgba(253,230,138,.20); }
    .db-prod-card::before {
      content:''; position:absolute; top:0; left:0; right:0; height:1px;
      background: linear-gradient(90deg,transparent,rgba(45,212,160,.45),transparent);
    }
    .db-prod-eyebrow { font-size:10px; font-weight:950; letter-spacing:.14em; text-transform:uppercase; color:#6b7280; margin-bottom:16px; }
    .db-prod-hero { display:flex; align-items:flex-end; justify-content:space-between; gap:16px; margin-bottom:20px; }
    .db-prod-main { flex:1; min-width:0; }
    .db-prod-value {
      font-size:clamp(42px,5.5vw,60px); font-weight:1000; letter-spacing:-.05em; line-height:.9;
      font-variant-numeric:tabular-nums; color:#e2e2f0; transition:color .3s;
    }
    .db-prod-value.is-green { color:#00c87a; text-shadow:0 0 28px rgba(0,200,122,.28); }
    .db-prod-value.is-amber { color:#fde68a; }
    .db-prod-sublabel { font-size:10px; font-weight:950; letter-spacing:.12em; text-transform:uppercase; color:#6b7280; margin-top:8px; }
    .db-prod-aside { display:flex; flex-direction:column; gap:10px; align-items:flex-end; flex-shrink:0; }
    .db-aside-block { text-align:right; }
    .db-aside-value { font-size:19px; font-weight:1000; letter-spacing:-.04em; font-variant-numeric:tabular-nums; color:#e2e2f0; line-height:1; }
    .db-aside-value.is-green { color:#00c87a; }
    .db-aside-value.is-red   { color:#f87171; }
    .db-aside-label { font-size:9px; font-weight:950; letter-spacing:.10em; text-transform:uppercase; color:#6b7280; margin-top:3px; }
    .db-aside-sep { height:1px; width:100%; background:rgba(255,255,255,.07); }

    .db-meter { position:relative; height:12px; border-radius:999px; background:rgba(255,255,255,.07); overflow:visible; margin-bottom:8px; }
    .db-meter-fill {
      position:absolute; top:0; left:0; bottom:0; border-radius:999px; max-width:100%;
      background:linear-gradient(90deg,#065f46,#00c87a,#2dd4a0);
      box-shadow:0 0 14px rgba(0,200,122,.40);
      animation:db-fill-in .7s .15s cubic-bezier(.22,1,.36,1) both;
    }
    .db-meter-fill.is-warn { background:linear-gradient(90deg,#78350f,#d97706,#fde68a); box-shadow:0 0 10px rgba(253,230,138,.25); }
    .db-meter-cursor { position:absolute; top:50%; transform:translate(-50%,-50%); width:3px; height:22px; border-radius:3px; background:rgba(255,255,255,.85); box-shadow:0 0 6px rgba(255,255,255,.35); pointer-events:none; z-index:2; }
    .db-meter-meta { display:flex; justify-content:space-between; align-items:baseline; margin-bottom:14px; }
    .db-meter-pct { font-size:26px; font-weight:1000; letter-spacing:-.05em; font-variant-numeric:tabular-nums; color:#e2e2f0; }
    .db-meter-pct small { font-size:13px; font-weight:800; color:#6b7280; margin-left:1px; }
    .db-meter-day { font-size:10px; font-weight:900; letter-spacing:.08em; color:#6b7280; }

    .db-pace-row { display:flex; align-items:center; justify-content:space-between; gap:8px; flex-wrap:wrap; }
    .db-pace-badge { display:inline-flex; align-items:center; gap:7px; border-radius:999px; padding:7px 14px; font-size:11px; font-weight:950; letter-spacing:.03em; }
    .db-pace-badge.is-ok   { background:rgba(0,200,122,.12); color:#00c87a; border:1px solid rgba(0,200,122,.28); }
    .db-pace-badge.is-late { background:rgba(253,230,138,.10); color:#fde68a; border:1px solid rgba(253,230,138,.26); }
    .db-pace-dot { width:7px; height:7px; border-radius:50%; background:currentColor; flex-shrink:0; }
    .db-pace-badge.is-ok .db-pace-dot { animation:db-pulse 1.8s ease-in-out infinite; }
    .db-delta { font-size:11px; font-weight:900; opacity:.85; }
    .db-delta.is-pos { color:#00c87a; }
    .db-delta.is-neg { color:#fde68a; }

    .db-secondary-grid { display:grid; grid-template-columns:1fr 1fr; gap:14px; animation:db-fade-up .35s .08s ease both; }
    @media(max-width:700px) { .db-secondary-grid{grid-template-columns:1fr} }

    .db-mini-card { border:1px solid rgba(255,255,255,.07); border-radius:18px; padding:18px 16px; background:rgba(13,13,24,.88); }
    .db-mini-eyebrow { font-size:9px; font-weight:950; letter-spacing:.14em; text-transform:uppercase; color:#6b7280; margin-bottom:12px; }
    .db-patri-hero { display:flex; align-items:baseline; gap:5px; margin-bottom:12px; }
    .db-patri-num { font-size:40px; font-weight:1000; letter-spacing:-.05em; line-height:1; font-variant-numeric:tabular-nums; color:#e2e2f0; }
    .db-patri-num.is-green { color:#00c87a; }
    .db-patri-den { font-size:14px; font-weight:700; color:#6b7280; }
    .db-seg { display:flex; height:7px; border-radius:999px; overflow:hidden; background:rgba(255,255,255,.06); margin-bottom:8px; gap:2px; }
    .db-seg-ok   { background:#00c87a; border-radius:999px; transition:width .6s ease; }
    .db-seg-late { background:#f87171; border-radius:999px; transition:width .6s ease; }
    .db-patri-status { font-size:11px; font-weight:900; }
    .db-status-ok   { color:#00c87a; }
    .db-status-late { color:#f87171; }
    .db-patri-detail { font-size:10px; color:#6b7280; margin-top:5px; }

    .db-os-nums { display:flex; align-items:stretch; margin-bottom:14px; }
    .db-os-block { flex:1; text-align:center; padding:10px 6px; }
    .db-os-num { font-size:32px; font-weight:1000; letter-spacing:-.05em; line-height:1; font-variant-numeric:tabular-nums; color:#e2e2f0; }
    .db-os-num.is-amber { color:#fde68a; }
    .db-os-num.is-green { color:#00c87a; }
    .db-os-label { font-size:9px; font-weight:900; letter-spacing:.08em; color:#6b7280; text-transform:uppercase; margin-top:4px; }
    .db-os-sep { width:1px; background:rgba(255,255,255,.07); }
    .db-os-link { display:block; width:100%; background:rgba(0,200,122,.10); color:#00c87a; border:1px solid rgba(0,200,122,.26); border-radius:10px; padding:9px; font-size:11px; font-weight:950; text-align:center; text-decoration:none; transition:background .15s; }
    .db-os-link:hover { background:rgba(0,200,122,.18); }

    .db-loading { padding:32px; text-align:center; color:#6b7280; font-size:13px; }

    .db-prod-body { display:grid; grid-template-columns:1fr 1fr; gap:18px; align-items:center; margin-bottom:18px; }
    @media(max-width:640px) { .db-prod-body { grid-template-columns:1fr; } }
    .db-prod-left { }
    .db-prod-right { display:flex; flex-direction:column; gap:12px; }
    .db-stat-block { }
    .db-stat-label { font-size:9px; font-weight:950; letter-spacing:.12em; text-transform:uppercase; color:#6b7280; margin-bottom:5px; }
    .db-stat-value { font-size:clamp(20px,2.4vw,28px); font-weight:1000; letter-spacing:-.04em; font-variant-numeric:tabular-nums; color:#e2e2f0; line-height:1; }
    .db-stat-value.is-green { color:#00c87a; }
    .db-stat-value.is-amber { color:#fde68a; }
    .db-stat-sub { font-size:10px; font-weight:700; color:#6b7280; margin-top:4px; }
    .db-stat-sub.is-pos { color:#00c87a; }
    .db-stat-sub.is-neg { color:#fde68a; }
    .db-delta-inline { }
    .db-stat-sep { height:1px; background:rgba(255,255,255,.06); }
    .db-chart-label { font-size:9px; font-weight:950; letter-spacing:.12em; text-transform:uppercase; color:#6b7280; margin-bottom:6px; }

    .db-state-wrap {
      margin: 0;
    }
    .db-state-svg {
      width: 100%; height: auto; max-height: 380px; display: block; overflow: visible;
    }
    .db-state-fill-rect {
      transform-box: fill-box;
      transform-origin: bottom center;
      transform: scaleY(0);
      transition: transform .9s cubic-bezier(.22,1,.36,1);
    }
    .db-state-wave-path {
      animation: db-wave 3s linear infinite;
    }
    .db-state-pct {
      font-size: 28px; font-weight: 1000; letter-spacing: -.04em;
      fill: #fff; text-anchor: middle; dominant-baseline: central;
      paint-order: stroke fill;
      stroke: rgba(0,0,0,.6); stroke-width: 6px;
    }
    .db-state-abbr {
      font-size: 12px; font-weight: 950; letter-spacing: .10em;
      fill: rgba(255,255,255,.7); text-anchor: middle; dominant-baseline: central;
      paint-order: stroke fill;
      stroke: rgba(0,0,0,.5); stroke-width: 4px;
    }
  `;
  document.head.appendChild(s);
}

async function fetchGestorData(ctx) {
  const isMaster = !!ctx?.user?.is_master;
  const coordenacao = ctx?.user?.coordenacao || '';
  const now = new Date();
  const ano = now.getFullYear();
  const mes = now.getMonth() + 1;
  const dataIni = `${ano}-${String(mes).padStart(2,'0')}-01`;
  const dataFim = mes === 12 ? `${ano+1}-01-01` : `${ano}-${String(mes+1).padStart(2,'0')}-01`;
  const d7 = new Date(now); d7.setDate(d7.getDate() - 6);
  const dataD7   = `${d7.getFullYear()}-${String(d7.getMonth()+1).padStart(2,'0')}-${String(d7.getDate()).padStart(2,'0')}`;
  const dataHoje = `${ano}-${String(mes).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;

  let prodBase      = supabase.from('producao_snapshot').select('tons.sum()').gte('data',dataIni).lt('data',dataFim);
  let daily7Base    = supabase.from('producao_snapshot').select('data,tons').gte('data',dataD7).lte('data',dataHoje);
  let patriBase     = supabase.from('patrimonios_snapshot').select('*',{count:'exact',head:true}).eq('situacao','Ativo');
  let patriLateBase = supabase.from('patrimonios_snapshot').select('*',{count:'exact',head:true}).eq('situacao','Ativo').gt('dias_sem_leitura',7);
  let osPendBase    = supabase.from('operacional_os').select('*',{count:'exact',head:true})
                        .or('status_gestor.is.null,status_gestor.eq.AGUARDAR').is('configurada_em',null);
  let osAtendBase   = supabase.from('operacional_os').select('*',{count:'exact',head:true}).eq('status_gestor','ATENDER');
  let osTotalBase   = supabase.from('operacional_os').select('*',{count:'exact',head:true});

  if (!isMaster && coordenacao) {
    prodBase      = prodBase.eq('coordenacao', coordenacao);
    daily7Base    = daily7Base.eq('coordenacao', coordenacao);
    patriBase     = patriBase.eq('coordenacao', coordenacao);
    patriLateBase = patriLateBase.eq('coordenacao', coordenacao);
    osPendBase    = osPendBase.eq('coordenacao', coordenacao);
    osAtendBase   = osAtendBase.eq('coordenacao', coordenacao);
    osTotalBase   = osTotalBase.eq('coordenacao', coordenacao);
  }

  const [metaRes, patriTotalRes, patriLateRes, d7Res, prodRes, osPendRes, osAtendRes, osTotalRes] =
    await Promise.all([
      supabase.from('metas_producao').select('meta_tons,regional').eq('ano',ano).eq('mes',mes).eq('ativo',true),
      patriBase,
      patriLateBase,
      daily7Base,
      prodBase,
      osPendBase,
      osAtendBase,
      osTotalBase,
    ]);

  const produzido = Number(prodRes.data?.[0]?.sum || 0);

  const d7map = {};
  for (const r of (d7Res.data || [])) {
    const k = String(r.data || '').slice(0,10);
    if (k) d7map[k] = (d7map[k] || 0) + Number(r.tons || 0);
  }
  const daily7 = Array.from({length:7}, (_,i) => {
    const d = new Date(now); d.setDate(d.getDate() - (6-i));
    const k = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    return { date: k, tons: d7map[k] || 0 };
  });

  let meta = null;
  if (metaRes.data?.length) {
    if (isMaster) {
      meta = metaRes.data.reduce((s,r) => s + Number(r.meta_tons||0), 0);
    } else {
      const hit = metaRes.data.find(r =>
        normalizeStr(r.regional) === normalizeStr(coordenacao) ||
        normalizeStr(coordenacao).startsWith(normalizeStr(r.regional)) ||
        normalizeStr(r.regional).startsWith(normalizeStr(coordenacao))
      );
      meta = hit ? Number(hit.meta_tons) : null;
    }
  }

  return {
    ano, mes, coordenacao, isMaster,
    produzido, meta, daily7,
    patriTotal: patriTotalRes.count ?? 0,
    patriAtrasados: patriLateRes.count ?? 0,
    osPendentes: osPendRes.count ?? 0,
    osAtender:   osAtendRes.count ?? 0,
    osTotal:     osTotalRes.count ?? 0,
  };
}

function renderStateFill({ pct, onTrack, estado }) {
  const uf       = estado && estado !== 'BR' ? estado : null;
  const isBR     = !uf;
  const target   = uf ? BR_STATES.find(s => s.uf === uf) : null;
  const centroid = (uf && BR_CENTROIDS[uf]) || {x:400, y:398};
  const bounds   = (uf && BR_YBOUNDS[uf]) || (isBR ? {min:20, max:776} : {min:100, max:700});

  const gradTop = onTrack ? '#2dd4a0' : '#fde68a';
  const gradBot = onTrack ? '#065f46' : '#78350f';
  const glowClr = onTrack ? 'rgba(0,200,122,.9)' : 'rgba(253,230,138,.8)';

  const stH   = bounds.max - bounds.min;
  const fillH = Math.max(0, stH * pct / 100);
  const fillY = bounds.max - fillH;
  const amp   = Math.max(4, stH * 0.025);
  const period = 200;
  const waveSegs = [];
  for (let x = -period; x <= 1000 + period; x += period) {
    waveSegs.push(`Q ${x + period/4},${fillY - amp} ${x + period/2},${fillY}`);
    waveSegs.push(`Q ${x + 3*period/4},${fillY + amp} ${x + period},${fillY}`);
  }
  const wavePath = `M ${-period},${fillY} ${waveSegs.join(' ')} L 1000,${bounds.max+30} L ${-period},${bounds.max+30} Z`;

  const bgStates = BR_STATES
    .filter(s => s.uf !== uf)
    .map(s => `<path d="${s.d}" fill="rgba(255,255,255,0.04)" stroke="rgba(255,255,255,0.10)" stroke-width="0.9" stroke-linejoin="round"/>`)
    .join('');

  const clipPaths = isBR
    ? BR_STATES.map(s => `<path d="${s.d}"/>`).join('')
    : `<path d="${target ? target.d : ''}"/>`;

  const cx = centroid.x;
  const cy = centroid.y;

  return `
    <div class="db-state-wrap">
      <svg class="db-state-svg" viewBox="0 0 800 796" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <clipPath id="dbStateClip">${clipPaths}</clipPath>
          <linearGradient id="dbFillGrad" x1="0" y1="${fillY}" x2="0" y2="${bounds.max}" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stop-color="${gradTop}"/>
            <stop offset="100%" stop-color="${gradBot}"/>
          </linearGradient>
          <filter id="dbGlowFilter" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="5" result="b"/>
            <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
        </defs>

        ${bgStates}

        <g clip-path="url(#dbStateClip)">
          <rect class="db-state-fill-rect"
                x="-10" y="${fillY}" width="820" height="${fillH + 30}"
                fill="url(#dbFillGrad)"/>
          <path class="db-state-wave-path" d="${wavePath}" fill="${gradTop}" opacity=".35"/>
        </g>

        ${!isBR && target ? `
          <path d="${target.d}" fill="none" stroke="${glowClr}" stroke-width="2" stroke-linejoin="round"
                filter="url(#dbGlowFilter)" opacity=".7"/>
          <path d="${target.d}" fill="none" stroke="${glowClr}" stroke-width="1.4" stroke-linejoin="round"/>
          <text x="${cx}" y="${cy - 14}" class="db-state-pct">${pct.toFixed(0)}%</text>
          <text x="${cx}" y="${cy + 16}" class="db-state-abbr">${uf}</text>
        ` : `
          ${isBR ? BR_STATES.map(s => `<path d="${s.d}" fill="none" stroke="rgba(255,255,255,0.12)" stroke-width="0.8" stroke-linejoin="round"/>`).join('') : ''}
          <text x="400" y="398" class="db-state-pct">${pct.toFixed(0)}%</text>
        `}
      </svg>
    </div>
  `;
}

function renderMiniChart(daily7) {
  if (!daily7?.length) return '<div style="height:56px"></div>';
  const maxT = Math.max(...daily7.map(d => d.tons), 1);
  const W = 180, H = 46, bw = 18, gap = 6;
  const totalW = daily7.length * bw + (daily7.length - 1) * gap;
  const ox = (W - totalW) / 2;
  const bars = daily7.map((d, i) => {
    const h = Math.max(2, Math.round((d.tons / maxT) * H));
    const x = ox + i * (bw + gap);
    const dd = String(d.date || '').slice(8);
    const fill = i === 6 ? 'rgba(0,200,122,.90)' : 'rgba(0,200,122,.35)';
    return `<rect x="${x}" y="${H-h}" width="${bw}" height="${h}" rx="3" fill="${fill}"/>
            <text x="${x + bw/2}" y="${H+11}" text-anchor="middle" fill="rgba(255,255,255,.35)" style="font-size:7px;font-family:monospace;font-weight:700">${dd}</text>`;
  }).join('');
  return `<svg viewBox="0 0 ${W} ${H+14}" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:62px;display:block;overflow:visible">${bars}</svg>`;
}

function renderGestorDashboard(container, data) {
  const { ano, mes, coordenacao, isMaster, produzido, meta, daily7, patriTotal, patriAtrasados, osPendentes, osAtender, osTotal } = data;
  const now = new Date();
  const diaAtual   = now.getDate();
  const diasNoMes  = new Date(ano, mes, 0).getDate();
  const pct         = meta > 0 ? Math.min(100, produzido / meta * 100) : 0;
  const ritmo       = meta > 0 ? meta * diaAtual / diasNoMes : 0;
  const onTrack     = produzido >= ritmo;
  const projetado   = diaAtual > 0 ? produzido / diaAtual * diasNoMes : 0;
  const delta       = produzido - ritmo;
  const patriOk     = patriTotal - patriAtrasados;
  const patriPct    = patriTotal > 0 ? (patriOk / patriTotal * 100) : 100;
  const patriAtrPct = patriTotal > 0 ? (patriAtrasados / patriTotal * 100) : 0;
  const regionLabel = isMaster ? 'TODAS AS REGIONAIS' : (coordenacao || 'REGIONAL');
  const estado      = isMaster ? 'BR' : (STATE_FROM_COORD[normalizeStr(coordenacao)] || null);

  container.innerHTML = `
    <div class="db-section">
      <div class="db-section-head">
        <div style="display:flex;align-items:center;gap:16px">
          <div class="db-period-info">
            <span class="db-period-month">${MESES_FULL[mes-1].toUpperCase()}</span>
            <span class="db-period-year">${ano}</span>
          </div>
          <span class="db-region-tag">${esc(regionLabel)}</span>
        </div>
        <button class="db-refresh-btn" id="dbRefreshBtn" type="button">↻ Atualizar</button>
      </div>

      <div class="db-prod-card ${onTrack ? 'is-on-track' : 'is-off-track'}">
        <div class="db-prod-eyebrow">Produtividade do Mês</div>
        <div class="db-prod-body">
          <div class="db-prod-left">
            ${renderStateFill({ pct, onTrack, estado, diaAtual, diasNoMes })}
          </div>
          <div class="db-prod-right">
            <div class="db-stat-block">
              <div class="db-stat-label">Meta do mês</div>
              <div class="db-stat-value">${meta > 0 ? fmtTons(meta) : '—'}</div>
            </div>
            <div class="db-stat-sep"></div>
            <div class="db-stat-block">
              <div class="db-stat-label">Produção atual</div>
              <div class="db-stat-value ${onTrack ? 'is-green' : 'is-amber'}">${fmtTons(produzido)}</div>
              <div class="db-stat-sub">${pct.toFixed(0)}% da meta &middot; DIA ${diaAtual}/${diasNoMes}</div>
              ${meta > 0 ? `<div class="db-stat-sub db-delta-inline ${onTrack ? 'is-pos' : 'is-neg'}">${fmtDelta(delta)} vs ritmo do dia</div>` : ''}
            </div>
            <div class="db-stat-sep"></div>
            <div>
              <div class="db-chart-label">Últimos 7 dias</div>
              ${renderMiniChart(daily7)}
            </div>
          </div>
        </div>
        <div class="db-pace-row">
          <div class="db-pace-badge ${onTrack ? 'is-ok' : 'is-late'}">
            <span class="db-pace-dot"></span>
            <span>${onTrack ? 'No ritmo esperado' : 'Abaixo do ritmo'}</span>
          </div>
          ${meta > 0 ? `<div class="db-delta ${onTrack ? 'is-pos' : 'is-neg'}">${fmtDelta(delta)} vs meta do dia</div>` : ''}
        </div>
      </div>

      <div class="db-secondary-grid">
        <div class="db-mini-card">
          <div class="db-mini-eyebrow">Leitura de Patrimônios</div>
          <div class="db-patri-hero">
            <span class="db-patri-num ${patriAtrasados===0 ? 'is-green' : ''}">${patriOk}</span>
            <span class="db-patri-den">/ ${patriTotal}</span>
          </div>
          <div class="db-seg">
            <div class="db-seg-ok"   style="width:${patriPct.toFixed(1)}%"></div>
            <div class="db-seg-late" style="width:${patriAtrPct.toFixed(1)}%"></div>
          </div>
          <div class="db-patri-status">
            ${patriAtrasados > 0
              ? `<span class="db-status-late">${patriAtrasados} em atraso &gt;7d</span>`
              : '<span class="db-status-ok">Tudo em dia ✓</span>'}
          </div>
          <div class="db-patri-detail">${patriTotal} patrimônios ativos</div>
        </div>

        <div class="db-mini-card">
          <div class="db-mini-eyebrow">Ordens de Serviço</div>
          <div class="db-os-nums">
            <div class="db-os-block">
              <div class="db-os-num ${osPendentes>0 ? 'is-amber' : ''}">${osPendentes}</div>
              <div class="db-os-label">Pendentes</div>
            </div>
            <div class="db-os-sep"></div>
            <div class="db-os-block">
              <div class="db-os-num ${osAtender>0 ? 'is-green' : ''}">${osAtender}</div>
              <div class="db-os-label">Conferência</div>
            </div>
            <div class="db-os-sep"></div>
            <div class="db-os-block">
              <div class="db-os-num">${osTotal}</div>
              <div class="db-os-label">Total</div>
            </div>
          </div>
          <a class="db-os-link" href="${buildPanelHref('os')}">Abrir módulo de OS →</a>
        </div>
      </div>
    </div>
  `;
}

function buildPanelHref(path = '') {
  const host = String(window.location.hostname || '').toLowerCase();
  if (host === 'grao1000.com.br' || host === 'www.grao1000.com.br') {
    return path ? `/painel/${path}`.replace(/([^:]\/)\/+/, '$1') : '/painel';
  }
  return toPanelUrl(path);
}

function renderStatCards(user, dept, totalLiberados) {
  const role   = user.role || 'Usuário';
  const sector = dept?.name || '—';
  const active = user.active !== false;

  return `
    <div class="stat-grid">
      <div class="stat-card">
        <div class="stat-icon green">${ICON_MODULES}</div>
        <div class="stat-body">
          <div class="stat-label">Módulos liberados</div>
          <div class="stat-value">${totalLiberados}</div>
          <span class="trend-badge up">↑ disponíveis</span>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon blue">${ICON_USER}</div>
        <div class="stat-body">
          <div class="stat-label">Perfil de acesso</div>
          <div class="stat-value" style="font-size:20px;letter-spacing:-.01em">${role}</div>
          <span class="trend-badge neutral">Autenticado</span>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon amber">${ICON_SECTOR}</div>
        <div class="stat-body">
          <div class="stat-label">Setor</div>
          <div class="stat-value" style="font-size:18px;letter-spacing:-.01em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${sector}</div>
          <span class="trend-badge neutral">Vínculo ativo</span>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon ${active ? 'green' : 'red'}">${ICON_STATUS}</div>
        <div class="stat-body">
          <div class="stat-label">Status</div>
          <div class="stat-value" style="font-size:20px">${active ? 'Ativo' : 'Inativo'}</div>
          <span class="trend-badge ${active ? 'up' : 'down'}">${active ? '● Online' : '● Offline'}</span>
        </div>
      </div>
    </div>
  `;
}

function renderQuickAccess(menuSections) {
  const items = menuSections.flatMap(s =>
    (s.items || []).map(item => ({ label: item.label, path: item.path, section: s.section }))
  ).slice(0, 12);

  if (!items.length) return '';

  return `
    <article class="card mt-16">
      <h3 style="margin:0 0 14px;font-size:16px">Acesso rápido</h3>
      <div class="quick-access-grid">
        ${items.map(i => `
          <a class="quick-access-item" href="${buildPanelHref(i.path)}">
            <span class="quick-access-dot"></span>
            <span>${i.label}</span>
          </a>
        `).join('')}
      </div>
    </article>
  `;
}

initProtectedPage('Dashboard', async (content, userContext) => {
  const menuSections   = buildAllowedMenu(userContext);
  const menuItems      = flattenAllowedMenu(userContext);
  const totalLiberados = menuItems.length;
  const showGestor     = isGestorOrMaster(userContext);

  const gestorPlaceholder = showGestor
    ? `<div id="dbGestorSection"><div class="db-loading">Carregando dashboard...</div></div>`
    : '';

  content.innerHTML = `
    ${gestorPlaceholder}

    ${renderStatCards(userContext.user, userContext.department, totalLiberados)}

    <section class="hero-card mt-16">
      <div>
        <div class="eyebrow">Painel corporativo</div>
        <h2>Bem-vindo, ${userContext.user.name}</h2>
        <p class="muted" style="margin:0;line-height:1.6;max-width:560px">
          Painel com autenticação real, sessão persistida, proteção de páginas,
          menu dinâmico por perfil e acesso seguro via Supabase Auth.
        </p>
      </div>
      <div class="hero-badge-wrap">
        <span class="hero-badge">
          ${userContext.user.is_master ? 'MASTER' : (userContext.user.role || 'USUÁRIO')}
        </span>
      </div>
    </section>

    ${renderQuickAccess(menuSections)}
  `;

  if (!showGestor) return;

  injectDashStyles();
  const gestorSection = document.getElementById('dbGestorSection');

  async function loadGestorData() {
    const btn = document.getElementById('dbRefreshBtn');
    if (btn) { btn.classList.add('loading'); btn.disabled = true; }

    const renderAndAnimate = (data) => {
      renderGestorDashboard(gestorSection, data);
      document.getElementById('dbRefreshBtn')?.addEventListener('click', loadGestorData);
      requestAnimationFrame(() => {
        const fillRect = gestorSection.querySelector('.db-state-fill-rect');
        if (fillRect) requestAnimationFrame(() => { fillRect.style.transform = 'scaleY(1)'; });
      });
    };

    try {
      const raw = localStorage.getItem(GESTOR_CACHE_KEY);
      if (raw) {
        const { ts, data } = JSON.parse(raw);
        if (Date.now() - ts < GESTOR_CACHE_TTL) {
          renderAndAnimate(data);
          const b = document.getElementById('dbRefreshBtn');
          if (b) { b.classList.remove('loading'); b.disabled = false; }
          fetchGestorData(userContext).then(fresh => {
            try { localStorage.setItem(GESTOR_CACHE_KEY, JSON.stringify({ ts: Date.now(), data: fresh })); } catch {}
            renderAndAnimate(fresh);
          }).catch(() => {});
          return;
        }
      }
    } catch {}

    try {
      const data = await fetchGestorData(userContext);
      try { localStorage.setItem(GESTOR_CACHE_KEY, JSON.stringify({ ts: Date.now(), data })); } catch {}
      renderAndAnimate(data);
    } catch (e) {
      gestorSection.innerHTML = `<div class="db-loading" style="color:#f87171">Erro ao carregar: ${esc(e?.message || 'Tente novamente.')}</div>`;
      console.error('dashboard gestor:', e);
    } finally {
      const b = document.getElementById('dbRefreshBtn');
      if (b) { b.classList.remove('loading'); b.disabled = false; }
    }
  }

  await loadGestorData();
});
