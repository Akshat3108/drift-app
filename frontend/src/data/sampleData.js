export const USER = { name: 'Riya', avatar: 'R' };

export const DEFAULT_POTS = [
  { key: 'food',  label: 'Food & Drink',  emoji: '🍴', spend: 412.30, budget: 600,  color: 'cream' },
  { key: 'groc',  label: 'Groceries',     emoji: '🥬', spend: 287.45, budget: 400,  color: 'mint' },
  { key: 'tran',  label: 'Transport',     emoji: '🚲', spend: 168.20, budget: 250,  color: 'sky' },
  { key: 'fun',   label: 'Fun',           emoji: '🎬', spend: 342.10, budget: 300,  color: 'blush' },
  { key: 'heal',  label: 'Health',        emoji: '💊', spend: 215.00, budget: 250,  color: 'mint' },
  { key: 'bill',  label: 'Bills',         emoji: '🧾', spend: 480.00, budget: 500,  color: 'butter' },
  { key: 'subs',  label: 'Subscriptions', emoji: '📺', spend: 198.96, budget: 200,  color: 'lilac' },
];

export const DEFAULT_EXPENSES = [
  { id: 1, merchant: 'Blue Bottle Coffee', cat: 'Food & Drink', icon: '☕', amount: 6.25,   time: 'Today · 8:42 AM',  mood: '😌', carbon: 0.4,  potKey: 'food' },
  { id: 2, merchant: 'Whole Foods Market', cat: 'Groceries',    icon: '🥬', amount: 84.30,  time: 'Today · 7:15 PM',  mood: '😐', carbon: 3.2,  potKey: 'groc' },
  { id: 3, merchant: 'Uber',               cat: 'Transport',    icon: '🚗', amount: 18.40,  time: 'Yesterday',        mood: '😕', carbon: 2.1,  potKey: 'tran' },
  { id: 4, merchant: 'Netflix',            cat: 'Subscriptions',icon: '📺', amount: 15.99,  time: 'Yesterday',        mood: '😊', carbon: 0.1,  potKey: 'subs', recurring: true },
  { id: 5, merchant: "Trader Joe's",       cat: 'Groceries',    icon: '🛒', amount: 42.18,  time: 'Mon, Apr 28',      mood: '😌', carbon: 1.8,  potKey: 'groc' },
  { id: 6, merchant: 'Equinox',            cat: 'Health',       icon: '🏋', amount: 215.00, time: 'Mon, Apr 28',      mood: '😊', carbon: 0.2,  potKey: 'heal', recurring: true },
  { id: 7, merchant: 'Amazon',             cat: 'Shopping',     icon: '📦', amount: 67.42,  time: 'Sun, Apr 27',      mood: '😬', carbon: 4.1,  potKey: 'fun' },
];

export const DEFAULT_SUBS = [
  { name: 'Netflix',       amount: 15.99,  period: 'mo', used: 'Daily',      verdict: 'keep',   icon: '📺', color: '#e50914' },
  { name: 'Spotify',       amount: 10.99,  period: 'mo', used: 'Daily',      verdict: 'keep',   icon: '🎧', color: '#1db954' },
  { name: 'NYT',           amount: 17.00,  period: 'mo', used: '2× last mo', verdict: 'review', icon: '📰', color: '#000' },
  { name: 'Equinox',       amount: 215.00, period: 'mo', used: '3× last mo', verdict: 'review', icon: '🏋',  color: '#222' },
  { name: 'iCloud+ 200GB', amount: 2.99,   period: 'mo', used: 'Always',     verdict: 'keep',   icon: '☁️', color: '#0a84ff' },
  { name: 'Masterclass',   amount: 16.00,  period: 'mo', used: '0× in 90d',  verdict: 'cancel', icon: '🎓', color: '#d9272e' },
  { name: 'Adobe CC',      amount: 59.99,  period: 'mo', used: 'Weekly',     verdict: 'keep',   icon: '🅰️', color: '#fa0f00' },
  { name: 'Headspace',     amount: 12.99,  period: 'mo', used: '0× in 60d',  verdict: 'cancel', icon: '🧘', color: '#f47d31' },
];

export const DEFAULT_GOALS = [
  { id: 1, name: 'Japan trip',     emoji: '✈️', have: 1240, need: 3000, eta: 'Aug 2026' },
  { id: 2, name: 'Emergency fund', emoji: '🛟', have: 4600, need: 5000, eta: 'Jun 2026' },
  { id: 3, name: 'New laptop',     emoji: '💻', have: 520,  need: 2200, eta: 'Sep 2026' },
];

export const RECEIPT_ITEMS = [
  { id: 1, name: 'Organic Bananas',   qty: '2 lb',    price: 1.58,  icon: '🍌' },
  { id: 2, name: 'Oat Milk · Oatly',  qty: '64 oz',   price: 5.99,  icon: '🥛' },
  { id: 3, name: 'Sourdough Loaf',    qty: '1',       price: 6.50,  icon: '🍞' },
  { id: 4, name: 'Avocados (Hass)',   qty: '4',       price: 5.96,  icon: '🥑' },
  { id: 5, name: 'Wild Salmon Fillet',qty: '0.8 lb',  price: 18.40, icon: '🐟' },
  { id: 6, name: 'Lacinato Kale',     qty: '1 bunch', price: 2.99,  icon: '🥬' },
  { id: 7, name: 'Aged Cheddar',      qty: '8 oz',    price: 7.49,  icon: '🧀' },
  { id: 8, name: 'Sparkling Water',   qty: '12 pk',   price: 6.99,  icon: '💧' },
];

export const MONTH_TREND = [
  { m: 'Nov', v: 1820 }, { m: 'Dec', v: 2340 }, { m: 'Jan', v: 1690 },
  { m: 'Feb', v: 1980 }, { m: 'Mar', v: 2210 }, { m: 'Apr', v: 2104 },
];

export function genHeatmap() {
  const out = [];
  for (let i = 0; i < 35; i++) {
    const x = Math.sin(i * 13.37) * 10000;
    const r = x - Math.floor(x);
    out.push({ amount: Math.floor(r * 220) });
  }
  [3, 8, 16, 22, 27].forEach(i => { out[i].amount = 0; });
  return out;
}

export const HEATMAP = genHeatmap();

export const NET_WORTH = {
  assets: [
    { label: 'Checking',    amount: 4820 },
    { label: 'Savings',     amount: 12400 },
    { label: 'Investments', amount: 21200 },
  ],
  liabilities: [
    { label: 'Credit card', amount: 840 },
    { label: 'Student loan',amount: 8200 },
  ],
  trend: [28000, 30200, 31800, 33400, 35100, 38400],
};
