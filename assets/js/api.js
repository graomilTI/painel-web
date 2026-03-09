(function(global){
  const API = global.API || (global.API = {});
  function sessionToken(){ return (global.SESSION && global.SESSION.token && global.SESSION.token()) || localStorage.getItem('G1000_TOKEN') || localStorage.getItem('g1000_token') || ''; }
  function normalize(arg1,arg2){
    let endpoint='/api/exec', payload={};
    if(typeof arg1==='string' && arg1.startsWith('/')){ endpoint = arg1 === '/exec' ? '/api/exec' : (arg1.startsWith('/api') ? arg1 : '/api'+arg1); payload = (arg2 && typeof arg2==='object') ? {...arg2} : {}; }
    else if(typeof arg1==='string'){ payload = { action: arg1, ...((arg2 && typeof arg2==='object') ? arg2 : {}) }; }
    else if(arg1 && typeof arg1==='object'){ payload = {...arg1}; }
    if(!payload.token){ const t=sessionToken(); if(t) payload.token=t; }
    return {endpoint, payload};
  }
  async function request(endpoint, payload){
    const res = await fetch(endpoint, {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload), cache:'no-store'});
    const txt = await res.text();
    let data; try{ data = txt ? JSON.parse(txt) : {}; }catch(_){ data = { ok:false, error: txt || ('HTTP '+res.status) }; }
    if(!res.ok && data.ok === undefined) data.ok = false;
    if(data && data.ok === true && data.data !== undefined) return data.data;
    return data;
  }
  API.post = async function(arg1,arg2){ const {endpoint,payload}=normalize(arg1,arg2); return request(endpoint,payload); };
})(window);