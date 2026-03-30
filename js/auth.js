import { createClient } from "https://esm.sh/@supabase/supabase-js";

const supabase = createClient(
  "https://xyzpnuumdqhegxakkyws.supabase.co",
  "sb_publishable_YDjKfceWqANbNVMaHte2Kw_Dy4_i471"
);

async function proteger() {
  const path = window.location.pathname;

  if (path.includes("login")) return;

  const { data } = await supabase.auth.getSession();

  if (!data.session) {
    window.location.href = "/painel/login.html";
    return;
  }

  localStorage.setItem("last_page", path);
}

supabase.auth.onAuthStateChange((event, session) => {
  if (!session) {
    window.location.href = "/painel/login.html";
  }
});

proteger();

export { supabase };
