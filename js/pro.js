// Vigil Pro: one durable Microsoft Store add-on that unlocks everything.
// Purchases go through the Store's own payment sheet (Digital Goods API + Payment Request API),
// which only exists when Vigil was installed from the Microsoft Store. In a plain browser,
// Pro stays locked and the upgrade sheet points to the Store page instead.

const BILLING = 'https://store.microsoft.com/billing';
// The add-on's Store ID and its product ID; the Store may report either one as itemId.
// Add-on created in Partner Center 18 Nov 2026 (Durable, product ID vigil_pro).
export const PRO_IDS = ['9N98KR6DL8MN', 'vigil_pro'];
export const STORE_URL = 'https://apps.microsoft.com/detail/9NML53PF62C8';
const CACHE = 'vigil.pro';

export const FREE_FACES = ['stacked', 'classic', 'analog'];
export const FREE_FONTS = ['system'];
export const FREE_MODES = ['always'];

const listeners = new Set();
export const pro = {
  owned: false,       // unlocked right now
  available: false,   // the Store billing service is reachable (Store install)
  ready: false,       // the Store knows the Pro add-on (it can be bought right now)
  price: '$2.99',
  busy: false,
  onChange(fn) { listeners.add(fn); },
};
const emit = () => listeners.forEach(fn => { try { fn(pro); } catch { /* */ } });

let service = null;
const mock = /^(localhost|127\.0\.0\.1)$/.test(location.hostname) && new URLSearchParams(location.search).get('pro');

function setOwned(v) {
  if (pro.owned === v) return;
  pro.owned = v;
  try { v ? localStorage.setItem(CACHE, '1') : localStorage.removeItem(CACHE); } catch { /* */ }
  emit();
}

async function getService() {
  if (service) return service;
  if (mock) return (service = mockService(mock));
  if (typeof window.getDigitalGoodsService !== 'function') return null;
  try { service = await window.getDigitalGoodsService(BILLING); } catch { service = null; }
  return service;
}

async function refreshOwnership() {
  const s = await getService();
  if (!s) return false;
  const list = await s.listPurchases();
  setOwned(list.some(p => PRO_IDS.includes(p.itemId)));
  return true;
}

export async function initPro() {
  const s = await getService();
  pro.available = !!s;
  // A Store install remembers Pro so it unlocks offline; a plain browser never trusts the cache.
  let cached = false; try { cached = localStorage.getItem(CACHE) === '1'; } catch { /* */ }
  if (s && cached) { pro.owned = true; }
  emit();
  if (!s) return;
  try {
    const details = await s.getDetails(PRO_IDS);
    const d = details?.[0];
    pro.ready = !!d;
    if (d?.price) pro.price = new Intl.NumberFormat(undefined, { style: 'currency', currency: d.price.currency }).format(+d.price.value);
  } catch { /* keep the default price label */ }
  try { await refreshOwnership(); } catch { /* offline: keep the cached answer */ }
  emit();
}

/** Opens the Store purchase sheet. Resolves to 'owned', 'cancelled', 'unavailable' or 'error'. */
export async function buyPro() {
  const s = await getService();
  if (!s) return 'unavailable';
  pro.busy = true; emit();
  try {
    const itemId = PRO_IDS[0];
    const req = mock ? s.paymentRequest(itemId) : new PaymentRequest([{ supportedMethods: BILLING, data: { itemId } }], { total: { label: 'Total', amount: { currency: 'USD', value: '0' } } });
    const res = await req.show();
    try { await res.complete('success'); } catch { /* some hosts complete for us */ }
    try { await refreshOwnership(); } catch { setOwned(true); }
    if (!pro.owned) setOwned(true); // the sheet returned a purchase: trust it until the next check
    return 'owned';
  } catch (e) {
    return e && (e.name === 'AbortError' || /cancel/i.test(e.message || '')) ? 'cancelled' : 'error';
  } finally { pro.busy = false; emit(); }
}

/** Re-checks the Store for an earlier purchase. Resolves to true if Pro is owned. */
export async function restorePro() {
  pro.busy = true; emit();
  try { await refreshOwnership(); } catch { /* */ }
  pro.busy = false; emit();
  return pro.owned;
}

// Local test double: ?pro=store (not owned), ?pro=owned, ?pro=cancel, ?pro=soon (add-on not live yet); no ?pro = plain browser.
function mockService(kind) {
  let owned = kind === 'owned';
  return {
    async getDetails() { return kind === 'soon' ? [] : [{ itemId: PRO_IDS[0], title: 'Vigil Pro', price: { currency: 'USD', value: '2.99' } }]; },
    async listPurchases() { return owned ? [{ itemId: PRO_IDS[0], purchaseToken: 'mock' }] : []; },
    paymentRequest() {
      return { async show() { if (kind === 'cancel') { const e = new Error('cancelled'); e.name = 'AbortError'; throw e; } owned = true; return { complete: async () => {} }; } };
    },
  };
}
