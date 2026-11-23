// Open Food Facts: free, open product database (https://world.openfoodfacts.org).
import { getClient } from './sync.js';

const FIELDS = 'code,product_name,product_name_en,product_name_fr,brands,nutriments,serving_quantity,serving_size';

function toFood(p) {
  const n = p.nutriments || {};
  let kcal = n['energy-kcal_100g'];
  if (kcal == null && n['energy_100g'] != null) kcal = n['energy_100g'] / 4.184; // kJ -> kcal
  const name = p.product_name || p.product_name_en || p.product_name_fr || '';
  if (!name || kcal == null) return null;
  const brands = Array.isArray(p.brands) ? p.brands.join(', ') : p.brands || '';
  const sq = parseFloat(p.serving_quantity);
  return {
    name: name.trim(),
    brand: brands.split(',')[0].trim(),
    kcal: Math.round(+kcal),
    p: +(+n.proteins_100g || 0).toFixed(1),
    c: +(+n.carbohydrates_100g || 0).toFixed(1),
    f: +(+n.fat_100g || 0).toFixed(1),
    serving: sq > 0 ? Math.round(sq) : null,
    servingLabel: sq > 0 ? p.serving_size || '1 serving' : '',
    barcode: p.code || '',
    source: 'off',
  };
}

async function getJson(url, tries = 2) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url);
      if (r.ok) return await r.json();
      lastErr = new Error('HTTP ' + r.status);
    } catch (e) {
      lastErr = e;
    }
    await new Promise((res) => setTimeout(res, 1200));
  }
  throw lastErr;
}

export async function searchOFF(query) {
  // 1) Preferred: our Supabase Edge Function relaying to the fast search.openfoodfacts.org API
  //    (that API doesn't allow direct browser calls). Optional; skipped if not deployed.
  try {
    const c = await getClient();
    if (c && (await c.auth.getSession()).data.session) {
      const { data, error } = await c.functions.invoke('off-search', { body: { q: query } });
      if (!error && Array.isArray(data?.hits)) return data.hits.map(toFood).filter(Boolean);
    }
  } catch {}
  // 2) Fallback: legacy endpoint (browser-friendly but sometimes overloaded) with retries.
  const url =
    'https://world.openfoodfacts.org/cgi/search.pl?search_simple=1&action=process&json=1&page_size=25' +
    '&sort_by=unique_scans_n&fields=' + FIELDS + '&search_terms=' + encodeURIComponent(query);
  const data = await getJson(url, 4);
  return (data.products || []).map(toFood).filter(Boolean);
}

export async function lookupBarcode(code) {
  const data = await getJson(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json?fields=${FIELDS}`);
  if (data.status !== 1 || !data.product) return null;
  return toFood({ ...data.product, code });
}
