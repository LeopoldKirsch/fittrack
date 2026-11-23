// Supabase Edge Function "off-search": relays food searches to search.openfoodfacts.org,
// which is fast and reliable but doesn't allow direct calls from a browser (no CORS).
// Deploy: Supabase dashboard → Edge Functions → Deploy a new function → Via Editor,
// name it exactly  off-search , paste this file, Deploy.

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const FIELDS = 'code,product_name,product_name_en,product_name_fr,brands,nutriments,serving_quantity,serving_size';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

  const { q } = await req.json().catch(() => ({ q: '' }));
  if (typeof q !== 'string' || !q.trim() || q.length > 100) return json({ error: 'bad query' }, 400);

  const url = `https://search.openfoodfacts.org/search?page_size=25&fields=${FIELDS}&q=${encodeURIComponent(q.trim())}`;
  try {
    const r = await fetch(url, { headers: { 'User-Agent': 'FitTrack/1.0 (personal fitness app)' } });
    if (!r.ok) return json({ error: `upstream ${r.status}` }, 502);
    const data = await r.json();
    return json({ hits: data.hits ?? [] });
  } catch (e) {
    return json({ error: String(e) }, 502);
  }
});
