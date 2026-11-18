const categoryColors = {
  'Food & Drink': '#6fcf97',
  Groceries: '#219653',
  Transport: '#f2994a',
  Shopping: '#eb5757',
  'Health & Wellbeing': '#bb6bd9',
  Entertainment: '#56ccf2',
  Subscriptions: '#e75694',
  Bills: '#23b5b5',
  Rent: '#4f8ef7',
  Travel: '#f97316',
  Gifts: '#aa7b45',
  Investment: '#7b8bf3',
  Business: '#8ab845',
  'School supplies': '#9b51e0',
  Other: '#f2c94c'
};
const categories = Object.keys(categoryColors);
const legacyCategories = { Food: 'Food & Drink', Transportation: 'Transport' };
const categoryName = (name) => Object.hasOwn(legacyCategories, name) ? legacyCategories[name] : name;

const currency = new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' });
const percentage = new Intl.NumberFormat('en-CA', { style: 'percent', maximumFractionDigits: 1 });
const key = 'spendwise-student-v1';
const byId = (id) => document.getElementById(id);
const month = byId('month');
const editor = byId('editor');
const form = byId('edit-form');
const fields = form.elements;
const limitEditor = byId('limit-editor');
const limitForm = byId('limit-form');
const limitFields = limitForm.elements;
const demoButton = byId('demo-toggle');
const money = (cents) => currency.format(cents / 100);
const sum = (items) => items.reduce((total, item) => total + item.amount, 0);

let state = { budgets: {}, expenses: [] };
let personalView;
let mode;
let selectedExpense;
let noticeTimer;

function today() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

function announce(message) {
  clearTimeout(noticeTimer);
  byId('feedback').textContent = message;
  noticeTimer = setTimeout(() => { byId('feedback').textContent = ''; }, 4200);
}

try {
  const saved = JSON.parse(localStorage.getItem(key));
  if (saved) state = saved;
} catch {
  announce('Saved data is unavailable in this browser.');
}

function save(next) {
  if (personalView) {
    state = next;
    return true;
  }
  try {
    localStorage.setItem(key, JSON.stringify(next));
    state = next;
    return true;
  } catch {
    return false;
  }
}

function render() {
  const budget = state.budgets[month.value] || 0;
  const expenses = state.expenses.filter((item) => item.date.startsWith(month.value + '-'));
  const spent = sum(expenses);
  const remaining = budget - spent;
  const percent = budget ? Math.round(100 * spent / budget) : 0;
  byId('budget').textContent = budget ? money(budget) : 'Not set';
  byId('set-budget').textContent = budget ? 'Edit budget' : 'Set budget';
  byId('spent').textContent = money(spent);
  byId('count').textContent = expenses.length + (expenses.length === 1 ? ' expense' : ' expenses');
  byId('remaining').textContent = budget ? money(Math.abs(remaining)) : '—';
  byId('remaining').classList.toggle('over', budget > 0 && remaining < 0);
  byId('balance-title').textContent = budget && remaining < 0 ? 'Over budget' : 'Remaining budget';
  byId('balance-note').textContent = budget ? 'For the selected month' : 'Set a budget to see your balance';
  byId('percent').textContent = budget ? percent + '%' : '—';
  byId('usage').value = Math.min(100, percent);
  byId('usage-note').textContent = budget ? money(spent) + ' spent of ' + money(budget) : 'Set a monthly budget to track your progress.';
  byId('expenses-month').textContent = new Date(month.value + '-01T12:00:00').toLocaleDateString('en-CA', { month: 'long', year: 'numeric' });
  renderForecast(budget, remaining);
  renderChart(expenses, spent);
  renderTrend();
  byId('export-csv').disabled = expenses.length === 0;
  renderCategoryLimits(expenses);
  renderReminders();
  renderExpenses(expenses);
  renderPaymentUndo();
  renderExpenseUndo();
  renderBudgetCopy();
}

function element(tag, value, className) {
  const node = document.createElement(tag);
  node.textContent = value;
  if (className) node.className = className;
  return node;
}

function offsetMonth(value, offset) {
  const date = new Date(value + '-01T12:00:00Z');
  date.setUTCMonth(date.getUTCMonth() + offset);
  return date.toISOString().slice(0, 7);
}

const trendMonthFormat = new Intl.DateTimeFormat('en-CA', { month: 'short', year: '2-digit', timeZone: 'UTC' });

function renderTrend() {
  const totals = new Map();
  for (const expense of state.expenses) {
    const key = expense.date.slice(0, 7);
    totals.set(key, (totals.get(key) || 0) + expense.amount);
  }
  const months = Array.from({ length: 6 }, (_, index) => offsetMonth(month.value, index - 5));
  const maximum = Math.max(1, ...months.map((key) => totals.get(key) || 0));
  const current = totals.get(month.value) || 0;
  const previous = totals.get(months[4]) || 0;
  const change = current - previous;
  byId('trend-comparison').textContent = current || previous
    ? (change === 0 ? 'Spending matches the previous month.' : money(Math.abs(change)) + (change > 0 ? ' more' : ' less') + ' spent than the previous month.')
    : 'No expenses recorded in the selected month or the one before.';
  byId('trend-chart').replaceChildren(...months.map((key) => {
    const amount = totals.get(key) || 0;
    const item = element('li', '', 'trend-column');
    item.classList.toggle('selected-month', key === month.value);
    if (key === month.value) item.setAttribute('aria-current', 'true');
    const track = element('div', '', 'trend-track');
    track.setAttribute('aria-hidden', 'true');
    const bar = element('span', '', 'trend-bar');
    bar.style.height = (amount / maximum * 100) + '%';
    track.append(bar);
    item.append(element('strong', money(amount)), track, element('span', trendMonthFormat.format(new Date(key + '-01T12:00:00Z')), 'muted'));
    return item;
  }));
}

function csvText(value) {
  const safe = /^\s*[=+@-]|^[\t\r\n]/.test(value) ? "'" + value : value;
  return '"' + safe.replaceAll('"', '""') + '"';
}

byId('export-csv').onclick = () => {
  const expenses = state.expenses.filter((item) => item.date.startsWith(month.value + '-'));
  if (!expenses.length) return;
  expenses.sort((first, second) => first.date.localeCompare(second.date));
  const rows = expenses.map((item) => [
    item.date, csvText(item.description), csvText(categoryName(item.category)), (item.amount / 100).toFixed(2)
  ].join(','));
  const csv = ['Date,Description,Category,Amount (CAD)', ...rows].join('\r\n') + '\r\n';
  const url = URL.createObjectURL(new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'spendwise-' + month.value + (personalView ? '-demo' : '') + '.csv';
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

function renderChart(expenses, spent) {
  const totals = categories.map((name) => ({
    name, color: categoryColors[name], amount: sum(expenses.filter((item) => categoryName(item.category) === name))
  })).filter((item) => item.amount > 0).sort((first, second) => second.amount - first.amount);
  const top = totals.filter((item) => item.amount === totals[0]?.amount);
  byId('top-category').textContent = top.length ? 'Highest spending: ' + top.map((item) => item.name).join(', ') : 'Add an expense to see your category breakdown.';
  const chart = byId('chart');
  chart.replaceChildren();
  if (!spent) return;

  let cumulative = 0;
  const segments = totals.map(({ amount, color }) => {
    const start = 100 * cumulative / spent;
    cumulative += amount;
    return color + ' ' + start + '% ' + (100 * cumulative / spent) + '%';
  });

  const donut = element('div', '', 'donut');
  donut.style.background = 'conic-gradient(' + segments.join(', ') + ')';
  donut.setAttribute('aria-hidden', 'true');
  const center = element('div', '', 'donut-center');
  center.append(element('strong', money(spent)), element('span', 'Total spent', 'muted'));
  donut.append(center);

  const legend = element('ul', '', 'chart-legend');
  legend.setAttribute('aria-label', 'Spending by category');
  for (const { name, amount, color } of totals) {
    const row = element('li', '');
    const swatch = element('span', '', 'chart-swatch');
    swatch.style.backgroundColor = color;
    swatch.setAttribute('aria-hidden', 'true');
    const label = element('span', name);
    label.append(element('small', percentage.format(amount / spent), 'muted'));
    row.append(swatch, label, element('strong', money(amount)));
    legend.append(row);
  }
  chart.append(donut, legend);
}

function renderExpenses(expenses) {
  const list = byId('expense-list');
  const query = byId('expense-search').value.trim().toLowerCase();
  const category = byId('expense-category').value;
  const matches = expenses.filter((item) => item.description.toLowerCase().includes(query)
    && (!category || categoryName(item.category) === category));
  if (!matches.length) {
    list.replaceChildren(element('p', expenses.length ? 'No expenses match your filters.' : 'No expenses recorded for this month.', 'empty muted'));
    return;
  }
  list.replaceChildren(...matches.sort((first, second) => second.date.localeCompare(first.date)).map((item) => {
    const row = element('div', '', 'row');
    const description = element('div', '');
    description.append(element('strong', item.description), element('span', categoryName(item.category) + ' · ' + item.date, 'muted'));
    const actions = element('div', '', 'right');
    const edit = element('button', 'Edit');
    edit.setAttribute('aria-label', 'Edit ' + item.description);
    edit.onclick = () => openEditor('expense', item);
    const remove = element('button', 'Remove');
    remove.setAttribute('aria-label', 'Remove ' + item.description);
    remove.onclick = () => openEditor('remove', item);
    actions.append(element('strong', money(item.amount)), edit, remove);
    row.append(description, actions);
    return row;
  }));
}

function openEditor(nextMode, item) {
  form.reset();
  mode = nextMode;
  selectedExpense = item;
  const isExpense = mode === 'expense';
  const isRemoval = mode === 'remove';
  byId('expense-fields').hidden = !isExpense;
  byId('amount-label').hidden = isRemoval;
  for (const field of [fields.description, fields.category, fields.date]) field.disabled = !isExpense;
  fields.amount.disabled = isRemoval;
  byId('form-title').textContent = isRemoval ? 'Remove expense?' : isExpense ? (item ? 'Edit expense' : 'Add expense') : 'Set monthly budget';
  byId('form-note').textContent = isRemoval ? item.description + ' · ' + money(item.amount) : isExpense ? 'Enter the details for this expense.' : byId('expenses-month').textContent;
  byId('amount-caption').textContent = isExpense ? 'Amount (CAD)' : 'Monthly budget (CAD)';
  byId('save').textContent = isRemoval ? 'Remove expense' : isExpense ? 'Save expense' : 'Save budget';
  byId('form-error').textContent = '';
  if (isExpense) {
    fields.description.value = item?.description || '';
    fields.category.value = item ? categoryName(item.category) : categories[0];
    fields.date.value = item?.date || (today().startsWith(month.value) ? today() : month.value + '-01');
  }
  const initial = isExpense ? item?.amount : state.budgets[month.value];
  fields.amount.value = initial ? (initial / 100).toFixed(2) : '';
  editor.showModal();
  (isRemoval ? byId('cancel') : isExpense ? fields.description : fields.amount).focus();
}

form.addEventListener('submit', (event) => {
  event.preventDefault();
  const amount = Math.round(fields.amount.valueAsNumber * 100);
  const next = { ...state, budgets: { ...state.budgets }, expenses: [...state.expenses] };
  let message;
  if (mode === 'budget') {
    next.budgets[month.value] = amount;
    message = 'Monthly budget saved.';
  } else if (mode === 'remove') {
    next.expenses = next.expenses.filter((item) => item.id !== selectedExpense.id);
    next.removedExpense = selectedExpense;
    message = 'Expense removed. You can undo it in Expenses.';
  } else {
    const description = fields.description.value.trim();
    if (!description) {
      byId('form-error').textContent = 'Enter an expense description.';
      fields.description.focus();
      return;
    }
    const item = { id: selectedExpense?.id || crypto.randomUUID(), description, amount, category: fields.category.value, date: fields.date.value };
    next.expenses = next.expenses.filter((previous) => previous.id !== item.id);
    next.expenses.push(item);
    message = selectedExpense ? 'Expense updated.' : 'Expense added.';
  }
  if (!save(next)) {
    byId('form-error').textContent = 'Your changes could not be saved. Check whether browser storage is enabled.';
    return;
  }
  if (mode === 'expense') month.value = fields.date.value.slice(0, 7);
  editor.close();
  render();
  byId(mode === 'remove' ? 'undo-expense' : mode === 'budget' ? 'set-budget' : 'add').focus();
  announce(message);
});

function monthlyLimits() {
  return state.categoryLimits?.[month.value] || {};
}

function renderCategoryLimits(expenses) {
  const container = byId('category-limits');
  const limits = monthlyLimits();
  const active = categories.filter((name) => limits[name]);
  if (!active.length) {
    container.replaceChildren(element('p', 'Set a limit to track how much you have left in a category.', 'muted'));
    return;
  }
  const rows = active.map((name) => {
    const limit = limits[name];
    const spent = sum(expenses.filter((item) => categoryName(item.category) === name));
    const remaining = limit - spent;
    const row = element('div', '', 'limit-row');
    const detail = element('div', '', 'limit-detail');
    const status = remaining < 0 ? money(-remaining) + ' over budget' : money(remaining) + ' left';
    detail.append(element('h3', name), element('strong', status, remaining < 0 ? 'over' : 'mint'));
    const progress = document.createElement('progress');
    progress.max = limit;
    progress.value = Math.min(spent, limit);
    progress.setAttribute('aria-label', name + ' budget used');
    detail.append(progress, element('p', money(spent) + ' of ' + money(limit) + ' spent', 'muted'));
    const edit = element('button', 'Edit limit');
    edit.type = 'button';
    edit.setAttribute('aria-label', 'Edit ' + name + ' limit');
    edit.onclick = () => openLimitEditor(name);
    row.append(detail, edit);
    return row;
  });
  container.replaceChildren(...rows);
}

function loadLimitField() {
  const limit = monthlyLimits()[limitFields.category.value];
  limitFields.limit.value = limit ? (limit / 100).toFixed(2) : '';
  byId('remove-limit').hidden = !limit;
  byId('limit-error').textContent = '';
}

function openLimitEditor(name) {
  limitFields.category.value = name;
  byId('limit-month').textContent = byId('expenses-month').textContent;
  loadLimitField();
  limitEditor.showModal();
  (monthlyLimits()[name] ? limitFields.limit : limitFields.category).focus();
}

function saveLimit(amount) {
  const category = limitFields.category.value;
  const limits = { ...monthlyLimits() };
  if (amount) limits[category] = amount;
  else delete limits[category];
  const next = { ...state, categoryLimits: { ...state.categoryLimits, [month.value]: limits } };
  if (!save(next)) {
    byId('limit-error').textContent = 'Could not save the limit. Check whether browser storage is enabled.';
    return;
  }
  limitEditor.close();
  render();
  byId('set-limit').focus();
  announce(amount ? category + ' limit saved.' : category + ' limit removed.');
}

function demoState(sampleMonth) {
  const samples = [
    ['Student apartment', 'Rent', 65000],
    ['Weekly groceries', 'Groceries', 9500],
    ['Grocery restock', 'Groceries', 7000],
    ['Monthly bus pass', 'Transport', 8500],
    ['Streaming and music', 'Subscriptions', 2700],
    ['Course textbook', 'School supplies', 7800],
    ['Lunch on campus', 'Food & Drink', 1800]
  ];
  return {
    budgets: { [offsetMonth(sampleMonth, -1)]: 135000, [sampleMonth]: 140000 },
    reminders: [
      demoReminder('rent', 'Rent', 65000, 28),
      demoReminder('subscription', 'Subscriptions', 2700, 3),
      demoReminder('internet', 'Bills', 4500, 0)
    ],
    categoryLimits: { [offsetMonth(sampleMonth, -1)]: { Groceries: 24000, Transport: 9000 }, [sampleMonth]: { Groceries: 20000, Transport: 8000, Subscriptions: 3000, 'School supplies': 10000 } },
    expenses: [
      ...samples.map(([description, category, amount], index) => ({
        id: 'sample-' + index, description, category, amount, date: sampleMonth + '-0' + (index + 1)
      })),
      ...[20800, 25300, 18400, 30500, 42100].flatMap((groceries, index) => {
        const priorMonth = offsetMonth(sampleMonth, index - 5);
        return [
          { id: 'sample-rent-' + index, description: 'Student apartment', category: 'Rent', amount: 65000, date: priorMonth + '-01' },
          { id: 'sample-groceries-' + index, description: 'Monthly groceries', category: 'Groceries', amount: groceries, date: priorMonth + '-21' },
          { id: 'sample-bus-' + index, description: 'Monthly bus pass', category: 'Transport', amount: 8500, date: priorMonth + '-05' }
        ];
      })
    ]
  };
}

demoButton.onclick = () => {
  if (personalView) {
    state = personalView.state;
    month.value = personalView.month;
    personalView = undefined;
  } else {
    personalView = { state, month: month.value };
    month.value = today().slice(0, 7);
    state = demoState(month.value);
  }
  byId('expense-search').value = '';
  byId('expense-category').value = '';
  byId('demo-banner').hidden = !personalView;
  demoButton.textContent = personalView ? 'Exit demo' : 'Try demo';
  render();
  announce(personalView ? 'Demo mode started.' : 'Returned to your budget.');
};

const reminderEditor = byId('reminder-editor');
const reminderForm = byId('reminder-form');
const reminderFields = reminderForm.elements;
const paymentDetails = byId('payment-details');
const payForm = byId('pay-form');
const actualAmount = payForm.elements.actual;
const stopDialog = byId('stop-dialog');
let pendingStopId;
const dayMs = 86400000;
const dueDateFormat = new Intl.DateTimeFormat('en-CA', {
  year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC'
});
let paymentId;
let editedReminder;

function paymentDate(date) {
  return Date.parse(date + 'T00:00:00Z');
}

function daysUntil(date) {
  return Math.round((paymentDate(date) - paymentDate(today())) / dayMs);
}

function dueStatus(date) {
  const days = daysUntil(date);
  const unit = Math.abs(days) === 1 ? ' day' : ' days';
  if (days === 0) return 'Due today';
  if (days < 0) return Math.abs(days) + unit + ' overdue';
  return 'Due in ' + days + unit;
}

function nextDueDate({ due, day }) {
  const date = new Date(paymentDate(due));
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + 1);
  const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  date.setUTCDate(Math.min(day, lastDay));
  return date.toISOString().slice(0, 10);
}

function demoReminder(id, category, amount, offset) {
  const due = new Date(paymentDate(today()) + dayMs * offset).toISOString().slice(0, 10);
  const names = { rent: 'Rent', subscription: 'Streaming subscription', internet: 'Internet bill' };
  return { id: 'demo-' + id, description: names[id], category, amount, due, day: Number(due.slice(-2)) };
}

function updateBillsBadge() {
  const due = (state.reminders || []).filter((reminder) => daysUntil(reminder.due) <= 0).length;
  const badge = byId('bills-due');
  badge.hidden = due === 0;
  badge.textContent = due ? due + ' due' : '';
}

function renderReminders() {
  updateBillsBadge();
  const list = byId('reminder-list');
  const reminders = [...(state.reminders || [])].sort((first, second) => first.due.localeCompare(second.due));
  if (!reminders.length) {
    list.replaceChildren(element('p', 'Add rent, subscriptions, or other monthly payments to see what’s due.', 'muted'));
    return;
  }
  list.replaceChildren(...reminders.map((reminder) => {
    const row = element('button', '', 'reminder-row');
    row.type = 'button';
    const due = daysUntil(reminder.due) <= 0;
    row.classList.toggle('reminder-due', due);
    row.dataset.payment = reminder.id;
    row.append(element('strong', reminder.description), element('span', dueStatus(reminder.due), 'due-status'), element('span', money(reminder.amount), 'reminder-amount'));
    row.onclick = () => openPayment(reminder);
    return row;
  }));
}

function openPayment(reminder) {
  paymentId = reminder.id;
  byId('payment-name').textContent = reminder.description;
  byId('payment-status').textContent = dueStatus(reminder.due);
  byId('payment-status').classList.toggle('payment-urgent', daysUntil(reminder.due) <= 0);
  byId('payment-amount').textContent = money(reminder.amount);
  byId('payment-category').textContent = reminder.category;
  byId('payment-date').textContent = dueDateFormat.format(paymentDate(reminder.due));
  byId('payment-repeat').textContent = 'Monthly · day ' + reminder.day;
  byId('payment-note').textContent = 'Marking as paid logs an expense dated today and advances this reminder to ' + dueDateFormat.format(paymentDate(nextDueDate(reminder))) + '.';
  byId('payment-error').textContent = '';
  if (!paymentDetails.open) {
    payForm.reset();
    actualAmount.placeholder = (reminder.amount / 100).toFixed(2);
    paymentDetails.showModal();
  }
}

function openReminderEditor(reminder) {
  reminderForm.reset();
  editedReminder = reminder;
  byId('reminder-editor-title').textContent = reminder ? 'Edit monthly reminder' : 'Add monthly reminder';
  reminderFields.description.value = reminder?.description || '';
  reminderFields.category.value = reminder?.category || 'Rent';
  reminderFields.amount.value = reminder ? (reminder.amount / 100).toFixed(2) : '';
  reminderFields.date.value = reminder?.due || today();
  byId('reminder-form-error').textContent = '';
  reminderEditor.showModal();
  reminderFields.description.focus();
}

function focusReminder(id) {
  const row = [...byId('reminder-list').children].find((item) => item.dataset.payment === id);
  (row || byId('add-reminder')).focus();
}

reminderForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const description = reminderFields.description.value.trim();
  if (!description) {
    byId('reminder-form-error').textContent = 'Enter a payment name.';
    reminderFields.description.focus();
    return;
  }

  const due = reminderFields.date.value;
  const reminder = {
    id: editedReminder?.id || crypto.randomUUID(),
    description,
    category: reminderFields.category.value,
    amount: Math.round(reminderFields.amount.valueAsNumber * 100),
    due,
    day: editedReminder?.due === due ? editedReminder.day : Number(due.slice(-2))
  };
  const reminders = (state.reminders || []).filter((item) => item.id !== reminder.id);
  const next = { ...state, reminders: [...reminders, reminder] };
  if (next.paymentUndo?.reminder.id === reminder.id) delete next.paymentUndo;
  if (!save(next)) {
    byId('reminder-form-error').textContent = 'Could not save this reminder. Check whether browser storage is enabled.';
    return;
  }
  reminderEditor.close();
  render();
  focusReminder(reminder.id);
  announce('Monthly reminder saved.');
});

byId('add-reminder').onclick = () => openReminderEditor();
byId('cancel-reminder').onclick = () => {
  reminderEditor.close();
  if (editedReminder) focusReminder(editedReminder.id);
};
byId('close-payment').onclick = () => paymentDetails.close();
byId('edit-reminder').onclick = () => {
  const reminder = state.reminders.find((item) => item.id === paymentId);
  paymentDetails.close();
  openReminderEditor(reminder);
};
payForm.onsubmit = (event) => {
  event.preventDefault();
  const reminder = state.reminders.find((item) => item.id === paymentId);
  if (!paymentDetails.open || !reminder) return;
  const date = today();
  const expense = {
    id: 'payment-' + reminder.id + '-' + reminder.due,
    description: reminder.description,
    amount: actualAmount.value ? Math.round(actualAmount.valueAsNumber * 100) : reminder.amount,
    category: reminder.category,
    date
  };
  if (state.expenses.some((item) => item.id === expense.id)) {
    byId('payment-error').textContent = 'This scheduled payment is already in Expenses.';
    return;
  }
  const next = {
    ...state,
    expenses: [...state.expenses, expense],
    paymentUndo: { reminder, expenseId: expense.id, date },
    reminders: state.reminders.map((item) => item.id === paymentId ? { ...item, due: nextDueDate(item) } : item)
  };
  if (next.removedExpense?.id === expense.id) delete next.removedExpense;
  if (!save(next)) {
    byId('payment-error').textContent = 'Could not record this payment. Check whether browser storage is enabled.';
    return;
  }
  paymentDetails.close();
  month.value = date.slice(0, 7);
  render();
  focusReminder(reminder.id);
  announce(reminder.description + ' marked as paid and added to Expenses.');
};

function renderForecast(budget, remaining) {
  const selectedMonth = month.value;
  const currentMonth = today().slice(0, 7);
  const monthNumber = (value) => Number(value.slice(0, -3)) * 12 + Number(value.slice(-2));
  const selectedNumber = monthNumber(selectedMonth);
  let unpaid = 0;
  for (const reminder of state.reminders || []) {
    const monthsUntilSelected = selectedNumber - monthNumber(reminder.due.slice(0, -3));
    if (monthsUntilSelected >= 0) {
      const occurrences = selectedMonth === currentMonth ? monthsUntilSelected + 1 : 1;
      unpaid += occurrences * reminder.amount;
    }
  }
  const forecast = remaining - unpaid;
  byId('forecast').textContent = budget ? money(forecast) : '—';
  byId('forecast').classList.toggle('over', Boolean(budget) && forecast < 0);
  const timing = selectedMonth === currentMonth ? 'due by month-end, including overdue bills' : 'scheduled for this month';
  byId('forecast-note').textContent = money(unpaid) + ' in unpaid bills ' + timing
    + (budget ? '' : ' · Set a budget to see what’s left.');
}

function budgetCopyPlan() {
  const previousMonth = offsetMonth(month.value, -1);
  const budget = state.budgets[month.value] ? 0 : state.budgets[previousMonth] || 0;
  const existingLimits = monthlyLimits();
  const limits = Object.entries(state.categoryLimits?.[previousMonth] || {})
    .filter(([category, amount]) => amount > 0 && !existingLimits[category]);
  return { budget, limits };
}

function renderBudgetCopy() {
  const { budget, limits } = budgetCopyPlan();
  byId('budget-copy').hidden = !budget && limits.length === 0;
  const parts = [];
  if (budget) parts.push(money(budget) + ' monthly budget');
  if (limits.length) parts.push(limits.length + (limits.length === 1 ? ' category limit' : ' category limits'));
  byId('budget-copy-note').textContent = parts.length ? 'Available from last month: ' + parts.join(' and ') + '.' : '';
}

byId('copy-budget').onclick = () => {
  const { budget, limits } = budgetCopyPlan();
  if (!budget && !limits.length) return;
  const next = {
    ...state,
    budgets: budget ? { ...state.budgets, [month.value]: budget } : state.budgets,
    categoryLimits: {
      ...state.categoryLimits,
      [month.value]: { ...monthlyLimits(), ...Object.fromEntries(limits) }
    }
  };
  if (!save(next)) {
    announce('Could not copy the budget. Check whether browser storage is enabled.');
    return;
  }
  render();
  byId(budget ? 'set-budget' : 'set-limit').focus();
  announce('Copied last month’s available budget settings.');
};

function renderExpenseUndo() {
  const expense = state.removedExpense;
  byId('expense-undo').hidden = !expense;
  byId('expense-undo-note').textContent = expense ? 'Last removed: ' + expense.description : '';
}

byId('undo-expense').onclick = () => {
  const expense = state.removedExpense;
  if (!expense) return;
  const next = { ...state, expenses: [...state.expenses.filter((item) => item.id !== expense.id), expense] };
  delete next.removedExpense;
  if (!save(next)) {
    announce('Could not restore the expense. Check whether browser storage is enabled.');
    return;
  }
  month.value = expense.date.slice(0, 7);
  byId('expense-search').value = '';
  byId('expense-category').value = '';
  render();
  byId('expense-search').focus();
  announce(expense.description + ' restored to Expenses.');
};

function renderPaymentUndo() {
  const undo = state.paymentUndo;
  byId('payment-undo').hidden = !undo;
  byId('undo-description').textContent = undo ? 'Last payment recorded: ' + undo.reminder.description : '';
}

byId('undo-payment').onclick = () => {
  const undo = state.paymentUndo;
  if (!undo) return;
  const next = {
    ...state,
    expenses: state.expenses.filter((item) => item.id !== undo.expenseId),
    reminders: state.reminders.map((item) => item.id === undo.reminder.id ? undo.reminder : item)
  };
  delete next.paymentUndo;
  if (next.removedExpense?.id === undo.expenseId) delete next.removedExpense;
  if (!save(next)) {
    announce('Could not undo the payment. Check whether browser storage is enabled.');
    return;
  }
  month.value = undo.date.slice(0, 7);
  render();
  focusReminder(undo.reminder.id);
  announce('Payment undone and the original due date restored.');
};

byId('stop-reminder').onclick = () => {
  pendingStopId = paymentId;
  paymentDetails.close();
  byId('stop-error').textContent = '';
  stopDialog.showModal();
  byId('cancel-stop').focus();
};
byId('cancel-stop').onclick = () => stopDialog.close();
stopDialog.addEventListener('close', () => focusReminder(pendingStopId));
byId('confirm-stop').onclick = () => {
  const next = { ...state, reminders: state.reminders.filter((item) => item.id !== pendingStopId) };
  if (next.paymentUndo?.reminder.id === pendingStopId) delete next.paymentUndo;
  if (!save(next)) {
    byId('stop-error').textContent = 'Could not stop the reminder. Check whether browser storage is enabled.';
    return;
  }
  stopDialog.close();
  render();
  announce('Reminder stopped. Past payments are still in Expenses.');
};

for (const [id, event] of [['expense-search', 'input'], ['expense-category', 'change']]) {
  byId(id).addEventListener(event, () => {
    renderExpenses(state.expenses.filter((item) => item.date.startsWith(month.value + '-')));
  });
}
byId('expense-category').append(...categories.map((name) => new Option(name, name)));

let reminderDay = today();
function refreshCountdowns() {
  const date = today();
  if (date === reminderDay) return;
  reminderDay = date;
  updateBillsBadge();
  const budget = state.budgets[month.value] || 0;
  const spent = sum(state.expenses.filter((item) => item.date.startsWith(month.value + '-')));
  renderForecast(budget, budget - spent);
  for (const row of byId('reminder-list').querySelectorAll('[data-payment]')) {
    const reminder = state.reminders.find((item) => item.id === row.dataset.payment);
    row.classList.toggle('reminder-due', daysUntil(reminder.due) <= 0);
    row.querySelector('.due-status').textContent = dueStatus(reminder.due);
  }
  if (paymentDetails.open) openPayment(state.reminders.find((item) => item.id === paymentId));
}
setInterval(refreshCountdowns, 30000);
document.addEventListener('visibilitychange', refreshCountdowns);

const currentMonth = today().slice(0, 7);
month.value = currentMonth;
month.addEventListener('change', () => {
  if (!month.value) month.value = currentMonth;
  render();
});
for (const select of [fields.category, limitFields.category, reminderFields.category]) {
  select.replaceChildren(...categories.map((name) => new Option(name, name)));
}
byId('set-limit').onclick = () => openLimitEditor(categories.find((name) => !monthlyLimits()[name]) || categories[0]);
limitFields.category.onchange = loadLimitField;
byId('cancel-limit').onclick = () => limitEditor.close();
byId('remove-limit').onclick = () => saveLimit(0);
limitForm.addEventListener('submit', (event) => {
  event.preventDefault();
  saveLimit(Math.round(limitFields.limit.valueAsNumber * 100));
});
byId('cancel').onclick = () => editor.close();
byId('add').onclick = () => openEditor('expense');
byId('set-budget').onclick = () => openEditor('budget');
render();

const themeToggle = byId('theme-toggle');
const themeColor = document.querySelector('meta[name="theme-color"]');

function applyTheme(theme) {
  const light = theme === 'light';
  document.documentElement.dataset.theme = theme;
  const label = light ? 'Switch to dark mode' : 'Switch to light mode';
  themeToggle.setAttribute('aria-label', label);
  themeToggle.title = label;
  themeColor.content = light ? '#f4f6fb' : '#101116';
}

applyTheme(document.documentElement.dataset.theme || 'dark');
themeToggle.addEventListener('click', () => {
  const next = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
  applyTheme(next);
  try {
    localStorage.setItem('spendwise-theme', next);
  } catch {
    announce('Theme changed for this visit.');
  }
});
