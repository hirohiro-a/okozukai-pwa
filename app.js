const STORAGE_KEY = 'okozukai-pwa-v2';
const SETTINGS_KEY = 'okozukai-settings-v2';

const CATEGORIES = ['プライベート', '財布に移動', '宿泊費', '会社関係', 'その他'];
const FILTER_CATEGORIES = ['未分類', ...CATEGORIES];

const yen = new Intl.NumberFormat('ja-JP', {
  style: 'currency',
  currency: 'JPY',
  maximumFractionDigits: 0
});

const form = document.querySelector('#entryForm');
const dateInput = document.querySelector('#date');
const statusInput = document.querySelector('#status');
const amountInput = document.querySelector('#amount');
const memoInput = document.querySelector('#memo');
const entryCategoriesEl = document.querySelector('#entryCategories');

const remainingAmount = document.querySelector('#remainingAmount');
const remainingDays = document.querySelector('#remainingDays');
const unpaidTotal = document.querySelector('#unpaidTotal');
const periodLabel = document.querySelector('#periodLabel');
const categorySummary = document.querySelector('#categorySummary');
const entriesEl = document.querySelector('#entries');
const template = document.querySelector('#entryTemplate');

const filterEnabled = document.querySelector('#filterEnabled');
const filterCategoriesEl = document.querySelector('#filterCategories');
const clearFilterBtn = document.querySelector('#clearFilter');

const exportCsv = document.querySelector('#exportCsv');
const exportBackup = document.querySelector('#exportBackup');
const importBackupBtn = document.querySelector('#importBackupBtn');
const importBackupFile = document.querySelector('#importBackupFile');

const mainPage = document.querySelector('#mainPage');
const settingsPage = document.querySelector('#settingsPage');
const settingsBtn = document.querySelector('#settingsBtn');
const backBtn = document.querySelector('#backBtn');
const settingsForm = document.querySelector('#settingsForm');
const baseAmountInput = document.querySelector('#baseAmount');
const adjustAmountInput = document.querySelector('#adjustAmount');
const periodInput = document.querySelector('#period');

const editModal = document.querySelector('#editModal');
const editForm = document.querySelector('#editForm');
const editIdInput = document.querySelector('#editId');
const editDateInput = document.querySelector('#editDate');
const editStatusInput = document.querySelector('#editStatus');
const editAmountInput = document.querySelector('#editAmount');
const editMemoInput = document.querySelector('#editMemo');
const editCategoriesEl = document.querySelector('#editCategories');
const editCancelBtn = document.querySelector('#editCancel');
const editCancelTopBtn = document.querySelector('#editCancelTop');

dateInput.valueAsDate = new Date();

let entries = load(STORAGE_KEY, []);
let settings = load(SETTINGS_KEY, {
  baseAmount: 120000,
  adjustAmount: 0,
  period: currentHalf()
});

function load(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
}

function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

function currentHalf() {
  return new Date().getMonth() < 6 ? 'first' : 'second';
}

function makeId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function positiveAmount(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.abs(number) : 0;
}

function normalizeCategories(rawCategories, legacyCategory) {
  let source = [];

  if (Array.isArray(rawCategories)) {
    source = rawCategories;
  } else if (typeof legacyCategory === 'string' && legacyCategory.trim()) {
    source = [legacyCategory.trim()];
  }

  const normalized = [...new Set(source)]
    .filter(category => category === '未分類' || CATEGORIES.includes(category));

  return normalized.length ? normalized : ['未分類'];
}

function migrateEntries(rawEntries) {
  if (!Array.isArray(rawEntries)) return [];

  return rawEntries.map(entry => ({
    ...entry,
    id: entry.id || makeId(),
    date: entry.date || new Date().toISOString().slice(0, 10),
    status: entry.status === 'paid' ? 'paid' : 'unpaid',
    amount: positiveAmount(entry.amount),
    categories: normalizeCategories(entry.categories, entry.category),
    memo: String(entry.memo ?? '').trim(),
    createdAt: Number(entry.createdAt) || Date.now()
  }));
}

entries = migrateEntries(entries);
// 旧データを読み込んだ時点で、新形式も同じ保存キーに安全に保存する。
save();

function periodRange(year = new Date().getFullYear()) {
  if (settings.period === 'first') {
    return {
      start: `${year}-01-01`,
      end: `${year}-06-30`,
      label: '1月1日〜6月30日'
    };
  }
  return {
    start: `${year}-07-01`,
    end: `${year}-12-31`,
    label: '7月1日〜12月31日'
  };
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

function createCategoryCheckboxes(container, categories, namePrefix) {
  container.innerHTML = '';

  categories.forEach(category => {
    const label = document.createElement('label');
    label.className = 'check-option';

    const input = document.createElement('input');
    input.type = 'checkbox';
    input.value = category;
    input.dataset.category = category;
    input.name = `${namePrefix}-${category}`;

    const text = document.createElement('span');
    text.textContent = category;

    label.append(input, text);
    container.appendChild(label);
  });
}

function selectedCategories(container, fallbackToUnclassified = true) {
  const selected = [...container.querySelectorAll('input[type="checkbox"]:checked')]
    .map(input => input.value);

  if (selected.length) return selected;
  return fallbackToUnclassified ? ['未分類'] : [];
}

function setSelectedCategories(container, categories) {
  const selected = new Set(categories);
  container.querySelectorAll('input[type="checkbox"]').forEach(input => {
    input.checked = selected.has(input.value);
  });
}

createCategoryCheckboxes(entryCategoriesEl, CATEGORIES, 'entry-category');
createCategoryCheckboxes(editCategoriesEl, CATEGORIES, 'edit-category');
createCategoryCheckboxes(filterCategoriesEl, FILTER_CATEGORIES, 'filter-category');

function renderSettingsForm() {
  baseAmountInput.value = settings.baseAmount;
  adjustAmountInput.value = settings.adjustAmount;
  periodInput.value = settings.period;
}

function getCurrentEntries() {
  return entries.filter(entry => inPeriod(entry.date));
}

function getFilteredEntries(currentEntries) {
  if (!filterEnabled.checked) return currentEntries;

  const selected = selectedCategories(filterCategoriesEl, false);
  if (selected.length === 0) return currentEntries;

  return currentEntries.filter(entry => {
    const categories = normalizeCategories(entry.categories, entry.category);
    return selected.some(category => categories.includes(category));
  });
}

function renderSummary(displayedEntries) {
  categorySummary.innerHTML = '';

  if (displayedEntries.length === 0) {
    categorySummary.innerHTML = '<p class="empty">該当するデータはありません。</p>';
    return;
  }

  // この合計は履歴単位で1回だけ加算するため、複数カテゴリでも二重計上しない。
  const uniqueTotal = displayedEntries.reduce(
    (sum, entry) => sum + positiveAmount(entry.amount),
    0
  );

  const totalRow = document.createElement('div');
  totalRow.className = 'summary-row summary-total';
  totalRow.innerHTML = `<span>${filterEnabled.checked ? 'フィルター合計' : '使用合計'}</span><strong>${yen.format(uniqueTotal)}</strong>`;
  categorySummary.appendChild(totalRow);

  const categoryTotals = new Map();
  for (const entry of displayedEntries) {
    const categories = normalizeCategories(entry.categories, entry.category);
    for (const category of categories) {
      categoryTotals.set(
        category,
        (categoryTotals.get(category) ?? 0) + positiveAmount(entry.amount)
      );
    }
  }

  [...categoryTotals.entries()]
    .sort((a, b) => b[1] - a[1])
    .forEach(([category, total]) => {
      const row = document.createElement('div');
      row.className = 'summary-row';
      row.innerHTML = `<span>${category}</span><strong>${yen.format(total)}</strong>`;
      categorySummary.appendChild(row);
    });

  const note = document.createElement('p');
  note.className = 'hint summary-note';
  note.textContent = '※複数分類の履歴は各カテゴリ欄に含まれますが、上の合計は履歴1件につき1回だけ加算しています。';
  categorySummary.appendChild(note);
}

function displayMemo(entry) {
  const memo = String(entry.memo ?? '').trim();
  return memo || 'メモなし';
}

function openEdit(entry) {
  editIdInput.value = entry.id;
  editDateInput.value = entry.date;
  editStatusInput.value = entry.status;
  editAmountInput.value = positiveAmount(entry.amount);
  editMemoInput.value = entry.memo ?? '';

  const categories = normalizeCategories(entry.categories, entry.category);
  setSelectedCategories(
    editCategoriesEl,
    categories.filter(category => category !== '未分類')
  );

  editModal.classList.remove('hidden');
  document.body.classList.add('modal-open');
}

function closeEdit() {
  editModal.classList.add('hidden');
  document.body.classList.remove('modal-open');
  editForm.reset();
}

function render() {
  const currentEntries = getCurrentEntries();

  const used = currentEntries.reduce(
    (sum, entry) => sum + positiveAmount(entry.amount),
    0
  );

  const unpaid = currentEntries
    .filter(entry => entry.status === 'unpaid')
    .reduce((sum, entry) => sum + positiveAmount(entry.amount), 0);

  const remaining =
    Number(settings.baseAmount) -
    used +
    Number(settings.adjustAmount || 0);

  remainingAmount.textContent = yen.format(remaining);
  remainingDays.textContent = `${daysLeft()}日`;
  unpaidTotal.textContent = yen.format(unpaid);
  periodLabel.textContent = periodRange().label;

  const displayedEntries = getFilteredEntries(currentEntries);
  renderSummary(displayedEntries);

  entriesEl.innerHTML = '';

  const sorted = [...displayedEntries].sort(
    (a, b) =>
      b.date.localeCompare(a.date) ||
      Number(b.createdAt) - Number(a.createdAt)
  );

  if (sorted.length === 0) {
    entriesEl.innerHTML = '<p class="empty">該当する履歴がありません。</p>';
    return;
  }

  for (const entry of sorted) {
    const node = template.content.cloneNode(true);

    // 通常の履歴には分類を表示しない。
    node.querySelector('.entry-main').textContent = displayMemo(entry);
    node.querySelector('.entry-sub').textContent =
      `${entry.date}・${statusLabel(entry.status)}`;

    const amount = node.querySelector('.entry-amount');
    amount.textContent = yen.format(positiveAmount(entry.amount));
    amount.classList.add(entry.status === 'paid' ? 'paid' : 'unpaid');

    node.querySelector('.edit').addEventListener('click', () => {
      openEdit(entry);
    });

    const markPaidBtn = node.querySelector('.mark-paid');
    if (entry.status === 'unpaid') {
      markPaidBtn.addEventListener('click', () => {
        entries = entries.map(item =>
          item.id === entry.id
            ? { ...item, status: 'paid', paidAt: Date.now() }
            : item
        );
        save();
        render();
      });
    } else {
      markPaidBtn.remove();
    }

    node.querySelector('.delete').addEventListener('click', () => {
      if (!confirm(`「${displayMemo(entry)}」を削除しますか？`)) return;

      entries = entries.filter(item => item.id !== entry.id);
      save();
      render();
    });

    entriesEl.appendChild(node);
  }
}

form.addEventListener('submit', event => {
  event.preventDefault();

  if (amountInput.value === '') return;

  const amount = Number(amountInput.value);
  if (!Number.isFinite(amount) || amount < 0) return;

  entries.push({
    id: makeId(),
    date: dateInput.value,
    status: statusInput.value,
    amount,
    categories: selectedCategories(entryCategoriesEl),
    memo: memoInput.value.trim(),
    createdAt: Date.now()
  });

  save();
  form.reset();
  dateInput.valueAsDate = new Date();
  setSelectedCategories(entryCategoriesEl, []);
  render();
});

editForm.addEventListener('submit', event => {
  event.preventDefault();

  if (editAmountInput.value === '') return;

  const amount = Number(editAmountInput.value);
  if (!Number.isFinite(amount) || amount < 0) return;

  const id = editIdInput.value;

  entries = entries.map(entry => {
    if (entry.id !== id) return entry;

    return {
      ...entry,
      date: editDateInput.value,
      status: editStatusInput.value,
      amount,
      categories: selectedCategories(editCategoriesEl),
      memo: editMemoInput.value.trim(),
      editedAt: Date.now()
    };
  });

  save();
  closeEdit();
  render();
});

editCancelBtn.addEventListener('click', closeEdit);
editCancelTopBtn.addEventListener('click', closeEdit);

editModal.addEventListener('click', event => {
  if (event.target === editModal) closeEdit();
});

document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && !editModal.classList.contains('hidden')) {
    closeEdit();
  }
});

filterEnabled.addEventListener('change', render);

filterCategoriesEl.addEventListener('change', () => {
  if (filterEnabled.checked) render();
});

clearFilterBtn.addEventListener('click', () => {
  setSelectedCategories(filterCategoriesEl, []);
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

function downloadFile(contents, mimeType, fileName) {
  const blob = new Blob([contents], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

exportCsv.addEventListener('click', () => {
  const rows = [
    ['date', 'status', 'amount', 'categories', 'memo'],
    ...entries.map(entry => [
      entry.date,
      statusLabel(entry.status),
      positiveAmount(entry.amount),
      normalizeCategories(entry.categories, entry.category).join('&'),
      entry.memo ?? ''
    ])
  ];

  const csv = rows
    .map(row =>
      row
        .map(cell => `"${String(cell).replaceAll('"', '""')}"`)
        .join(',')
    )
    .join('\n');

  // Excelでの文字化けを防ぐためUTF-8 BOMを付与。
  downloadFile('\uFEFF' + csv, 'text/csv;charset=utf-8', 'okozukai.csv');
});

exportBackup.addEventListener('click', () => {
  const backup = {
    app: 'okozukai-pwa',
    backupVersion: 1,
    exportedAt: new Date().toISOString(),
    storageKey: STORAGE_KEY,
    settingsKey: SETTINGS_KEY,
    entries,
    settings
  };

  const date = new Date().toISOString().slice(0, 10);
  downloadFile(
    JSON.stringify(backup, null, 2),
    'application/json;charset=utf-8',
    `okozukai-backup-${date}.json`
  );
});

importBackupBtn.addEventListener('click', () => {
  importBackupFile.value = '';
  importBackupFile.click();
});

importBackupFile.addEventListener('change', async () => {
  const file = importBackupFile.files?.[0];
  if (!file) return;

  try {
    const text = await file.text();
    const backup = JSON.parse(text);

    if (!Array.isArray(backup.entries) || !backup.settings || typeof backup.settings !== 'object') {
      throw new Error('バックアップ形式が違います。');
    }

    const restoredEntries = migrateEntries(backup.entries);
    const restoredSettings = {
      baseAmount: Number(backup.settings.baseAmount || 0),
      adjustAmount: Number(backup.settings.adjustAmount || 0),
      period: backup.settings.period === 'first' ? 'first' : 'second'
    };

    const ok = confirm(
      `バックアップから復元します。\n現在の履歴 ${entries.length}件 → ${restoredEntries.length}件 に置き換わります。\nよろしいですか？`
    );
    if (!ok) return;

    entries = restoredEntries;
    settings = restoredSettings;
    save();
    renderSettingsForm();
    render();
    alert('バックアップを復元しました。');
  } catch (error) {
    console.error(error);
    alert('バックアップを復元できませんでした。JSONファイルを確認してください。');
  }
});

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js'));
}

render();
