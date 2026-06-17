const URL = 'https://xyzpnuumdqhegxakkyws.supabase.co/functions/v1/geocode-colaboradores';
const KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh5enBudXVtZHFoZWd4YWtreXdzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ1NTU0MjksImV4cCI6MjA5MDEzMTQyOX0.YZzT6-GyRkEPZ386qs3n1MIieAK-BecfUpFMzL85oAs';

let totalOk = 0, totalErro = 0, totalProcessados = 0;

for (let i = 1; i <= 15; i++) {
  const res = await fetch(URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}` },
    body: JSON.stringify({ limite: 30 }),
  });
  const data = await res.json();
  console.log(`Lote ${i}:`, JSON.stringify(data));

  if (data.error) { console.error('ERRO:', data.error); break; }

  totalOk += data.ok || 0;
  totalErro += data.erro || 0;
  totalProcessados += data.processados || 0;

  if (!data.processados || data.restantes === 0) {
    console.log('Concluído.');
    break;
  }
}

console.log(`TOTAL: processados=${totalProcessados} ok=${totalOk} erro=${totalErro}`);
