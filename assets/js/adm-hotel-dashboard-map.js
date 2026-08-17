const MAP_VERSION = '20260817-real-map1';

const STATE_CENTERS = {
  AC:[78,278], AL:[505,300], AP:[327,111], AM:[151,219], BA:[421,343], CE:[468,219],
  DF:[342,360], ES:[448,423], GO:[326,365], MA:[390,225], MT:[249,334], MS:[245,417],
  MG:[374,414], PA:[286,191], PB:[520,252], PR:[318,506], PE:[505,276], PI:[411,278],
  RJ:[405,460], RN:[518,226], RS:[292,562], RO:[143,302], RR:[177,111], SC:[321,535],
  SP:[334,456], SE:[493,321], TO:[307,295]
};

const BRAZIL_OUTLINE = 'M174 58 C194 51 216 55 232 65 L255 54 L283 62 L303 83 L331 86 L353 101 L389 106 L410 126 L443 133 L470 151 L503 165 L527 188 L548 211 L542 238 L527 259 L520 286 L506 308 L498 338 L479 365 L474 399 L452 426 L439 458 L410 475 L392 500 L366 519 L347 547 L326 571 L296 588 L274 573 L255 546 L243 516 L219 502 L204 478 L175 458 L154 432 L126 414 L112 389 L84 376 L64 352 L43 337 L55 309 L44 282 L59 255 L78 239 L84 207 L104 190 L107 160 L128 144 L131 111 L149 93 L154 70 Z';

const REGION_GUIDES = [
  'M131 112 C170 133 190 160 210 196 C235 218 267 219 303 205',
  'M84 208 C123 223 155 248 184 279 C205 301 229 320 250 334',
  'M213 196 C203 248 215 294 249 334 C270 349 292 355 326 365',
  'M303 205 C325 229 330 262 307 295 C315 323 323 342 326 365',
  'M303 205 C342 206 366 213 390 225 C395 245 402 262 411 278',
  'M390 225 C423 230 447 228 468 219 C484 233 496 247 505 276',
  'M411 278 C421 300 424 319 421 343 C404 365 391 392 374 414',
  'M307 295 C333 314 350 334 342 360 C353 378 365 395 374 414',
  'M249 334 C276 346 300 357 326 365 C309 389 282 405 245 417',
  'M326 365 C334 391 344 415 334 456 C355 451 377 450 405 460',
  'M374 414 C395 419 420 423 448 423 C437 440 422 452 405 460',
  'M245 417 C272 431 302 444 334 456 C326 475 320 491 318 506',
  'M318 506 C320 517 322 527 321 535 C311 545 302 554 292 562'
];

function injectStyles(){
  if(document.getElementById('hospRdRealMapStyle')) return;
  const style=document.createElement('style');
  style.id='hospRdRealMapStyle';
  style.textContent=`
    .hosp-rd-map-shell.hosp-rd-map-shell--real{height:366px;min-height:366px;display:grid;place-items:center;overflow:visible;padding:0 8px 2px}
    .hosp-rd-real-map{width:100%;height:100%;display:grid;place-items:center;position:relative}
    .hosp-rd-real-map svg{width:min(100%,690px);height:100%;max-height:360px;overflow:visible;filter:drop-shadow(0 18px 36px rgba(0,0,0,.24))}
    .hosp-rd-map-country{fill:url(#hospRdMapFill);stroke:rgba(94,234,142,.34);stroke-width:2.1;vector-effect:non-scaling-stroke}
    .hosp-rd-map-country-glow{fill:none;stroke:rgba(74,222,128,.08);stroke-width:12;vector-effect:non-scaling-stroke;filter:url(#hospRdMapGlow)}
    .hosp-rd-map-guide{fill:none;stroke:rgba(132,196,154,.14);stroke-width:1.1;stroke-linecap:round;stroke-linejoin:round;vector-effect:non-scaling-stroke;pointer-events:none}
    .hosp-rd-map-state{cursor:default;outline:none}
    .hosp-rd-map-state .hosp-rd-map-dot{fill:rgba(14,55,39,.92);stroke:rgba(129,191,150,.20);stroke-width:1.1;vector-effect:non-scaling-stroke;transition:.16s ease}
    .hosp-rd-map-state .hosp-rd-map-uf{fill:#708e80;font-size:9px;font-weight:900;letter-spacing:.02em;text-anchor:middle;pointer-events:none;transition:.16s ease}
    .hosp-rd-map-state.has-data .hosp-rd-map-dot{fill:var(--state-fill,#1d6a3b);stroke:rgba(159,245,188,.52);stroke-width:1.5;filter:drop-shadow(0 4px 7px rgba(0,0,0,.28));cursor:pointer}
    .hosp-rd-map-state.has-data .hosp-rd-map-uf{fill:#eefff4;font-size:9.5px}
    .hosp-rd-map-state .hosp-rd-map-value{fill:#d7ffe4;font-size:8px;font-weight:950;text-anchor:middle;pointer-events:none}
    .hosp-rd-map-state.has-data:hover .hosp-rd-map-dot,.hosp-rd-map-state.has-data:focus .hosp-rd-map-dot{stroke:#9af5b9;stroke-width:2.1;filter:drop-shadow(0 6px 10px rgba(34,197,94,.28));transform:scale(1.12);transform-box:fill-box;transform-origin:center}
    .hosp-rd-map-state.has-data:hover .hosp-rd-map-uf,.hosp-rd-map-state.has-data:focus .hosp-rd-map-uf{fill:#fff}
    .hosp-rd-map-legend{position:absolute;left:14px;bottom:3px;display:flex;align-items:center;gap:8px;color:#6f9181;font-size:8.5px;pointer-events:none}
    .hosp-rd-map-legend-bar{width:78px;height:6px;border-radius:999px;background:linear-gradient(90deg,#123d2b,#1d6b3e,#39bd62);box-shadow:inset 0 0 0 1px rgba(255,255,255,.04)}
    @media(max-width:1100px){.hosp-rd-map-shell.hosp-rd-map-shell--real{height:385px;min-height:385px}.hosp-rd-real-map svg{max-height:378px}}
    @media(max-width:720px){.hosp-rd-map-shell.hosp-rd-map-shell--real{height:330px;min-height:330px;padding:0}.hosp-rd-real-map svg{max-height:325px}.hosp-rd-map-state .hosp-rd-map-uf{font-size:8px}.hosp-rd-map-state.has-data .hosp-rd-map-uf{font-size:8.5px}.hosp-rd-map-legend{display:none}}
  `;
  document.head.appendChild(style);
}

function readCounts(grid){
  const counts={};
  grid.querySelectorAll('.hosp-rd-state').forEach((node)=>{
    const uf=(node.querySelector('b')?.textContent||'').trim().toUpperCase();
    if(!uf) return;
    counts[uf]=Number((node.querySelector('em')?.textContent||'0').replace(/[^0-9.-]/g,''))||0;
  });
  return counts;
}

function stateColor(value,max){
  if(!value) return '#123126';
  const ratio=value/Math.max(1,max);
  if(ratio<=.2) return '#17482f';
  if(ratio<=.4) return '#1b6038';
  if(ratio<=.6) return '#217846';
  if(ratio<=.8) return '#2a9752';
  return '#39bd62';
}

function renderRealMap(grid){
  const shell=grid.closest('.hosp-rd-map-shell');
  if(!shell||shell.querySelector('.hosp-rd-real-map')) return;
  const counts=readCounts(grid);
  const max=Math.max(1,...Object.values(counts));
  const states=Object.entries(STATE_CENTERS).map(([uf,[x,y]])=>{
    const value=Number(counts[uf]||0);
    const level=value?Math.max(1,Math.ceil((value/max)*5)):0;
    const radius=value?11+level*1.2:7.2;
    const fill=stateColor(value,max);
    const valueY=y+2.7;
    const ufY=value?y-radius-4:y+3;
    return `<g class="hosp-rd-map-state${value?' has-data':''}" data-uf="${uf}" ${value?'tabindex="0"':''} style="--state-fill:${fill}"><title>${uf}: ${value} hospedado${value===1?'':'s'}</title><circle class="hosp-rd-map-dot" cx="${x}" cy="${y}" r="${radius}"/><text class="hosp-rd-map-uf" x="${x}" y="${ufY}">${uf}</text>${value?`<text class="hosp-rd-map-value" x="${x}" y="${valueY}">${value}</text>`:''}</g>`;
  }).join('');
  const guides=REGION_GUIDES.map((d)=>`<path class="hosp-rd-map-guide" d="${d}"/>`).join('');
  shell.classList.add('hosp-rd-map-shell--real');
  shell.innerHTML=`<div class="hosp-rd-real-map" data-version="${MAP_VERSION}"><svg viewBox="0 0 590 620" role="img" aria-label="Mapa do Brasil com distribuição de colaboradores hospedados por estado"><defs><linearGradient id="hospRdMapFill" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0b2b20"/><stop offset=".52" stop-color="#071f17"/><stop offset="1" stop-color="#051710"/></linearGradient><filter id="hospRdMapGlow" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="5"/></filter></defs><path class="hosp-rd-map-country-glow" d="${BRAZIL_OUTLINE}"/><path class="hosp-rd-map-country" d="${BRAZIL_OUTLINE}"/>${guides}${states}</svg><div class="hosp-rd-map-legend"><span>menor</span><span class="hosp-rd-map-legend-bar"></span><span>maior concentração</span></div></div>`;
}

function upgradeDashboardMap(){
  injectStyles();
  const panel=document.querySelector('#hospRdDashboard');
  if(!panel) return;
  const grid=panel.querySelector('.hosp-rd-map-grid');
  if(grid) renderRealMap(grid);
}

let queued=false;
function queueUpgrade(){
  if(queued) return;
  queued=true;
  requestAnimationFrame(()=>{queued=false;upgradeDashboardMap();});
}

const observer=new MutationObserver(queueUpgrade);
observer.observe(document.documentElement,{childList:true,subtree:true});
window.addEventListener('hashchange',queueUpgrade);
document.addEventListener('DOMContentLoaded',queueUpgrade,{once:true});
queueUpgrade();
