// Credit-hold check: a customer is on credit hold if they have any open invoice
// overdue 15+ days. Buckets: any invoice 15–29 days overdue and any 30+ days overdue
// drive the notes shown to the user.
const { zohoGet, headers, checkEnv } = require('./zoho-utils');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  try {
    checkEnv();
    const { id } = event.queryStringParameters || {};
    if (!id) return { statusCode: 400, headers, body: JSON.stringify({ error: 'id required' }) };

    // Overdue = past the due date with an outstanding balance.
    const data = await zohoGet(`/invoices?customer_id=${encodeURIComponent(id)}&filter_by=Status.Overdue&per_page=200&sort_column=due_date`);
    const list = Array.isArray(data.invoices) ? data.invoices : [];

    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const DAY = 86400000;

    const overdue = list
      .map(inv => {
        const bal = Number(inv.balance != null ? inv.balance : inv.total) || 0;
        const due = inv.due_date ? new Date(`${inv.due_date}T00:00:00`) : null;
        const days = due ? Math.floor((startOfToday - due) / DAY) : 0;
        return {
          invoice_number: inv.invoice_number || inv.invoice_id || '',
          due_date: inv.due_date || '',
          balance: bal,
          days_overdue: days,
        };
      })
      .filter(inv => inv.balance > 0 && inv.days_overdue >= 1);

    const held = overdue.filter(i => i.days_overdue >= 15);
    const onCreditHold = held.length > 0;
    const any15to29 = overdue.some(i => i.days_overdue >= 15 && i.days_overdue <= 29);
    const any30plus = overdue.some(i => i.days_overdue >= 30);
    const maxDaysOverdue = overdue.reduce((m, i) => Math.max(m, i.days_overdue), 0);
    const totalOverdueBalance = held.reduce((s, i) => s + i.balance, 0);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        onCreditHold,
        any15to29,
        any30plus,
        maxDaysOverdue,
        overdueCount: held.length,
        totalOverdueBalance: Math.round(totalOverdueBalance * 100) / 100,
        invoices: held.sort((a, b) => b.days_overdue - a.days_overdue),
      }),
    };
  } catch (e) {
    return { statusCode: 502, headers, body: JSON.stringify({ error: e.message }) };
  }
};
