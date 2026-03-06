(function(){
  const BASE = "/api";
  function getToken(){ return localStorage.getItem("G1000_TOKEN") || ""; }

  async function request(path, opts={}){
    const headers = new Headers(opts.headers || {});
    const token = getToken();
    if(token) headers.set("Authorization", "Bearer " + token);
    if(!headers.has("Content-Type") && opts.body && typeof opts.body === "string") headers.set("Content-Type","application/json");

    const res = await fetch(BASE + path, { ...opts, headers });
    const ct = res.headers.get("content-type") || "";
    const text = await res.text();
    let data = text;
    if(ct.includes("application/json")){
      try{ data = JSON.parse(text || "{}"); }catch(_){ data = { ok:false, error:"JSON inválido", raw:text }; }
    }
    if(!res.ok){
      const msg = (data && data.error) ? data.error : ("HTTP " + res.status);
      throw new Error(msg);
    }
    return data;
  }

  window.API = {
    request,
    get: (path) => request(path, { method:"GET" }),
    post: (path, bodyObj) => request(path, { method:"POST", body: JSON.stringify(bodyObj || {}) }),
    put: (path, bodyObj) => request(path, { method:"PUT", body: JSON.stringify(bodyObj || {}) }),
  };
})();
