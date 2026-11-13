const { round2 } = require('../../core/money');
const accountsService = require('../accounts/accounts.service');
const { isCreditType } = require('../accounts/accounts.constants');
const budgetsService = require('../budgets/budgets.service');
const loansService = require('../loans/loans.service');
const repo = require('./insights.repository');
const periods = require('./insights.periods');

/**
 * All the numbers on the Insights page come from SQL and plain math in
 * this file. The AI never calculates anything: it only receives these
 * finished numbers (see buildFacts) and puts them into words. If the AI
 * is off or fails, buildFallbackInsight writes the words with fixed rules.
 */

const MAX_CATEGORIES_FOR_AI = 5;
const MAX_ACCOUNTS_FOR_AI = 4;
const MAX_NAME_LENGTH = 40;

function percentChange(current, previous) {
    if (!(previous > 0)) return null;
    return Math.round(((current - previous) / previous) * 1000) / 10;
}

function share(part, whole) {
    return whole > 0 ? Math.round((part / whole) * 1000) / 10 : 0;
}

function cleanName(value) {
    return String(value || '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, MAX_NAME_LENGTH);
}

function rupees(n) {
    const value = Number(n) || 0;
    return `₹${value.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

/**
 * Gathers everything for one period. `today` must be a valid
 * "YYYY-MM-DD" date (the route decides which one to trust).
 */
async function getInsightData(userId, period, today) {
    const p = periods.resolvePeriod(period, today);
    const { range, previous, chart } = p;
    const hasPreviousChart = chart.previousKeys.length > 0;
    const budgetMonth = today.slice(0, 7);

    // The trend chart can cover more than the numbers do (the "day" chart
    // shows the last 7 days), so it has its own date span.
    const chartFrom = chart.unit === 'month' ? `${chart.keys[0]}-01` : chart.keys[0];

    const [
        totals, previousTotals, biggest, categories, previousCategories,
        currentBuckets, previousBuckets, accountRows, flow, previousFlow,
        transfers, budgetRows, loans, accounts
    ] = await Promise.all([
        repo.expenseTotals(userId, range.from, range.to),
        repo.expenseTotals(userId, previous.from, previous.to),
        repo.biggestExpenses(userId, range.from, range.to, 1),
        repo.categoryTotals(userId, range.from, range.to),
        repo.categoryTotals(userId, previous.from, previous.to),
        repo.spendingByBucket(userId, chartFrom, today, chart.unit),
        hasPreviousChart ? repo.spendingByBucket(userId, previous.from, previous.to, chart.unit) : Promise.resolve([]),
        repo.accountTotals(userId, range.from, range.to),
        repo.fundsFlow(userId, range.from, range.to),
        repo.fundsFlow(userId, previous.from, previous.to),
        repo.transferTotals(userId, range.from, range.to),
        budgetsService.getBudgets(userId, budgetMonth),
        loansService.getLoans(userId),
        accountsService.getAccounts(userId)
    ]);

    const spent = round2(totals.total);
    const previousSpent = round2(previousTotals.total);
    const daysInRange = periods.daysBetween(range.from, range.to);
    const previousCategoryMap = new Map(previousCategories.map(c => [c.category, c.total]));

    const categoryRows = categories.map(c => {
        const previousTotal = round2(previousCategoryMap.get(c.category) || 0);

        return {
            category: c.category,
            total: round2(c.total),
            count: c.count,
            share: share(c.total, spent),
            previousTotal,
            changePct: percentChange(c.total, previousTotal)
        };
    });

    const currentMap = new Map(currentBuckets.map(b => [b.bucket, b.total]));
    const previousMap = new Map(previousBuckets.map(b => [b.bucket, b.total]));

    const trend = {
        unit: chart.unit,
        labels: chart.labels,
        current: chart.keys.map(k => round2(currentMap.get(k) || 0)),
        previous: hasPreviousChart
            ? chart.previousKeys.map(k => (k === null ? null : round2(previousMap.get(k) || 0)))
            : []
    };

    const openLoans = loans.filter(l => l.remaining_amount > 0);

    const credit = accounts
        .filter(a => isCreditType(a.type) && a.credit_limit !== null && Number(a.credit_limit) > 0)
        .map(a => {
            const limit = Number(a.credit_limit);
            const used = round2(limit - a.balance);

            return { name: cleanName(a.name), used, limit: round2(limit), pct: share(used, limit) };
        });

    return {
        period,
        today,
        label: periods.PERIOD_LABELS[period],
        previousLabel: periods.PREVIOUS_LABELS[period],
        range,
        previous,
        kpis: {
            spent,
            previousSpent,
            changePct: percentChange(spent, previousSpent),
            count: totals.count,
            activeDays: totals.activeDays,
            daysInRange,
            noSpendDays: period === 'day' ? 0 : Math.max(0, daysInRange - totals.activeDays),
            avgPerDay: round2(spent / daysInRange),
            biggest: biggest[0] || null,
            added: round2(flow.added),
            previousAdded: round2(previousFlow.added),
            repaid: round2(flow.repaid),
            transfers: { count: transfers.count, total: round2(transfers.total) }
        },
        categories: categoryRows,
        trend,
        accounts: accountRows.map(a => ({
            name: cleanName(a.name),
            total: round2(a.total),
            count: a.count,
            share: share(a.total, spent)
        })),
        budgets: {
            month: budgetMonth,
            items: budgetRows.map(b => ({
                category: b.category,
                amount: round2(b.amount),
                spent: round2(b.spent),
                pct: share(b.spent, b.amount)
            }))
        },
        loans: {
            openCount: openLoans.length,
            owedToMe: round2(openLoans.filter(l => l.direction === 'owed_to_me').reduce((s, l) => s + l.remaining_amount, 0)),
            iOwe: round2(openLoans.filter(l => l.direction === 'i_owe').reduce((s, l) => s + l.remaining_amount, 0))
        },
        credit
    };
}

/** The highest bucket on the trend chart, for "your busiest day" style remarks. */
function findPeak(trend) {
    let best = null;

    trend.current.forEach((value, i) => {
        if (value > 0 && (!best || value > best.amount)) best = { label: trend.labels[i], amount: value };
    });

    return best;
}

/**
 * The compact, privacy-safe summary sent to the AI. It has numbers,
 * category names and account names only. No notes, no loan people, no
 * email, no user name.
 */
function buildFacts(data) {
    const k = data.kpis;

    return {
        period: data.period,
        periodLabel: data.label,
        comparedWith: data.previousLabel,
        spent: k.spent,
        previousSpent: k.previousSpent,
        changePercent: k.changePct,
        expenseCount: k.count,
        daysInPeriod: k.daysInRange,
        daysWithSpending: k.activeDays,
        daysWithoutSpending: k.noSpendDays,
        averagePerDay: k.avgPerDay,
        biggestExpense: k.biggest,
        busiestPeriodBucket: findPeak(data.trend),
        topCategories: data.categories.slice(0, MAX_CATEGORIES_FOR_AI).map(c => ({
            category: c.category,
            total: c.total,
            sharePercent: c.share,
            previousTotal: c.previousTotal,
            changePercent: c.changePct
        })),
        spentByAccount: data.accounts.slice(0, MAX_ACCOUNTS_FOR_AI).map(a => ({ account: a.name, total: a.total })),
        moneyAdded: k.added,
        moneyAddedBefore: k.previousAdded,
        cardRepayments: k.repaid,
        transfers: k.transfers,
        monthlyBudgetsThisMonth: data.budgets.items.map(b => ({
            category: b.category,
            budget: b.amount,
            spent: b.spent,
            usedPercent: b.pct
        })),
        creditUsage: data.credit.map(c => ({ account: c.name, used: c.used, limit: c.limit, usedPercent: c.pct })),
        loans: { openCount: data.loans.openCount, owedToYou: data.loans.owedToMe, youOwe: data.loans.iOwe }
    };
}

/**
 * Plain, rule-based insight. Used when the AI is not set up, is busy,
 * or fails, so every period always has readable text.
 */
function buildFallbackInsight(data) {
    const k = data.kpis;

    if (k.count === 0) {
        const points = ['No expenses were logged in this period.'];

        if (k.added > 0) points.push(`You added ${rupees(k.added)} to your accounts.`);

        return {
            headline: `No spending recorded ${data.label}`,
            mood: 'good',
            points,
            tip: 'Log expenses as they happen so your insights stay accurate.',
            source: 'rules'
        };
    }

    const top = data.categories[0];
    const overBudget = data.budgets.items.filter(b => b.pct >= 100);
    const nearBudget = data.budgets.items.filter(b => b.pct >= 80 && b.pct < 100);
    const hotCredit = data.credit.filter(c => c.pct >= 70);
    const veryHotCredit = data.credit.filter(c => c.pct >= 90);
    const points = [];

    if (k.changePct !== null) {
        const direction = k.changePct >= 0 ? 'more' : 'less';
        points.push(`That is ${Math.abs(k.changePct)}% ${direction} than ${data.previousLabel} (${rupees(k.previousSpent)}).`);
    } else {
        points.push(`Nothing was spent ${data.previousLabel}, so there is nothing to compare with.`);
    }

    points.push(`${top.category} is your biggest area: ${rupees(top.total)}, which is ${top.share}% of spending.`);

    const mover = data.categories
        .filter(c => c.changePct !== null && c.changePct >= 30 && c.total - c.previousTotal > 0)
        .sort((a, b) => (b.total - b.previousTotal) - (a.total - a.previousTotal))[0];

    if (mover) points.push(`${mover.category} is up ${mover.changePct}% from ${data.previousLabel}.`);

    if (k.biggest && k.count >= 2) {
        points.push(`Your biggest single expense was ${rupees(k.biggest.amount)} on ${k.biggest.category}.`);
    }

    if (overBudget.length) {
        points.push(`Over budget this month: ${overBudget.map(b => b.category).join(', ')}.`);
    } else if (nearBudget.length) {
        points.push(`Close to the budget limit this month: ${nearBudget.map(b => b.category).join(', ')}.`);
    }

    if (hotCredit.length) {
        points.push(`${hotCredit.map(c => `${c.name} (${c.pct}% used)`).join(', ')}.`);
    }

    // Most important first: the list is cut to 6 below. Averages and
    // no-spend days are also on the key number tiles, so they go last.
    if (k.added > 0) {
        points.push(
            k.added >= k.spent
                ? `You added ${rupees(k.added)}, more than you spent.`
                : `You spent more than you added (added ${rupees(k.added)}).`
        );
    }

    if (data.loans.owedToMe > 0 || data.loans.iOwe > 0) {
        points.push(`Loans: ${rupees(data.loans.owedToMe)} owed to you, ${rupees(data.loans.iOwe)} you owe.`);
    }

    if (data.period !== 'day') {
        points.push(`You spend about ${rupees(k.avgPerDay)} per day on average.`);
    }

    if (k.noSpendDays > 0 && data.period !== 'day') {
        points.push(`${k.noSpendDays} of ${k.daysInRange} days had no spending.`);
    }

    let tip;

    if (overBudget.length) {
        tip = `${overBudget[0].category} has crossed its budget. Try to hold off on it for the rest of the month.`;
    } else if (veryHotCredit.length) {
        tip = `${veryHotCredit[0].name} is almost at its limit. Plan a repayment soon.`;
    } else if (k.changePct !== null && k.changePct >= 25) {
        tip = `Spending is rising. Start by looking at ${top.category}.`;
    } else if (top.share >= 50) {
        tip = `${top.category} is more than half of your spending. A small cut there goes a long way.`;
    } else if (!data.budgets.items.length && (data.period === 'month' || data.period === 'year')) {
        tip = 'Set category budgets so you get a warning before you overspend.';
    } else {
        tip = 'You are on a steady track. Keep logging expenses to keep it that way.';
    }

    let mood = 'good';

    if (overBudget.length || veryHotCredit.length || (k.changePct !== null && k.changePct >= 50)) {
        mood = 'alert';
    } else if (nearBudget.length || hotCredit.length || (k.changePct !== null && k.changePct >= 20)) {
        mood = 'watch';
    }

    return {
        headline: `You spent ${rupees(k.spent)} ${data.label}`,
        mood,
        points: points.slice(0, 6),
        tip,
        source: 'rules'
    };
}

module.exports = {
    getInsightData,
    buildFacts,
    buildFallbackInsight,
    internals: { percentChange, share, rupees, findPeak, cleanName }
};
