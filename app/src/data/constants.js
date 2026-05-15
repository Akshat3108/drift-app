export const CURRENCIES = {
  USD: { symbol: '$' },
  EUR: { symbol: '€' },
  GBP: { symbol: '£' },
  INR: { symbol: '₹' },
  JPY: { symbol: '¥' },
};

export const DEFAULT_POTS = [
  { key: 'food',  label: 'Food & Drink',  emoji: '🍴', spend: 412.30, budget: 600,  color: 'cream' },
  { key: 'groc',  label: 'Groceries',     emoji: '🥬', spend: 287.45, budget: 400,  color: 'mint'  },
  { key: 'tran',  label: 'Transport',     emoji: '🚲', spend: 168.20, budget: 250,  color: 'sky'   },
  { key: 'fun',   label: 'Fun',           emoji: '🎬', spend: 342.10, budget: 300,  color: 'blush' },
  { key: 'heal',  label: 'Health',        emoji: '💊', spend: 215.00, budget: 250,  color: 'mint'  },
  { key: 'bill',  label: 'Bills',         emoji: '🧾', spend: 480.00, budget: 500,  color: 'butter'},
  { key: 'subs',  label: 'Subscriptions', emoji: '📺', spend: 198.96, budget: 200,  color: 'lilac' },
];

export const DEFAULT_EXPENSES = [
  { id: 1, merchant: 'Blue Bottle Coffee', cat: 'Food & Drink', icon: '☕', amount: 6.25,   time: 'Today · 8:42 AM',  mood: '😌', carbon: 0.4,  potKey: 'food' },
  { id: 2, merchant: 'Whole Foods Market', cat: 'Groceries',    icon: '🥬', amount: 84.30,  time: 'Today · 7:15 PM',  mood: '😐', carbon: 3.2,  potKey: 'groc' },
  { id: 3, merchant: 'Uber',               cat: 'Transport',    icon: '🚗', amount: 18.40,  time: 'Yesterday',        mood: '😕', carbon: 2.1,  potKey: 'tran' },
  { id: 4, merchant: 'Netflix',            cat: 'Subscriptions',icon: '📺', amount: 15.99,  time: 'Yesterday',        mood: '😊', carbon: 0.1,  potKey: 'subs', recurring: true },
  { id: 5, merchant: "Trader Joe's",       cat: 'Groceries',    icon: '🛒', amount: 42.18,  time: 'Mon, Apr 28',      mood: '😌', carbon: 1.8,  potKey: 'groc' },
];

export const DEFAULT_SUBS = [
  { id: 1, name: 'Netflix',  amount: 15.99,  period: 'mo', used: 'Daily',      verdict: 'keep',   icon: '📺', color: '#e50914' },
  { id: 2, name: 'Spotify',  amount: 10.99,  period: 'mo', used: 'Daily',      verdict: 'keep',   icon: '🎧', color: '#1db954' },
  { id: 3, name: 'NYT',      amount: 17.00,  period: 'mo', used: '2× last mo', verdict: 'review', icon: '📰', color: '#333'    },
  { id: 4, name: 'Equinox',  amount: 215.00, period: 'mo', used: '3× last mo', verdict: 'review', icon: '🏋', color: '#222'    },
  { id: 5, name: 'Masterclass',amount:16.00, period: 'mo', used: '0× in 90d',  verdict: 'cancel', icon: '🎓', color: '#d9272e' },
  { id: 6, name: 'Headspace',amount: 12.99,  period: 'mo', used: '0× in 60d',  verdict: 'cancel', icon: '🧘', color: '#f47d31' },
];

export const DEFAULT_GOALS = [
  { id: 1, name: 'Japan trip',     emoji: '✈️', have: 1240, need: 3000, eta: 'Aug 2026' },
  { id: 2, name: 'Emergency fund', emoji: '🛟', have: 4600, need: 5000, eta: 'Jun 2026' },
  { id: 3, name: 'New laptop',     emoji: '💻', have: 520,  need: 2200, eta: 'Sep 2026' },
];
