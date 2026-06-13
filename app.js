const STORAGE_KEY = 'okozukai-pwa-v2';
const SETTINGS_KEY = 'okozukai-settings-v2';
const yen = new Intl.NumberFormat('ja-JP', { style: 'currency', currency: 'JPY', maximumFractionDigits: 0 });

const form = document.querySelector('#entryForm');
const dateInput = document.querySelector('#date');
const statusInput = document.querySelector('#status');
const amountInput = document.querySelector('#amount');
const categoryInput = document.querySelector('#category');
const memoInput = document.querySelector('#memo');
const remainingAmount = document.querySelector('#remainingAmount');
const remainingDays = document.querySelector('#remainingDays');
const unpaidTotal = document.querySelector('#unpaidTotal');
const periodLabel = document.querySelector('#periodLabel');
const categorySummary = document.querySelector('#categorySummary');
const entriesEl = document.querySelector('#entries');
const template = document.querySelector('#entryTemplate');
const exportCsv = document.querySelector('#exportCsv');
const mainPage = document.querySelector('#mainPage');
const settingsPage = document.querySelector('#settingsPage');
const settingsBtn = document.querySelector('#settingsBtn');
const backBtn = document.querySelector('#backBtn');
const settingsForm = document.querySelector('#settingsForm');
const baseAmountInput = document.querySelector('#baseAmount');
const adjustAmountInput = document.querySelector('#adjustAmount');
const periodInput = document.querySelector('#period');

dateInput.valueAsDate = new Date();
categoryInput.value = '未分類';
let entries = load(STORAGE_KEY, []);
let settings = load(SETTINGS_KEY, { baseAmount: 120000, adjustAmount: 0, period: currentHalf() });

function load(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; }
  catch { return fallback; }
}

function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

function currentHalf() {
  return new Date().getMonth() < 6 ? 'first' : 'second';
}

function periodRange(year = new Date().getFullYear()) {
  if (settings.period === 'first') {
    return { start: `${year}-01-01`, end: `${year}-06-30`, label: '1月1日〜6月30日' };
  }
  return { start: `${year}-07-01`, end: `${year}-12-31`, label: '7月1日〜12月31日' };
}

function inPeriod(dateString) {
  const { start, end } = periodRange();
  return dateString >= start && dateString <= end;
}

function daysLeft() {
  const today = new Date();
  const { end } = periodRange(today.getFullYear());
  const endDate = new Date(`${end}T23:59:59`);
  const diff = Math.ceil((endDate - today) / 86400000);
  return Math.max(0, diff);
}

function statusLabel(status) {
  return status === 'paid' ? '入金済み' : '未入金';
}

function renderSettingsForm() {
  baseAmountInput.value = settings.baseAmount;
  adjustAmountInput.value = settings.adjustAmount;
  periodInput.value = settings.period;
}

function render() {
  const currentEntries = entries.filter(e => inPeriod(e.date));
  const used = currentEntries.reduce((sum, e) => sum + Number(e.amount), 0);
  const unpaid = currentEntries.filter(e => e.status === 'unpaid').reduce((sum, e) => sum + Number(e.amount), 0);
  const remaining = Number(settings.baseAmount) - used + Number(settings.adjustAmount || 0);

  remainingAmount.textContent = yen.format(remaining);
  remainingDays.textContent = `${daysLeft()}日`;
  unpaidTotal.textContent = yen.format(unpaid);
  periodLabel.textContent = periodRange().label;

  const categoryTotals = new Map();
  for (const entry of currentEntries) {
    categoryTotals.set(entry.category, (categoryTotals.get(entry.category) ?? 0) + Number(entry.amount));
  }
  categorySummary.innerHTML = '';
  if (categoryTotals.size === 0) {
    categorySummary.innerHTML = '<p class="empty">この期間のデータはまだないです。</p>';
  } else {
    [...categoryTotals.entries()].sort((a, b) => b[1] - a[1]).forEach(([cat, total]) => {
      const row = document.createElement('div');
      row.className = 'summary-row';
      row.innerHTML = `<span>${cat}</span><strong>-${yen.format(total).replace('¥', '¥')}</strong>`;
      categorySummary.appendChild(row);
    });
  }

  entriesEl.innerHTML = '';
  const sorted = [...currentEntries].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);
  if (sorted.length === 0) {
    entriesEl.innerHTML = '<p class="empty">まだ履歴がありません。</p>';
    return;
  }
  for (const entry of sorted) {
    const node = template.content.cloneNode(true);
    node.querySelector('.entry-main').textContent = `${entry.category}${entry.memo ? ` / ${entry.memo}` : ''}`;
    node.querySelector('.entry-sub').textContent = `${entry.date}・${statusLabel(entry.status)}`;
    const amount = node.querySelector('.entry-amount');
    amount.textContent = `-${yen.format(entry.amount)}`;
    amount.classList.add(entry.status === 'paid' ? 'paid' : 'unpaid');
    const markPaidBtn = node.querySelector('.mark-paid');
    if (entry.status === 'unpaid') {
      markPaidBtn.addEventListener('click', () => {
        entries = entries.map(e => e.id === entry.id ? { ...e, status: 'paid', paidAt: Date.now() } : e);
        save();
        render();
      });
    } else {
      markPaidBtn.remove();
    }

    node.querySelector('.delete').addEventListener('click', () => {
      entries = entries.filter(e => e.id !== entry.id);
      save();
      render();
    });
    entriesEl.appendChild(node);
  }
}

form.addEventListener('submit', event => {
  event.preventDefault();
  const amount = Number(amountInput.value);
  if (!amount || amount < 1) return;
  entries.push({
    id: crypto.randomUUID(),
    date: dateInput.value,
    status: statusInput.value,
    amount,
    category: categoryInput.value,
    memo: memoInput.value.trim(),
    createdAt: Date.now()
  });
  save();
  form.reset();
  dateInput.valueAsDate = new Date();
  categoryInput.value = '未分類';
  render();
});

settingsForm.addEventListener('submit', event => {
  event.preventDefault();
  settings = {
    baseAmount: Number(baseAmountInput.value || 0),
    adjustAmount: Number(adjustAmountInput.value || 0),
    period: periodInput.value
  };
  save();
  showMain();
  render();
});

function showSettings() {
  renderSettingsForm();
  mainPage.classList.add('hidden');
  settingsPage.classList.remove('hidden');
}

function showMain() {
  settingsPage.classList.add('hidden');
  mainPage.classList.remove('hidden');
}

settingsBtn.addEventListener('click', showSettings);
backBtn.addEventListener('click', showMain);

exportCsv.addEventListener('click', () => {
  const rows = [['date', 'status', 'amount', 'category', 'memo']].concat(
    entries.map(e => [e.date, statusLabel(e.status), e.amount, e.category, e.memo])
  );
  const csv = rows.map(row => row.map(cell => `"${String(cell).replaceAll('"', '""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'okozukai.csv';
  a.click();
  URL.revokeObjectURL(url);
});

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js'));
}

render();
