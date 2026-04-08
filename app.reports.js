/**
 * app.reports.js — Money Moves Report Dashboard
 * Transforms the Reports tab into an interactive analytics dashboard
 * with Chart.js visualizations, smart insights, and enhanced PDF export.
 *
 * Communicates with app.js via window.* globals:
 *   Reads:  window.bookings, window.expenses, window.otherIncome, window.artists,
 *           window.currentUser, window.getReportPeriodSelection, window.getReportPeriodData,
 *           window.filterByPeriod, window.SP_formatCurrencyFull
 *   Writes: window.renderMomentumDashboard, window.generateMomentumPDF
 */
(function () {
  'use strict';

  // ── CONSTANTS ────────────────────────────────────────────────────────────────
  const GOLD = '#EAB308';
  const GOLD_DIM = 'rgba(234,179,8,0.25)';
  const GREEN = '#22c55e';
  const RED = '#ef4444';
  const GLASS_BG = 'rgba(255,255,255,0.06)';
  const CHART_COLORS = [GOLD, '#60a5fa', GREEN, '#f97316', '#a78bfa', '#ec4899', '#14b8a6', '#f43f5e'];

  // ── HELPERS ───────────────────────────────────────────────────────────────────
  function fmtUGX(v) {
    const n = Math.round(Number(v) || 0);
    if (Math.abs(n) >= 1e9) return `UGX ${(n / 1e9).toFixed(1)}B`;
    if (Math.abs(n) >= 1e6) return `UGX ${(n / 1e6).toFixed(1)}M`;
    if (Math.abs(n) >= 1e3) return `UGX ${(n / 1e3).toFixed(0)}K`;
    return `UGX ${n.toLocaleString()}`;
  }

  function fmtPct(v) {
    const n = Number(v) || 0;
    const sign = n >= 0 ? '+' : '';
    return `${sign}${n.toFixed(1)}%`;
  }

  function monthKey(dateStr) {
    if (!dateStr) return null;
    const d = new Date(dateStr);
    if (isNaN(d)) return null;
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }

  function monthLabel(key) {
    if (!key) return '';
    const [y, m] = key.split('-');
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${months[Number(m) - 1]} ${y}`;
  }

  function escapeHTML(str) {
    const div = document.createElement('div');
    div.textContent = String(str ?? '');
    return div.innerHTML;
  }

  function formatDelta(value) {
    const n = Math.round(Number(value) || 0);
    const sign = n > 0 ? '+' : '';
    return `${sign}${n.toLocaleString()}`;
  }

  function fmtCompactCount(value) {
    const n = Math.round(Number(value) || 0);
    if (Math.abs(n) >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
    if (Math.abs(n) >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
    if (Math.abs(n) >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
    return `${n}`;
  }

  function getCurrentThemeMode() {
    if (document.body.classList.contains('light-theme')) return 'light';
    try {
      if (window.localStorage?.getItem('starPaperTheme') === 'light') return 'light';
    } catch (_e) { /* ignore */ }
    return 'dark';
  }

  function getCurrentReportArtistFilter() {
    const currentFilter = document.getElementById('spRptArtistFilter')?.value
      || document.getElementById('spPdfArtistSelect')?.value
      || '';
    return String(currentFilter || '').trim();
  }

  function getAudienceTrend(metrics, artistName, artistId) {
    if (!Array.isArray(metrics) || metrics.length === 0) return null;
    const normalizedName = String(artistName || '').trim().toLowerCase();
    const normalizedId = String(artistId || '').trim();
    const filtered = metrics.filter((entry) => {
      if (!entry || !entry.period) return false;
      if (normalizedId) return String(entry.artistId || '').trim() === normalizedId;
      if (normalizedName) return String(entry.artist || '').trim().toLowerCase() === normalizedName;
      return true;
    }).sort((a, b) => String(a.period || '').localeCompare(String(b.period || '')));

    if (filtered.length === 0) return null;
    const latest = filtered[filtered.length - 1];
    const prev = filtered.length > 1 ? filtered[filtered.length - 2] : null;
    const latestSocial = Math.round(Number(latest.socialFollowers) || 0);
    const latestSpotify = Math.round(Number(latest.spotifyListeners) || 0);
    const latestYouTube = Math.round(Number(latest.youtubeListeners) || 0);
    const prevSocial = prev ? Math.round(Number(prev.socialFollowers) || 0) : 0;
    const prevSpotify = prev ? Math.round(Number(prev.spotifyListeners) || 0) : 0;
    const prevYouTube = prev ? Math.round(Number(prev.youtubeListeners) || 0) : 0;

    return {
      latest,
      prev,
      deltas: prev ? {
        social: latestSocial - prevSocial,
        spotify: latestSpotify - prevSpotify,
        youtube: latestYouTube - prevYouTube,
      } : null,
      latestTotals: {
        social: latestSocial,
        spotify: latestSpotify,
        youtube: latestYouTube,
      }
    };
  }

  function buildPdfNextOnStage(bookings, artistName, maxItems = 3) {
    const allBookings = Array.isArray(bookings) ? bookings : [];
    const today = new Date().toISOString().slice(0, 10);
    const relevant = allBookings
      .filter((booking) => booking && booking.date)
      .filter((booking) => !artistName || booking.artist === artistName)
      .filter((booking) => String(booking.status || '').toLowerCase() !== 'cancelled');

    const future = relevant
      .filter((booking) => booking.date >= today)
      .sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')));
    if (future.length > 0) return future.slice(0, maxItems);

    return relevant
      .slice()
      .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))
      .slice(0, maxItems);
  }

  function buildPdfForecastBookings(bookings, artistName, anchorDateIso, maxDays = 31) {
    const allBookings = Array.isArray(bookings) ? bookings : [];
    const anchorDate = new Date(anchorDateIso || new Date().toISOString().slice(0, 10));
    if (Number.isNaN(anchorDate.getTime())) return [];
    const endDate = new Date(anchorDate);
    endDate.setDate(endDate.getDate() + Math.max(1, Number(maxDays) || 31));
    const startIso = anchorDate.toISOString().slice(0, 10);
    const endIso = endDate.toISOString().slice(0, 10);

    return allBookings
      .filter((booking) => booking && booking.date)
      .filter((booking) => !artistName || booking.artist === artistName)
      .filter((booking) => String(booking.status || '').toLowerCase() !== 'cancelled')
      .filter((booking) => booking.date > startIso && booking.date <= endIso)
      .sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')));
  }

  function getPdfRunTypeLabel(venueRows) {
    const rows = Array.isArray(venueRows) ? venueRows.filter(Boolean) : [];
    if (rows.length === 0) return 'No live routing';
    const lowerNames = rows.map((row) => String(row.location || '').toLowerCase());
    const hasAbroad = lowerNames.some((name) => ![
      'kampala', 'wakiso', 'mukono', 'entebbe', 'jinja', 'mbale', 'gulu', 'lira', 'mbarara',
      'fort portal', 'masaka', 'hoima', 'soroti', 'kabale', 'arua', 'busia', 'tororo'
    ].includes(name));
    if (hasAbroad) return rows.length > 1 ? 'International Multi-City' : 'International Spotlight';
    if (rows.length > 1) return 'Regional Multi-City';
    return 'Single-City Run';
  }

  // ── DATA COMPUTATION ─────────────────────────────────────────────────────────

  function computeMetrics(data, prevData) {
    const { filteredBookings, filteredExpenses, filteredOtherIncome,
            totalIncome, totalExpenses, totalOtherIncome, netProfit, balancesDue } = data;

    const totalBookings = filteredBookings.length;
    const grossIncome = totalIncome + totalOtherIncome;
    const profitMargin = grossIncome > 0 ? (netProfit / grossIncome) * 100 : 0;
    const avgPerShow = totalBookings > 0 ? Math.round(totalIncome / totalBookings) : 0;
    const revenuePerBooking = totalBookings > 0 ? Math.round(grossIncome / totalBookings) : 0;

    // Trend vs previous period
    const prevNet = prevData ? prevData.netProfit : 0;
    const trendPct = prevNet !== 0 ? ((netProfit - prevNet) / Math.abs(prevNet)) * 100 : (netProfit > 0 ? 100 : 0);

    // Status breakdown
    const statusCounts = {};
    filteredBookings.forEach(b => {
      const s = (b.status || 'pending').toLowerCase();
      statusCounts[s] = (statusCounts[s] || 0) + 1;
    });
    const pendingCount = statusCounts.pending || 0;
    const confirmedCount = statusCounts.confirmed || 0;

    const totalCapacity = filteredBookings.reduce((sum, b) => sum + Math.max(0, Math.round(Number(b.capacity) || 0)), 0);
    const avgCapacity = totalBookings > 0 ? Math.round(totalCapacity / totalBookings) : 0;
    const revenuePerSeat = totalCapacity > 0 ? Math.round(totalIncome / totalCapacity) : 0;

    // Expense categories
    const expenseByCat = {};
    filteredExpenses.forEach(e => {
      const cat = e.category || 'other';
      expenseByCat[cat] = (expenseByCat[cat] || 0) + Math.round(Number(e.amount) || 0);
    });

    // Monthly trend
    const monthlyRevenue = {};
    const monthlyExpenses = {};
    filteredBookings.forEach(b => {
      const mk = monthKey(b.date);
      if (mk) monthlyRevenue[mk] = (monthlyRevenue[mk] || 0) + Math.round(Number(b.fee) || 0);
    });
    filteredOtherIncome.forEach(i => {
      const mk = monthKey(i.date);
      if (mk) monthlyRevenue[mk] = (monthlyRevenue[mk] || 0) + Math.round(Number(i.amount) || 0);
    });
    filteredExpenses.forEach(e => {
      const mk = monthKey(e.date);
      if (mk) monthlyExpenses[mk] = (monthlyExpenses[mk] || 0) + Math.round(Number(e.amount) || 0);
    });
    const allMonths = [...new Set([...Object.keys(monthlyRevenue), ...Object.keys(monthlyExpenses)])].sort();

    // Top city/venue
    const venueCounts = {};
    const venueRevenue = {};
    filteredBookings.forEach(b => {
      const loc = b.location || 'Unknown';
      venueCounts[loc] = (venueCounts[loc] || 0) + 1;
      venueRevenue[loc] = (venueRevenue[loc] || 0) + Math.round(Number(b.fee) || 0);
    });
    const topCity = Object.entries(venueRevenue).sort((a, b) => b[1] - a[1])[0];

    // Best month
    const bestMonth = Object.entries(monthlyRevenue).sort((a, b) => b[1] - a[1])[0];

    // Show performance table data (per location)
    const showPerf = Object.keys(venueCounts).map(loc => {
      const rev = venueRevenue[loc] || 0;
      const shows = venueCounts[loc] || 0;
      // Estimate cost per show (total expenses / total bookings * shows at this venue)
      const costPerShow = filteredBookings.length > 0
        ? Math.round(totalExpenses / filteredBookings.length)
        : 0;
      const totalCost = costPerShow * shows;
      const profit = rev - totalCost;
      const roi = totalCost > 0 ? ((profit / totalCost) * 100) : 0;
      return { location: loc, shows, revenue: rev, cost: totalCost, profit, roi };
    }).sort((a, b) => b.profit - a.profit);

    // Biggest expense driver
    const biggestExpense = Object.entries(expenseByCat).sort((a, b) => b[1] - a[1])[0];
    const biggestExpensePct = biggestExpense && totalExpenses > 0
      ? Math.round((biggestExpense[1] / totalExpenses) * 100)
      : 0;

    return {
      grossIncome, netProfit, totalIncome, totalExpenses, totalOtherIncome,
      profitMargin, avgPerShow, revenuePerBooking, balancesDue,
      trendPct, statusCounts, expenseByCat, showPerf,
      monthlyRevenue, monthlyExpenses, allMonths,
      topCity, bestMonth, biggestExpense, biggestExpensePct,
      totalBookings,
      pendingCount,
      confirmedCount,
      totalCapacity,
      avgCapacity,
      revenuePerSeat,
      filteredBookings, filteredExpenses, filteredOtherIncome,
    };
  }

  function generateInsights(m, ctx = {}) {
    const insights = [];
    if (m.topCity) {
      const pct = m.grossIncome > 0 ? Math.round((m.topCity[1] / m.grossIncome) * 100) : 0;
      insights.push(`${m.topCity[0]} drives ${pct}% of revenue`);
    }
    if (m.trendPct > 10) insights.push(`Momentum up ${fmtPct(m.trendPct)} vs last period`);
    if (m.trendPct < -10) insights.push(`Revenue dipped ${fmtPct(m.trendPct)} — investigate costs`);
    if (m.biggestExpense && m.biggestExpensePct > 40) {
      insights.push(`${m.biggestExpense[0]} is ${m.biggestExpensePct}% of spend — negotiate rates`);
    }
    if (m.profitMargin > 30) insights.push('Healthy margin above 30% — reinvest in growth');
    if (m.profitMargin < 10 && m.profitMargin >= 0) insights.push('Thin margin under 10% — cut non-essential costs');
    if (m.avgPerShow > 0 && m.showPerf.length > 1) {
      const best = m.showPerf[0];
      insights.push(`${best.location} is your highest-ROI venue`);
    }
    if (m.pendingCount > 0 && m.totalBookings > 0 && (m.pendingCount / m.totalBookings) >= 0.5) {
      insights.push('Most bookings are still pending — push confirmations');
    }
    if (m.revenuePerSeat > 0) {
      insights.push(`Avg revenue per capacity seat: ${fmtUGX(m.revenuePerSeat)}`);
    }

    const audienceTrend = ctx.audienceTrend;
    if (audienceTrend && audienceTrend.deltas) {
      const { social, spotify, youtube } = audienceTrend.deltas;
      if (social !== 0) insights.push(`Social followers ${formatDelta(social)} since last month`);
      if (spotify !== 0) insights.push(`Spotify listeners ${formatDelta(spotify)} since last month`);
      if (youtube !== 0) insights.push(`YouTube listeners ${formatDelta(youtube)} since last month`);
    } else if (audienceTrend && audienceTrend.latestTotals) {
      const totals = audienceTrend.latestTotals;
      insights.push(`Audience snapshot: ${totals.social.toLocaleString()} followers`);
    } else if (ctx.wantAudiencePrompt) {
      insights.push('Add audience metrics to unlock growth insights');
    }

    if (ctx.strategicGoalMissing) {
      insights.push('Strategic goal missing — set one to guide next moves');
    }
    return insights.length > 0 ? insights : ['Add more data to unlock insights'];
  }

  function generateRecommendations(m, ctx = {}) {
    const recs = [];
    if (m.biggestExpense && m.biggestExpensePct > 35) {
      recs.push({ icon: 'ph-scissors', text: `Cut ${m.biggestExpense[0]} costs by 15% to save ${fmtUGX(m.biggestExpense[1] * 0.15)}` });
    }
    if (m.showPerf.length > 1) {
      const best = m.showPerf[0];
      recs.push({ icon: 'ph-map-pin', text: `Double down on ${best.location} — highest ROI at ${best.roi.toFixed(0)}%` });
    }
    if (m.balancesDue > 0) {
      recs.push({ icon: 'ph-money', text: `Collect ${fmtUGX(m.balancesDue)} in outstanding balances` });
    }
    if (m.totalBookings > 3 && m.profitMargin < 20) {
      recs.push({ icon: 'ph-trend-up', text: 'Raise minimum booking fee by 10% next quarter' });
    }
    if (ctx.upcomingShows && ctx.upcomingShows.some(show => !show.capacity || Number(show.capacity) === 0)) {
      recs.push({ icon: 'ph-users', text: 'Add capacity estimates to upcoming shows for better planning' });
    }
    if (ctx.strategicGoalMissing) {
      recs.push({ icon: 'ph-target', text: `Define a strategic goal for ${ctx.artistName || 'your roster'}` });
    }
    const audienceTrend = ctx.audienceTrend;
    if (audienceTrend && audienceTrend.deltas) {
      const negatives = Object.entries(audienceTrend.deltas).filter(([, value]) => value < 0);
      if (negatives.length > 0) {
        recs.push({ icon: 'ph-lightning', text: 'Run a growth push on the channels that dipped last month' });
      }
    }
    if (recs.length === 0) {
      recs.push({ icon: 'ph-star', text: 'Keep building your portfolio — more data unlocks better insights' });
    }
    return recs;
  }

  function buildPdfVenuePerformance(bookings, totalExpenses) {
    const allBookings = Array.isArray(bookings) ? bookings : [];
    const revenueByLocation = {};
    const showsByLocation = {};

    allBookings.forEach((booking) => {
      const location = String(booking?.location || '').trim() || 'Unknown';
      const fee = Math.round(Number(booking?.fee) || 0);
      revenueByLocation[location] = (revenueByLocation[location] || 0) + fee;
      showsByLocation[location] = (showsByLocation[location] || 0) + 1;
    });

    const totalRevenue = Object.values(revenueByLocation).reduce((sum, value) => sum + value, 0);
    return Object.keys(revenueByLocation).map((location) => {
      const revenue = revenueByLocation[location] || 0;
      const shows = showsByLocation[location] || 0;
      const cost = totalRevenue > 0
        ? Math.round((revenue / totalRevenue) * Math.round(Number(totalExpenses) || 0))
        : 0;
      const profit = revenue - cost;
      const roi = cost > 0 ? (profit / cost) * 100 : 0;
      return { location, shows, revenue, cost, profit, roi };
    }).sort((a, b) => b.revenue - a.revenue);
  }

  function sortTransactionsForPdf(transactions) {
    const typeRank = { Booking: 0, Income: 1, Expense: 2 };
    return [...(Array.isArray(transactions) ? transactions : [])].sort((a, b) => {
      const amountDiff = (Number(b.amount) || 0) - (Number(a.amount) || 0);
      if (amountDiff !== 0) return amountDiff;
      const typeDiff = (typeRank[a.type] ?? 99) - (typeRank[b.type] ?? 99);
      if (typeDiff !== 0) return typeDiff;
      return String(a.desc || '').localeCompare(String(b.desc || ''));
    });
  }

  function buildPdfStrategyNotes(m, ctx = {}, closingThoughts = '', venueRows = []) {
    const notes = [];
    const totalBookingRevenue = Math.round(Number(m.totalIncome) || 0);
    const totalShows = Math.max(0, Math.round(Number(m.totalBookings) || 0));
    const topVenue = venueRows[0] || null;
    const secondVenue = venueRows[1] || null;
    const monthlyGoal = Math.round(Number(ctx.monthlyGoal) || 0);

    if (monthlyGoal > 0) {
      const achievedRevenue = totalBookingRevenue;
      const goalPct = monthlyGoal > 0 ? (achievedRevenue / monthlyGoal) * 100 : 0;
      const goalGap = achievedRevenue - monthlyGoal;
      if (goalGap >= 0) {
        notes.push(
          `Revenue landed at ${fmtPct(goalPct)} of the ${fmtUGX(monthlyGoal)} goal, beating target by ${fmtUGX(goalGap)}. Push the next target higher while protecting margin.`
        );
      } else {
        notes.push(
          `Revenue landed at ${fmtPct(goalPct)} of the ${fmtUGX(monthlyGoal)} goal, leaving ${fmtUGX(Math.abs(goalGap))} to recover next cycle. Focus on closing the gap with higher-value bookings and faster confirmations.`
        );
      }
    }

    if (topVenue && totalBookingRevenue > 0 && totalShows > 0) {
      const topShare = Math.round((topVenue.revenue / totalBookingRevenue) * 100);
      if (secondVenue) {
        const secondShare = Math.round((secondVenue.revenue / totalBookingRevenue) * 100);
        notes.push(
          `${topVenue.location} carries ${topShare}% of booking revenue with ${topVenue.shows} of ${totalShows} shows; ${secondVenue.location} adds ${secondVenue.shows} show${secondVenue.shows === 1 ? '' : 's'} and ${secondShare}% of booking revenue.`
        );
      } else {
        notes.push(`${topVenue.location} carries ${topShare}% of booking revenue across ${topVenue.shows} shows this cycle.`);
      }
    }

    if (m.totalBookings > 0 && totalBookingRevenue > 0) {
      const avgBookingValue = Math.round(totalBookingRevenue / m.totalBookings);
      const topThreeShare = Math.round(
        ((m.filteredBookings || [])
          .map((booking) => Math.round(Number(booking?.fee) || 0))
          .sort((a, b) => b - a)
          .slice(0, 3)
          .reduce((sum, value) => sum + value, 0) / totalBookingRevenue) * 100
      );
      notes.push(`Average booking value sits at ${fmtUGX(avgBookingValue)} and the top 3 bookings deliver ${topThreeShare}% of booking revenue.`);
    }

    const cashSurplus = Math.round((Number(m.totalIncome) || 0) + (Number(m.totalOtherIncome) || 0) - (Number(m.totalExpenses) || 0));
    if (cashSurplus !== 0) {
      notes.push(`Bookings plus other income produced ${fmtUGX(cashSurplus)} above operating spend this cycle.`);
    }

    if (m.biggestExpense) {
      notes.push(`Recurring ${m.biggestExpense[0]}, visuals, and team-support costs should be capped into monthly budgets to protect margin.`);
    }

    const audienceTrend = ctx.audienceTrend;
    if (audienceTrend?.latestTotals?.social) {
      notes.push(`Audience snapshot: ${audienceTrend.latestTotals.social.toLocaleString()} followers.`);
    }

    const closingBalance = Math.round(Number(ctx.closingBalance) || 0);
    if (closingBalance > 0) {
      notes.push(`Use the ${fmtUGX(closingBalance)} closing balance to fund rollout and regional promotion without straining cash flow.`);
    }

    const strategicGoal = String(ctx.strategicGoal || '').trim();
    if (strategicGoal) {
      strategicGoal
        .split(/\r?\n|[;•]+/)
        .map((line) => String(line || '').trim())
        .filter(Boolean)
        .forEach((line) => notes.push(line));
    } else if (ctx.strategicGoalMissing) {
      notes.push('Set a clear strategic goal to guide the next cycle.');
    }

    String(closingThoughts || '')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .forEach((line) => notes.push(line));

    return [...new Set(notes)].slice(0, 8);
  }

  // ── CHART MANAGEMENT ─────────────────────────────────────────────────────────
  const _charts = {};
  let reportFocusState = null;

  function destroyChart(id) {
    if (_charts[id]) { _charts[id].destroy(); delete _charts[id]; }
  }

  function setReportFocus(title, lines = []) {
    reportFocusState = { title, lines };
    updateReportFocusPanel();
  }

  function updateReportFocusPanel() {
    const panel = document.getElementById('spRptFocus');
    if (!panel) return;
    const titleEl = panel.querySelector('.sp-rpt-focus__title');
    const bodyEl = panel.querySelector('.sp-rpt-focus__body');
    const fallback = {
      title: 'Interactive Focus',
      lines: ['Click any chart point or venue row to explore the details here.']
    };
    const state = reportFocusState || fallback;
    if (titleEl) titleEl.textContent = state.title || fallback.title;
    if (bodyEl) {
      bodyEl.innerHTML = (state.lines || fallback.lines).map(line => `<div>${escapeHTML(line)}</div>`).join('');
    }
  }

  function darkChartDefaults() {
    return {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 600 },
      plugins: {
        legend: {
          labels: { color: '#ccc', font: { size: 11 }, usePointStyle: true, padding: 12 }
        },
        tooltip: {
          backgroundColor: 'rgba(0,0,0,0.85)',
          titleColor: GOLD,
          bodyColor: '#fff',
          borderColor: 'rgba(255,255,255,0.1)',
          borderWidth: 1,
          cornerRadius: 8,
          padding: 10,
        }
      }
    };
  }

  function renderMomentumChart(m) {
    const canvas = document.getElementById('spMomentumChart');
    if (!canvas || !window.Chart) return;
    destroyChart('momentum');
    const labels = m.allMonths.map(monthLabel);
    const revData = m.allMonths.map(k => m.monthlyRevenue[k] || 0);
    const expData = m.allMonths.map(k => m.monthlyExpenses[k] || 0);
    const profitData = m.allMonths.map((k, i) => revData[i] - expData[i]);

    _charts.momentum = new Chart(canvas, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: 'Revenue',
            data: revData,
            borderColor: GOLD,
            backgroundColor: GOLD_DIM,
            fill: true,
            tension: 0.4,
            borderWidth: 2,
            pointRadius: 3,
            pointHoverRadius: 6,
          },
          {
            label: 'Expenses',
            data: expData,
            borderColor: RED,
            backgroundColor: 'rgba(239,68,68,0.1)',
            fill: false,
            tension: 0.4,
            borderWidth: 2,
            borderDash: [5, 3],
            pointRadius: 2,
          },
          {
            label: 'Net Profit',
            data: profitData,
            borderColor: GREEN,
            backgroundColor: 'rgba(34,197,94,0.15)',
            fill: true,
            tension: 0.4,
            borderWidth: 2,
            pointRadius: 3,
          }
        ]
      },
      options: {
        ...darkChartDefaults(),
        onClick: (_evt, elements) => {
          if (!elements || elements.length === 0) return;
          const idx = elements[0].index;
          const label = labels[idx] || 'Month';
          const rev = revData[idx] || 0;
          const exp = expData[idx] || 0;
          const net = profitData[idx] || 0;
          setReportFocus(`Momentum: ${label}`, [
            `Revenue: ${fmtUGX(rev)}`,
            `Expenses: ${fmtUGX(exp)}`,
            `Net: ${fmtUGX(net)}`
          ]);
        },
        scales: {
          x: { ticks: { color: '#888' }, grid: { color: 'rgba(255,255,255,0.05)' } },
          y: {
            ticks: { color: '#888', callback: v => fmtUGX(v) },
            grid: { color: 'rgba(255,255,255,0.05)' }
          }
        }
      }
    });
  }

  function renderCostDoughnut(m) {
    const canvas = document.getElementById('spCostDoughnut');
    if (!canvas || !window.Chart) return;
    destroyChart('cost');
    const entries = Object.entries(m.expenseByCat).sort((a, b) => b[1] - a[1]).slice(0, 6);
    if (entries.length === 0) return;
    const labels = entries.map(e => e[0]);
    const values = entries.map(e => e[1]);
    _charts.cost = new Chart(canvas, {
      type: 'doughnut',
      data: {
        labels,
        datasets: [{
          data: values,
          backgroundColor: CHART_COLORS.slice(0, entries.length).map(c => c + 'CC'),
          borderColor: 'rgba(0,0,0,0.3)',
          borderWidth: 2,
        }]
      },
      options: {
        ...darkChartDefaults(),
        onClick: (_evt, elements) => {
          if (!elements || elements.length === 0) return;
          const idx = elements[0].index;
          const label = labels[idx] || 'Category';
          const value = values[idx] || 0;
          const total = values.reduce((a, b) => a + b, 0);
          const pct = total > 0 ? ((value / total) * 100).toFixed(1) : '0.0';
          setReportFocus(`Cost Breakdown: ${label}`, [
            `Spend: ${fmtUGX(value)}`,
            `Share of expenses: ${pct}%`
          ]);
        },
        cutout: '62%',
        plugins: {
          ...darkChartDefaults().plugins,
          tooltip: {
            ...darkChartDefaults().plugins.tooltip,
            callbacks: {
              label: function (ctx) {
                const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
                const pct = total > 0 ? ((ctx.parsed / total) * 100).toFixed(1) : '0';
                return `${ctx.label}: ${fmtUGX(ctx.parsed)} (${pct}%)`;
              }
            }
          }
        }
      }
    });
  }

  function renderStatusPie(m) {
    const canvas = document.getElementById('spStatusPie');
    if (!canvas || !window.Chart) return;
    destroyChart('status');
    const entries = Object.entries(m.statusCounts);
    if (entries.length === 0) return;
    const labels = entries.map(e => e[0]);
    const values = entries.map(e => e[1]);
    const statusColors = { confirmed: GREEN, pending: GOLD, completed: '#60a5fa', cancelled: RED };
    _charts.status = new Chart(canvas, {
      type: 'doughnut',
      data: {
        labels,
        datasets: [{
          data: values,
          backgroundColor: entries.map(e => (statusColors[e[0]] || '#888') + 'CC'),
          borderColor: 'rgba(0,0,0,0.3)',
          borderWidth: 2,
        }]
      },
      options: {
        ...darkChartDefaults(),
        onClick: (_evt, elements) => {
          if (!elements || elements.length === 0) return;
          const idx = elements[0].index;
          const label = labels[idx] || 'Status';
          const value = values[idx] || 0;
          setReportFocus(`Booking Status: ${label}`, [
            `${value} booking${value === 1 ? '' : 's'} marked ${label}`
          ]);
        },
        cutout: '55%',
      }
    });
  }

  // ── RENDER DASHBOARD ─────────────────────────────────────────────────────────

  function renderDashboard() {
    const container = document.getElementById('spMomentumDashboard');
    if (!container) return;
    const previousArtistFilter = document.getElementById('spRptArtistFilter')?.value || '';

    // Get period data
    const getPeriod = window.getReportPeriodSelection || (() => ({ period: 'month', periodLabel: new Date().toLocaleString('en-US', { month: 'long', year: 'numeric' }) }));
    const getData = window.getReportPeriodData || (() => ({
      filteredBookings: [], filteredExpenses: [], filteredOtherIncome: [],
      totalIncome: 0, totalExpenses: 0, totalOtherIncome: 0, netProfit: 0, balancesDue: 0, totalBookings: 0
    }));

    const { period, periodLabel } = getPeriod();
    let data = getData(period, { sortNewestFirst: true });

    // Previous period data for trend
    const prevPeriodMap = { month: 'prevMonth', year: 'prevYear', quarter: 'all', prevMonth: 'month', prevYear: 'year', all: 'all' };
    const prevPeriod = prevPeriodMap[period] || 'all';
    const prevData = getData(prevPeriod, { sortNewestFirst: false });

    // Artist filter
    const artists = Array.isArray(window.artists) ? window.artists : [];
    const selectedArtist = artists.some(a => a.name === previousArtistFilter) ? previousArtistFilter : '';
    if (selectedArtist) {
      const fb = data.filteredBookings.filter(b => b.artist === selectedArtist);
      const totalIncome = fb.reduce((s, b) => s + Math.round(Number(b.fee) || 0), 0);
      const balancesDue = fb.reduce((s, b) => s + Math.max(0, Math.round((Number(b.fee) || 0) - (Number(b.deposit) || 0))), 0);
      data = {
        ...data,
        filteredBookings: fb,
        totalIncome,
        totalBookings: fb.length,
        netProfit: totalIncome + data.totalOtherIncome - data.totalExpenses,
        balancesDue,
      };
    }

    const m = computeMetrics(data, prevData);
    const artistOptions = artists.map(a => {
      const name = escapeHTML(a.name);
      const selectedAttr = a.name === selectedArtist ? ' selected' : '';
      return `<option value="${name}"${selectedAttr}>${name}</option>`;
    }).join('');
    const artistObj = selectedArtist ? artists.find(a => a.name === selectedArtist) : null;
    const audienceTrend = getAudienceTrend(Array.isArray(window.audienceMetrics) ? window.audienceMetrics : [], selectedArtist, artistObj?.id);
    const upcomingShows = (Array.isArray(window.bookings) ? window.bookings : [])
      .filter(b => b && b.date)
      .filter(b => b.status !== 'cancelled')
      .filter(b => !selectedArtist || b.artist === selectedArtist)
      .filter(b => b.date >= new Date().toISOString().slice(0, 10))
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(0, 4);
    const ctx = {
      audienceTrend,
      upcomingShows,
      strategicGoalMissing: Boolean(selectedArtist && !artistObj?.strategicGoal?.trim()),
      artistName: selectedArtist,
      wantAudiencePrompt: true
    };
    const insights = generateInsights(m, ctx);
    const recs = generateRecommendations(m, ctx);

    const trendIcon = m.trendPct >= 0 ? 'ph-trend-up' : 'ph-trend-down';
    const trendColor = m.trendPct >= 0 ? GREEN : RED;

    const artistDisplay = (selectedArtist || 'Roster').toUpperCase();
    const reportTitle = `MONEY MOVES: ${escapeHTML(artistDisplay)}`;
    container.innerHTML = `
      <!-- HERO BLOCK -->
      <div class="sp-rpt-hero">
        <div class="sp-rpt-hero__left">
          <div class="sp-rpt-hero__badge">${escapeHTML(periodLabel)}</div>
          <h2 class="sp-rpt-hero__title">${reportTitle}</h2>
          <p class="sp-rpt-hero__subtitle">${escapeHTML(window.currentUser || 'Manager')}</p>
        </div>
        <div class="sp-rpt-hero__center">
          <div class="sp-rpt-hero__profit">${fmtUGX(m.netProfit)}</div>
          <div class="sp-rpt-hero__trend" style="color:${trendColor}">
            <i class="ph ${trendIcon}" aria-hidden="true"></i> ${fmtPct(m.trendPct)} vs previous
          </div>
        </div>
        <div class="sp-rpt-hero__filter">
          <select id="spRptArtistFilter" onchange="window.renderMomentumDashboard()">
            <option value="">All Artists</option>
            ${artistOptions}
          </select>
        </div>
      </div>

      <!-- INSIGHT STRIP -->
      <div class="sp-rpt-insights">
        ${insights.map(i => `<span class="sp-rpt-insight-chip"><i class="ph ph-lightning" aria-hidden="true"></i> ${escapeHTML(i)}</span>`).join('')}
      </div>

      <!-- KPI CARDS -->
      <div class="sp-rpt-kpis">
        <div class="sp-rpt-kpi sp-haptic">
          <div class="sp-rpt-kpi__label">Gross Income</div>
          <div class="sp-rpt-kpi__value" style="color:${GREEN}">${fmtUGX(m.grossIncome)}</div>
          <div class="sp-rpt-kpi__sub">${m.totalBookings} bookings</div>
        </div>
        <div class="sp-rpt-kpi sp-haptic">
          <div class="sp-rpt-kpi__label">Expenses</div>
          <div class="sp-rpt-kpi__value" style="color:${RED}">${fmtUGX(m.totalExpenses)}</div>
          <div class="sp-rpt-kpi__sub">${Object.keys(m.expenseByCat).length} categories</div>
        </div>
        <div class="sp-rpt-kpi sp-haptic">
          <div class="sp-rpt-kpi__label">Profit Margin</div>
          <div class="sp-rpt-kpi__value" style="color:${m.profitMargin >= 20 ? GREEN : m.profitMargin >= 0 ? GOLD : RED}">${m.profitMargin.toFixed(1)}%</div>
          <div class="sp-rpt-kpi__sub">${m.profitMargin >= 20 ? 'Healthy' : m.profitMargin >= 0 ? 'Watch' : 'Loss'}</div>
        </div>
        <div class="sp-rpt-kpi sp-haptic">
          <div class="sp-rpt-kpi__label">Avg Per Show</div>
          <div class="sp-rpt-kpi__value">${fmtUGX(m.avgPerShow)}</div>
          <div class="sp-rpt-kpi__sub">per booking</div>
        </div>
        <div class="sp-rpt-kpi sp-haptic">
          <div class="sp-rpt-kpi__label">Balances Due</div>
          <div class="sp-rpt-kpi__value" style="color:${m.balancesDue > 0 ? RED : GREEN}">${fmtUGX(m.balancesDue)}</div>
          <div class="sp-rpt-kpi__sub">outstanding</div>
        </div>
      </div>

      <!-- CHARTS ROW -->
      <div class="sp-rpt-charts">
        <div class="sp-rpt-chart-card sp-haptic">
          <h4 class="sp-rpt-chart-title"><i class="ph ph-chart-line-up" aria-hidden="true"></i> Revenue Momentum</h4>
          <div class="sp-rpt-chart-wrap"><canvas id="spMomentumChart"></canvas></div>
        </div>
        <div class="sp-rpt-chart-card sp-haptic">
          <h4 class="sp-rpt-chart-title"><i class="ph ph-chart-pie-slice" aria-hidden="true"></i> Cost Breakdown</h4>
          <div class="sp-rpt-chart-wrap sp-rpt-chart-wrap--sm"><canvas id="spCostDoughnut"></canvas></div>
        </div>
        <div class="sp-rpt-chart-card sp-haptic">
          <h4 class="sp-rpt-chart-title"><i class="ph ph-chart-donut" aria-hidden="true"></i> Booking Status</h4>
          <div class="sp-rpt-chart-wrap sp-rpt-chart-wrap--sm"><canvas id="spStatusPie"></canvas></div>
        </div>
      </div>

      <!-- INTERACTIVE FOCUS -->
      <div class="sp-rpt-focus sp-haptic" id="spRptFocus">
        <div class="sp-rpt-focus__label">Insight Focus</div>
        <div class="sp-rpt-focus__title">Interactive Focus</div>
        <div class="sp-rpt-focus__body"></div>
      </div>

      <!-- SHOW PERFORMANCE TABLE -->
      <div class="sp-rpt-table-card sp-haptic">
        <h4 class="sp-rpt-chart-title"><i class="ph ph-ranking" aria-hidden="true"></i> Show Performance by Venue</h4>
        <div class="sp-rpt-table-wrap">
          <table class="sp-rpt-table">
            <thead>
              <tr>
                <th>Venue / City</th>
                <th class="sp-rpt-num">Shows</th>
                <th class="sp-rpt-num">Revenue</th>
                <th class="sp-rpt-num">Est. Cost</th>
                <th class="sp-rpt-num">Profit</th>
                <th class="sp-rpt-num">ROI %</th>
              </tr>
            </thead>
            <tbody>
              ${m.showPerf.length > 0 ? m.showPerf.map(r => `
                <tr class="sp-rpt-row" tabindex="0" role="button"
                    data-venue="${escapeHTML(r.location)}"
                    data-revenue="${r.revenue}"
                    data-cost="${r.cost}"
                    data-profit="${r.profit}"
                    data-roi="${r.roi}"
                    data-shows="${r.shows}">
                  <td>${escapeHTML(r.location)}</td>
                  <td class="sp-rpt-num">${r.shows}</td>
                  <td class="sp-rpt-num">${fmtUGX(r.revenue)}</td>
                  <td class="sp-rpt-num">${fmtUGX(r.cost)}</td>
                  <td class="sp-rpt-num" style="color:${r.profit >= 0 ? GREEN : RED}">${fmtUGX(r.profit)}</td>
                  <td class="sp-rpt-num" style="color:${r.roi >= 0 ? GREEN : RED}">${r.roi.toFixed(0)}%</td>
                </tr>
              `).join('') : '<tr><td colspan="6" style="text-align:center;color:#888">No venue data yet</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>

      <!-- ACHIEVEMENTS + RECOMMENDATIONS -->
      <div class="sp-rpt-bottom-row">
        <div class="sp-rpt-achievements sp-haptic">
          <h4 class="sp-rpt-chart-title"><i class="ph-duotone ph-trophy" aria-hidden="true"></i> Achievements</h4>
          <div class="sp-rpt-badge-list">
            ${m.bestMonth ? `<div class="sp-rpt-badge"><i class="ph-duotone ph-star" style="color:${GOLD}"></i> Best Month: ${monthLabel(m.bestMonth[0])} (${fmtUGX(m.bestMonth[1])})</div>` : ''}
            ${m.topCity ? `<div class="sp-rpt-badge"><i class="ph-duotone ph-map-pin" style="color:${GREEN}"></i> Top City: ${escapeHTML(m.topCity[0])}</div>` : ''}
            ${m.totalBookings >= 10 ? `<div class="sp-rpt-badge"><i class="ph-duotone ph-fire" style="color:#f97316"></i> ${m.totalBookings} Shows Booked</div>` : ''}
            ${m.profitMargin >= 30 ? `<div class="sp-rpt-badge"><i class="ph-duotone ph-rocket" style="color:${GOLD}"></i> 30%+ Profit Margin</div>` : ''}
            ${(!m.bestMonth && !m.topCity) ? '<div class="sp-rpt-badge" style="color:#888"><i class="ph ph-info"></i> Keep adding data to unlock achievements</div>' : ''}
          </div>
        </div>
        <div class="sp-rpt-recs sp-haptic">
          <h4 class="sp-rpt-chart-title"><i class="ph ph-lightbulb" aria-hidden="true"></i> Smart Recommendations</h4>
          <div class="sp-rpt-rec-list">
            ${recs.map(r => `<div class="sp-rpt-rec"><i class="ph ${r.icon}" style="color:${GOLD}"></i> ${escapeHTML(r.text)}</div>`).join('')}
          </div>
        </div>
      </div>

      <!-- COLLAPSIBLE LEDGER -->
      <details class="sp-rpt-ledger">
        <summary class="sp-rpt-ledger__toggle"><i class="ph ph-list-dashes" aria-hidden="true"></i> Transaction Ledger (${m.filteredBookings.length + m.filteredExpenses.length + m.filteredOtherIncome.length} entries)</summary>
        <div class="sp-rpt-ledger__body">
          ${renderLedgerHTML(m)}
        </div>
      </details>
    `;

    // Render charts after DOM is in place
    requestAnimationFrame(() => {
      renderMomentumChart(m);
      renderCostDoughnut(m);
      renderStatusPie(m);
      updateReportFocusPanel();
      wireReportRowInteractions();
    });
  }

  function wireReportRowInteractions() {
    const rows = document.querySelectorAll('.sp-rpt-row');
    if (!rows.length) return;
    rows.forEach((row) => {
      const handler = () => {
        const venue = row.dataset.venue || 'Venue';
        const revenue = fmtUGX(row.dataset.revenue || 0);
        const cost = fmtUGX(row.dataset.cost || 0);
        const profit = fmtUGX(row.dataset.profit || 0);
        const roi = row.dataset.roi || 0;
        const shows = row.dataset.shows || 0;
        setReportFocus(`Venue Spotlight: ${venue}`, [
          `${shows} show${Number(shows) === 1 ? '' : 's'} | Revenue ${revenue}`,
          `Cost ${cost} | Profit ${profit} | ROI ${Number(roi).toFixed(0)}%`
        ]);
      };
      row.addEventListener('click', handler);
      row.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        handler();
      });
    });
  }

  function renderLedgerHTML(m) {
    const all = [
      ...m.filteredBookings.map(b => ({ type: 'Booking', date: b.date, desc: b.event || b.artist || '', amount: Math.round(Number(b.fee) || 0), sign: '+' })),
      ...m.filteredExpenses.map(e => ({ type: 'Expense', date: e.date, desc: e.description || e.category || '', amount: Math.round(Number(e.amount) || 0), sign: '-' })),
      ...m.filteredOtherIncome.map(i => ({ type: 'Income', date: i.date, desc: i.source || i.type || '', amount: Math.round(Number(i.amount) || 0), sign: '+' })),
    ].sort((a, b) => new Date(b.date) - new Date(a.date));

    if (all.length === 0) return '<p style="color:#888;text-align:center;padding:16px">No transactions in this period</p>';

    const rows = all.slice(0, 100).map(t => {
      const color = t.sign === '+' ? GREEN : RED;
      const fmtDate = t.date ? new Date(t.date).toLocaleDateString('en-GB') : '—';
      return `<tr>
        <td>${fmtDate}</td>
        <td><span class="sp-rpt-ledger-type sp-rpt-ledger-type--${t.type.toLowerCase()}">${t.type}</span></td>
        <td>${escapeHTML(t.desc)}</td>
        <td class="sp-rpt-num" style="color:${color}">${t.sign}${fmtUGX(t.amount).replace('UGX ', '')}</td>
      </tr>`;
    }).join('');

    return `<table class="sp-rpt-table sp-rpt-table--ledger">
      <thead><tr><th>Date</th><th>Type</th><th>Description</th><th class="sp-rpt-num">Amount</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>${all.length > 100 ? '<p style="color:#888;text-align:center;font-size:12px">Showing first 100 of ' + all.length + ' entries</p>' : ''}`;
  }

  // ── PDF EXPORT MODAL ────────────────────────────────────────────────────────

  function openPdfExportModal() {
    const modal = document.getElementById('spPdfExportModal');
    if (!modal) return;

    // Populate artist selector
    const sel = document.getElementById('spPdfArtistSelect');
    if (sel) {
      const artists = Array.isArray(window.artists) ? window.artists : [];
      const preferredArtist = getCurrentReportArtistFilter();
      sel.innerHTML = '<option value="">All Artists</option>';
      artists.forEach(a => {
        const opt = document.createElement('option');
        opt.value = a.name;
        opt.textContent = a.name;
        sel.appendChild(opt);
      });
      if (preferredArtist && artists.some((artist) => artist.name === preferredArtist)) {
        sel.value = preferredArtist;
      }
    }

    const startEl = document.getElementById('spPdfDateStart');
    const endEl = document.getElementById('spPdfDateEnd');
    if (startEl && endEl) {
      startEl.value = '';
      endEl.value = '';
    }

    modal.style.display = 'flex';
  }

  function closePdfExportModal() {
    const modal = document.getElementById('spPdfExportModal');
    if (modal) modal.style.display = 'none';
  }

  // ── AVATAR LOADING ─────────────────────────────────────────────────────────

  async function loadAvatarDataUrl(src) {
    if (!src) return '';
    // Already a data URI
    if (src.startsWith('data:image/')) return src;
    // URL — fetch and convert to data URI
    if (src.startsWith('http') || src.startsWith('./') || src.startsWith('/')) {
      try {
        const origin = window.location.origin !== 'null' ? window.location.origin : '';
        const url = src.startsWith('http') ? src : `${origin}${src.startsWith('.') ? src.slice(1) : src}`;
        const resp = await fetch(url, { cache: 'force-cache', mode: 'cors' });
        if (!resp.ok) return '';
        const blob = await resp.blob();
        return await new Promise((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result || '');
          reader.readAsDataURL(blob);
        });
      } catch (_e) { return ''; }
    }
    return '';
  }

  async function prepareReportHeaderAsset(src, options = {}) {
    if (!src) return '';
    const { mode = 'contain', circular = false } = options;
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const size = 320;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(src);
          return;
        }

        ctx.clearRect(0, 0, size, size);
        if (circular) {
          ctx.save();
          ctx.beginPath();
          ctx.arc(size / 2, size / 2, (size / 2) - 12, 0, Math.PI * 2);
          ctx.closePath();
          ctx.clip();
        }

        const scale = mode === 'cover'
          ? Math.max(size / img.width, size / img.height)
          : Math.min(size / img.width, size / img.height);
        const drawW = img.width * scale;
        const drawH = img.height * scale;
        const drawX = (size - drawW) / 2;
        const drawY = (size - drawH) / 2;
        ctx.drawImage(img, drawX, drawY, drawW, drawH);

        if (circular) {
          ctx.restore();
          ctx.beginPath();
          ctx.arc(size / 2, size / 2, (size / 2) - 16, 0, Math.PI * 2);
          ctx.lineWidth = 8;
          ctx.strokeStyle = 'rgba(255,179,0,0.9)';
          ctx.stroke();
        }

        resolve(canvas.toDataURL('image/png', 1));
      };
      img.onerror = () => resolve(src);
      img.src = src;
    });
  }

  // ── DATE HELPERS ───────────────────────────────────────────────────────────

  function getActualPeriodLabel(dateStart, dateEnd, fallbackLabel) {
    if (dateStart && dateEnd) {
      const s = new Date(dateStart);
      const e = new Date(dateEnd);
      if (!isNaN(s) && !isNaN(e)) {
        const months = ['January', 'February', 'March', 'April', 'May', 'June',
                        'July', 'August', 'September', 'October', 'November', 'December'];
        if (s.getMonth() === e.getMonth() && s.getFullYear() === e.getFullYear()) {
          return `${months[s.getMonth()]} ${s.getFullYear()}`;
        }
        const shortMonths = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        return `${shortMonths[s.getMonth()]} ${s.getFullYear()} – ${shortMonths[e.getMonth()]} ${e.getFullYear()}`;
      }
    }
    // Derive from selected period
    const now = new Date();
    const months = ['January', 'February', 'March', 'April', 'May', 'June',
                    'July', 'August', 'September', 'October', 'November', 'December'];
    if (fallbackLabel && fallbackLabel.toLowerCase().includes('month')) {
      return `${months[now.getMonth()]} ${now.getFullYear()}`;
    }
    if (fallbackLabel && fallbackLabel.toLowerCase().includes('year')) {
      return `${now.getFullYear()} Annual Report`;
    }
    return fallbackLabel || `${months[now.getMonth()]} ${now.getFullYear()}`;
  }

  function getReportStartPeriodKey(period, dateStart, data) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateStart || '')) {
      return dateStart.slice(0, 7);
    }

    const today = new Date();
    const currentYear = today.getFullYear();
    const currentMonth = today.getMonth();
    const formatMonth = (year, monthIndex) => `${year}-${String(monthIndex + 1).padStart(2, '0')}`;

    switch (period) {
      case 'month':
        return formatMonth(currentYear, currentMonth);
      case 'prevMonth': {
        const prev = new Date(currentYear, currentMonth - 1, 1);
        return formatMonth(prev.getFullYear(), prev.getMonth());
      }
      case 'quarter': {
        const quarterStart = Math.floor(currentMonth / 3) * 3;
        return formatMonth(currentYear, quarterStart);
      }
      case 'year':
        return `${currentYear}-01`;
      case 'prevYear':
        return `${currentYear - 1}-01`;
      case 'all':
      default: {
        const earliestDate = [
          ...(data?.filteredBookings || []).map((item) => item.date),
          ...(data?.filteredExpenses || []).map((item) => item.date),
          ...(data?.filteredOtherIncome || []).map((item) => item.date)
        ].filter(Boolean).sort()[0];
        return /^\d{4}-\d{2}-\d{2}$/.test(earliestDate || '')
          ? earliestDate.slice(0, 7)
          : formatMonth(currentYear, currentMonth);
      }
    }
  }

  // ── PDF GENERATION (DARK GLASSMORPHISM THEME) ──────────────────────────────

  async function generateMomentumPDF() {
    if (generateMomentumPDF._busy) return;
    generateMomentumPDF._busy = true;

    // Close modal if open
    closePdfExportModal();

    try {
      const { jsPDF } = window.jspdf;
      if (!jsPDF) { window.toastError?.('PDF library not loaded'); return; }

      // ── Read modal selections ──
      const selectedArtist = (document.getElementById('spPdfArtistSelect')?.value || '').trim();
      const dateStart = (document.getElementById('spPdfDateStart')?.value || '').trim();
      const dateEnd = (document.getElementById('spPdfDateEnd')?.value || '').trim();

      // ── Gather data ──
      const getPeriod = window.getReportPeriodSelection || (() => ({ period: 'month', periodLabel: new Date().toLocaleString('en-US', { month: 'long', year: 'numeric' }) }));
      const getData = window.getReportPeriodData || (() => ({
        filteredBookings: [], filteredExpenses: [], filteredOtherIncome: [],
        totalIncome: 0, totalExpenses: 0, totalOtherIncome: 0, netProfit: 0, balancesDue: 0, totalBookings: 0
      }));

      const { period, periodLabel } = getPeriod();
      let data = getData(period, { sortNewestFirst: true });
      const prevPeriodMap = { month: 'prevMonth', year: 'prevYear', quarter: 'all', prevMonth: 'month', prevYear: 'year', all: 'all' };
      const prevData = getData(prevPeriodMap[period] || 'all', { sortNewestFirst: false });

      // Apply artist filter
      if (selectedArtist) {
        const fb = data.filteredBookings.filter(b => b.artist === selectedArtist);
        const totalIncome = fb.reduce((s, b) => s + Math.round(Number(b.fee) || 0), 0);
        const balancesDue = fb.reduce((s, b) => s + Math.round((Number(b.fee) || 0) - (Number(b.deposit) || 0)), 0);
        data = {
          ...data,
          filteredBookings: fb,
          totalIncome,
          totalBookings: fb.length,
          netProfit: totalIncome + data.totalOtherIncome - data.totalExpenses,
          balancesDue: Math.max(0, balancesDue),
        };
      }

      // Apply custom date range filter
      if (dateStart || dateEnd) {
        const filterDate = (items, dateField) => items.filter(item => {
          const d = item[dateField];
          if (!d) return false;
          if (dateStart && d < dateStart) return false;
          if (dateEnd && d > dateEnd) return false;
          return true;
        });
        const fb = filterDate(data.filteredBookings, 'date');
        const fe = filterDate(data.filteredExpenses, 'date');
        const fo = filterDate(data.filteredOtherIncome, 'date');
        const totalIncome = fb.reduce((s, b) => s + Math.round(Number(b.fee) || 0), 0);
        const totalExpenses = fe.reduce((s, e) => s + Math.round(Number(e.amount) || 0), 0);
        const totalOtherIncome = fo.reduce((s, i) => s + Math.round(Number(i.amount) || 0), 0);
        const balancesDue = fb.reduce((s, b) => s + Math.max(0, Math.round((Number(b.fee) || 0) - (Number(b.deposit) || 0))), 0);
        data = {
          filteredBookings: fb, filteredExpenses: fe, filteredOtherIncome: fo,
          totalIncome, totalExpenses, totalOtherIncome,
          netProfit: totalIncome + totalOtherIncome - totalExpenses,
          balancesDue, totalBookings: fb.length,
        };
      }

      const artists = Array.isArray(window.artists) ? window.artists : [];
      const artistObj = selectedArtist ? artists.find(a => a.name === selectedArtist) : null;
      const artistName = artistObj ? artistObj.name : (selectedArtist || (window.currentUser || 'Manager'));
      const audienceTrend = getAudienceTrend(Array.isArray(window.audienceMetrics) ? window.audienceMetrics : [], selectedArtist, artistObj?.id);
      const upcomingForContext = (Array.isArray(window.bookings) ? window.bookings : [])
        .filter(b => b && b.date)
        .filter(b => b.status !== 'cancelled')
        .filter(b => !selectedArtist || b.artist === selectedArtist)
        .filter(b => b.date >= new Date().toISOString().slice(0, 10))
        .sort((a, b) => a.date.localeCompare(b.date))
        .slice(0, 4);
      const ctx = {
        audienceTrend,
        upcomingShows: upcomingForContext,
        strategicGoalMissing: Boolean(selectedArtist && !artistObj?.strategicGoal?.trim()),
        artistName,
        wantAudiencePrompt: true
      };
      const allBookings = Array.isArray(window.bookings) ? window.bookings : [];
      const pdfNextOnStage = buildPdfNextOnStage(allBookings, selectedArtist, 3);
      const periodDates = [
        ...data.filteredBookings.map((entry) => entry?.date),
        ...data.filteredExpenses.map((entry) => entry?.date),
        ...data.filteredOtherIncome.map((entry) => entry?.date),
      ].filter(Boolean).sort((a, b) => String(a || '').localeCompare(String(b || '')));
      const forecastAnchorIso = dateEnd
        || periodDates[periodDates.length - 1]
        || new Date().toISOString().slice(0, 10);
      const pdfForecastBookings = buildPdfForecastBookings(allBookings, selectedArtist, forecastAnchorIso, 31);

      const m = computeMetrics(data, prevData);
      const insights = generateInsights(m, ctx);

      // ── Artist info ──
      const reportTitle = `MONEY MOVES: ${(artistName || 'ROSTER').toUpperCase()}`;
      const actualPeriodLabel = getActualPeriodLabel(dateStart, dateEnd, periodLabel);
      const reportBbfPeriod = getReportStartPeriodKey(period, dateStart, data);
      // ── Load assets ──
      let logoDataUrl = '';
      if (typeof window.getReportLogoDataUrl === 'function') {
        try { logoDataUrl = await window.getReportLogoDataUrl(); } catch (_e) { /* skip */ }
      }

      let avatarDataUrl = '';
      if (artistObj && artistObj.avatar) {
        const resolvedSrc = typeof window.resolveDisplayAvatar === 'function'
          ? window.resolveDisplayAvatar(artistObj)
          : artistObj.avatar;
        avatarDataUrl = await loadAvatarDataUrl(resolvedSrc);
      }
      const logoHeaderAsset = await prepareReportHeaderAsset(logoDataUrl, { mode: 'contain', circular: false });
      const avatarHeaderAsset = avatarDataUrl
        ? await prepareReportHeaderAsset(avatarDataUrl, { mode: 'cover', circular: true })
        : '';
      const bbfContext = typeof window.getActiveBBFContext === 'function'
        ? window.getActiveBBFContext({
            period: reportBbfPeriod,
            artistId: artistObj?.id,
            artistName: artistObj?.name,
            artist: artistObj,
            fallbackToGlobal: true
          })
        : null;
      const bbfVal = bbfContext
        ? Number(bbfContext.amount) || 0
        : (typeof window.getCurrentBBF === 'function'
            ? window.getCurrentBBF({
                period: reportBbfPeriod,
                artistId: artistObj?.id,
                artistName: artistObj?.name,
                fallbackToGlobal: true
              })
            : 0);

      // ── Closing thoughts ──
      const closingInput = document.getElementById('closingThoughtsInput');
      const closingDraft = String(closingInput?.value || '').trim();
      const closingFn = window.getClosingThoughtsForPeriod;
      const closingThoughts = closingDraft || (typeof closingFn === 'function' ? closingFn(period).trim() : '');
      const pdfClosingBalance = Math.round(
        (Number(bbfVal) || 0) +
        (Number(m.totalIncome) || 0) +
        (Number(m.totalOtherIncome) || 0) -
        (Number(m.totalExpenses) || 0)
      );
      const pdfVenuePerf = buildPdfVenuePerformance(m.filteredBookings, m.totalExpenses);
      const pdfTransactions = sortTransactionsForPdf([
        ...m.filteredBookings.map(b => ({ type: 'Booking', date: b.date, desc: b.event || b.artist || '', amount: Math.round(Number(b.fee) || 0) })),
        ...m.filteredExpenses.map(e => ({ type: 'Expense', date: e.date, desc: e.description || e.category || '', amount: Math.round(Number(e.amount) || 0) })),
        ...m.filteredOtherIncome.map(i => ({ type: 'Income', date: i.date, desc: i.source || i.type || '', amount: Math.round(Number(i.amount) || 0) })),
      ]);
      const pdfStrategyNotes = buildPdfStrategyNotes(
        m,
        {
          ...ctx,
          closingBalance: pdfClosingBalance,
          monthlyGoal: typeof window.getCurrentMonthlyRevenueGoal === 'function' ? window.getCurrentMonthlyRevenueGoal() : 0,
          strategicGoal: artistObj?.strategicGoal || ''
        },
        closingThoughts,
        pdfVenuePerf
      );
      const pdfData = {
        artist: {
          id: artistObj?.id || '',
          name: artistName || 'Roster'
        },
        filters: {
          selectedArtist,
          dateStart,
          dateEnd,
          period,
          periodLabel: actualPeriodLabel
        },
        themeMode: getCurrentThemeMode(),
        raw: {
          ...data,
          bbf: Math.round(Number(bbfVal) || 0),
          bbfPeriod: bbfContext?.period || reportBbfPeriod
        },
        metrics: {
          ...m,
          pdfVenuePerf,
          bbf: Math.round(Number(bbfVal) || 0),
          bbfPeriod: bbfContext?.period || reportBbfPeriod,
          bbfSourcePeriodLabel: bbfContext?.sourcePeriodLabel || '',
          closingBalance: pdfClosingBalance
        },
        generatedBy: window.currentUser || 'Manager',
        nextOnStage: pdfNextOnStage,
        projectedRevenue: pdfForecastBookings.reduce((sum, booking) => sum + Math.round(Number(booking?.fee) || 0), 0),
        projectedRevenueShows: pdfForecastBookings.length,
        ledgerTransactions: pdfTransactions,
        insights,
        strategyNotes: pdfStrategyNotes,
        closingThoughts
      };

      // ── PDF setup ──
      const isMobile = window.matchMedia('(max-width: 900px), (pointer: coarse)').matches;
      const pdf = new jsPDF({
        orientation: 'landscape',
        unit: 'mm', format: 'a4', putOnlyUsedFonts: true, floatPrecision: 16
      });

      const W = pdf.internal.pageSize.getWidth();
      const H = pdf.internal.pageSize.getHeight();
      const pxToMm = 25.4 / 96;
      const mg = 12;
      const cw = W - mg * 2;
      const headerH = 26;
      const footerH = 8;
      const contentTop = headerH + 8;
      const cardPad = 18 * pxToMm;
      const sectionGap = 20 * pxToMm;
      const largeBlockThreshold = 0.6;
      const PDF_THEME = pdfData.themeMode === 'light' ? 'light' : 'dark';
      const isLightTheme = PDF_THEME === 'light';

      const P = isLightTheme
        ? {
            bgDark: [255, 255, 255],
            bgPanel: [255, 255, 255],
            bgCard: [248, 250, 252],
            gold: [202, 138, 4],
            goldDim: [148, 122, 69],
            white: [15, 23, 42],
            textPrimary: [15, 23, 42],
            textMuted: [71, 85, 105],
            green: [22, 163, 74],
            red: [220, 38, 38],
            blue: [37, 99, 235],
            border: [203, 213, 225],
            accent: [202, 138, 4],
            chartBg: '#FFFFFF',
            chartLegend: '#0F172A',
            chartTicks: '#334155',
            chartGrid: 'rgba(15,23,42,0.08)',
            chartCard: '#FFFFFF',
            chartBorder: '#CBD5E1'
          }
        : {
            bgDark: [0, 0, 0],
            bgPanel: [7, 7, 8],
            bgCard: [16, 16, 18],
            gold: [255, 215, 0],
            goldDim: [181, 154, 23],
            white: [255, 255, 255],
            textPrimary: [245, 245, 247],
            textMuted: [163, 163, 170],
            green: [34, 197, 94],
            red: [239, 68, 68],
            blue: [96, 165, 250],
            border: [52, 52, 58],
            accent: [255, 215, 0],
            chartBg: '#101012',
            chartLegend: '#F4F4F5',
            chartTicks: '#A1A1AA',
            chartGrid: 'rgba(255,255,255,0.06)',
            chartCard: '#101012',
            chartBorder: '#101012'
          };

      const formatMoney = (v) => `UGX ${Math.round(Number(v) || 0).toLocaleString()}`;
      const fmtDate = (d) => {
        if (!d) return '—';
        const fn = window.formatDisplayDate;
        return typeof fn === 'function' ? fn(d) : new Date(d).toLocaleDateString('en-GB');
      };

      // ── Color helper (can't spread in ternary) ──
      function textColor(arr) { pdf.setTextColor(arr[0], arr[1], arr[2]); }
      function fillColor(arr) { pdf.setFillColor(arr[0], arr[1], arr[2]); }

      // ── Reusable PDF helpers ──

      function drawPageBg() {
        fillColor(P.bgDark);
        pdf.rect(0, 0, W, H, 'F');
      }

      function drawHeader(subtitle) {
        // Dark header bar
        fillColor(P.bgPanel);
        pdf.rect(0, 0, W, headerH, 'F');

        // Gold accent line
        fillColor(P.gold);
        pdf.rect(0, headerH - 0.6, W, 0.6, 'F');

        const assetBox = headerH - 6;
        const assetY = (headerH - assetBox) / 2;
        const leftX = mg;
        const avatarBox = avatarHeaderAsset ? assetBox : 0;
        const avatarX = leftX;
        const avatarY = assetY;
        const rightLogoX = W - mg - assetBox;

        // Artist avatar anchors the left side of the header
        if (avatarHeaderAsset) {
          try {
            pdf.addImage(avatarHeaderAsset, 'PNG', avatarX, avatarY, avatarBox, avatarBox);
          } catch (_e) { /* skip */ }
        }

        // Brand logo moves to the far right of the header
        if (logoHeaderAsset) {
          try {
            pdf.addImage(logoHeaderAsset, 'PNG', rightLogoX, assetY, assetBox, assetBox);
          } catch (_e) { /* skip */ }
        }

        // H1: MONEY MOVES
        const titleX = leftX + (avatarHeaderAsset ? avatarBox + 6 : 0);
        const titleW = Math.max(30, rightLogoX - titleX - 6);
        const titleFit = fitSingleLineText(reportTitle, Math.max(28, titleW - 10), 'helvetica', 'bold', 14, 10);
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(titleFit.fontSize);
        pdf.setTextColor(...P.gold);
        pdf.text(titleFit.text, titleX, assetY + 6.4);

        const badgeX = Math.min(rightLogoX - 4, titleX + pdf.getTextWidth(titleFit.text) + 5);
        const badgeY = assetY + 5;
        pdf.setFillColor(59, 130, 246);
        pdf.circle(badgeX, badgeY, 2.1, 'F');
        pdf.setDrawColor(255, 255, 255);
        pdf.setLineWidth(0.45);
        pdf.line(badgeX - 0.8, badgeY + 0.1, badgeX - 0.2, badgeY + 0.8);
        pdf.line(badgeX - 0.2, badgeY + 0.8, badgeX + 0.9, badgeY - 0.7);

        // Subtitle + period
        const subtitleFit = fitSingleLineText(
          subtitle ? `${subtitle}  |  ${actualPeriodLabel}` : actualPeriodLabel,
          titleW,
          'helvetica',
          'bold',
          8.4,
          6.2
        );
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(subtitleFit.fontSize);
        pdf.setTextColor(...P.textPrimary);
        pdf.text(subtitleFit.text, titleX, assetY + 12.6);

        // Generated info
        const generatedFit = fitSingleLineText(
          `Generated: ${new Date().toLocaleDateString('en-GB')} ${new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}   |   ${pdfData.generatedBy || window.currentUser || 'Manager'}`,
          titleW,
          'helvetica',
          'normal',
          7.1,
          5.8
        );
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(generatedFit.fontSize);
        pdf.setTextColor(...P.textMuted);
        const now = new Date();
        const gen = `${now.toLocaleDateString('en-GB')} ${now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`;
        pdf.text(
          fitSingleLineText(
            `Generated: ${gen}   |   ${pdfData.generatedBy || window.currentUser || 'Manager'}`,
            titleW,
            'helvetica',
            'normal',
            7.1,
            5.8
          ).text,
          titleX,
          assetY + 17.8
        );
      }

      function drawFooter(page, total) {
        pdf.setDrawColor(...P.border);
        pdf.setLineWidth(0.2);
        pdf.line(mg, H - footerH, W - mg, H - footerH);
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(7);
        pdf.setTextColor(...P.textMuted);
        pdf.text('star-paper.netlify.app', mg, H - 3.4);
        const lbl = `Page ${page} of ${total}`;
        pdf.text(lbl, W - mg - pdf.getTextWidth(lbl), H - 3.4);
      }

      function sectionTitle(title, y) {
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(11);
        pdf.setTextColor(...P.gold);
        pdf.text(title, mg, y + 3);
        pdf.setDrawColor(...P.gold);
        pdf.setLineWidth(0.5);
        pdf.line(mg, y + 4.8, W - mg, y + 4.8);
        return y + 8;
      }

      function drawCardTitle(title, x, y, w) {
        const titleBaseline = y + cardPad + 2.2;
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(10.8);
        pdf.setTextColor(...P.gold);
        pdf.text(title, x + cardPad, titleBaseline);
        pdf.setDrawColor(...P.border);
        pdf.setLineWidth(0.18);
        pdf.line(x + cardPad, titleBaseline + 1.9, x + w - cardPad, titleBaseline + 1.9);
        return titleBaseline + 4.8;
      }

      function ensureSectionPageBreak(y, blockHeight, subtitle, options = {}) {
        const allowHeuristicBreak = options.allowHeuristicBreak !== false;
        const remaining = (H - mg - footerH) - y;
        const shouldHeuristicBreak = allowHeuristicBreak
          && y > contentTop + 2
          && blockHeight > remaining * largeBlockThreshold;
        if (blockHeight > remaining || shouldHeuristicBreak) {
          pdf.addPage();
          drawPageBg();
          drawHeader(subtitle);
          return contentTop;
        }
        return y;
      }

      function drawContainedImage(imageData, x, y, boxW, boxH, srcW, srcH, format = 'PNG') {
        const safeSrcW = Math.max(1, Number(srcW) || 1);
        const safeSrcH = Math.max(1, Number(srcH) || 1);
        const scale = Math.min(boxW / safeSrcW, boxH / safeSrcH);
        const drawW = safeSrcW * scale;
        const drawH = safeSrcH * scale;
        const drawX = x + ((boxW - drawW) / 2);
        const drawY = y + ((boxH - drawH) / 2);
        pdf.addImage(imageData, format, drawX, drawY, drawW, drawH);
      }

      function canvasCoverDataUrl(canvas, targetW, targetH, focusX = 0.28, focusY = 0.5) {
        const srcW = Math.max(1, Number(canvas?.width) || 1);
        const srcH = Math.max(1, Number(canvas?.height) || 1);
        const targetRatio = Math.max(0.01, Number(targetW) || 1) / Math.max(0.01, Number(targetH) || 1);
        const srcRatio = srcW / srcH;
        let sx = 0;
        let sy = 0;
        let sw = srcW;
        let sh = srcH;

        if (srcRatio > targetRatio) {
          sw = srcH * targetRatio;
          sx = (srcW - sw) * Math.min(Math.max(focusX, 0), 1);
        } else if (srcRatio < targetRatio) {
          sh = srcW / targetRatio;
          sy = (srcH - sh) * Math.min(Math.max(focusY, 0), 1);
        }

        const out = document.createElement('canvas');
        out.width = Math.max(1, Math.round(targetW * 12));
        out.height = Math.max(1, Math.round(targetH * 12));
        const outCtx = out.getContext('2d');
        if (!outCtx) {
          return canvas.toDataURL('image/png', 0.95);
        }
        outCtx.drawImage(canvas, sx, sy, sw, sh, 0, 0, out.width, out.height);
        return out.toDataURL('image/png', 0.95);
      }

      function fitSingleLineText(text, maxWidth, fontName = 'helvetica', fontStyle = 'normal', maxFontSize = 8.4, minFontSize = 6) {
        let safeText = String(text || '');
        let fontSize = maxFontSize;
        pdf.setFont(fontName, fontStyle);
        pdf.setFontSize(fontSize);
        while (pdf.getTextWidth(safeText) > maxWidth && fontSize > minFontSize) {
          fontSize -= 0.2;
          pdf.setFontSize(fontSize);
        }
        while (pdf.getTextWidth(safeText) > maxWidth && safeText.length > 3) {
          safeText = `${safeText.slice(0, -4).trimEnd()}...`;
        }
        return { text: safeText, fontSize };
      }

      function fitMultilineText(text, maxWidth, maxLines = 2, fontName = 'helvetica', fontStyle = 'normal', fontSize = 8) {
        const safeText = String(text || '');
        pdf.setFont(fontName, fontStyle);
        pdf.setFontSize(fontSize);
        const rawLines = pdf.splitTextToSize(safeText, maxWidth);
        if (rawLines.length <= maxLines) {
          return { lines: rawLines, fontSize };
        }
        const lines = rawLines.slice(0, maxLines);
        const lastLineFit = fitSingleLineText(`${lines[maxLines - 1]}...`, maxWidth, fontName, fontStyle, fontSize, Math.max(5.6, fontSize - 1.2));
        lines[maxLines - 1] = lastLineFit.text;
        return { lines, fontSize: lastLineFit.fontSize };
      }

      function normalizeMapLocationKey(value) {
        return String(value || '').trim().toLowerCase();
      }

      function buildPdfTourMapData(rows) {
        const fallbackCoords = [
          { x: 0.66, y: 0.26, dx: 22, dy: -4 },
          { x: 0.69, y: 0.40, dx: 22, dy: 0 },
          { x: 0.63, y: 0.58, dx: 22, dy: 0 },
          { x: 0.58, y: 0.72, dx: 22, dy: 0 },
        ];
        const ugandaCoords = {
          kampala: { x: 0.39, y: 0.56, dx: 22, dy: 0 },
          wakiso: { x: 0.35, y: 0.52, dx: -86, dy: -6 },
          entebbe: { x: 0.34, y: 0.63, dx: -98, dy: 18 },
          jinja: { x: 0.50, y: 0.53, dx: 22, dy: 0 },
          hoima: { x: 0.32, y: 0.42, dx: 22, dy: -8 },
          mbarara: { x: 0.31, y: 0.70, dx: -84, dy: 10 },
          masaka: { x: 0.35, y: 0.66, dx: 18, dy: 16 },
          'fort portal': { x: 0.25, y: 0.52, dx: -102, dy: 6 },
          gulu: { x: 0.41, y: 0.23, dx: 22, dy: -8 },
          lira: { x: 0.50, y: 0.33, dx: 22, dy: -8 },
          soroti: { x: 0.57, y: 0.43, dx: 22, dy: 0 },
          mbale: { x: 0.61, y: 0.48, dx: 22, dy: 0 },
          arua: { x: 0.22, y: 0.18, dx: -72, dy: -4 },
          kabale: { x: 0.26, y: 0.82, dx: -82, dy: 14 },
          tororo: { x: 0.64, y: 0.55, dx: 22, dy: 10 },
          busia: { x: 0.60, y: 0.56, dx: 22, dy: 18 },
          rwanda: { x: 0.29, y: 0.77, dx: 20, dy: 10 },
          kenya: { x: 0.70, y: 0.49, dx: 22, dy: -4 },
          tanzania: { x: 0.53, y: 0.82, dx: 22, dy: 8 },
        };

        return (Array.isArray(rows) ? rows : []).slice(0, 6).map((row, index) => {
          const key = normalizeMapLocationKey(row.location);
          return {
            ...row,
            coord: ugandaCoords[key] || fallbackCoords[index] || fallbackCoords[fallbackCoords.length - 1],
            knownOnUgandaMap: Boolean(ugandaCoords[key])
          };
        });
      }

      function buildPdfTourMapCanvas(rows) {
        const mapRows = buildPdfTourMapData(rows);
        const canvas = document.createElement('canvas');
        canvas.width = 1400;
        canvas.height = 760;
        const ctx = canvas.getContext('2d');
        if (!ctx) return null;

        const bgColor = isLightTheme ? '#F8FAFC' : '#111217';
        const gridColor = isLightTheme ? 'rgba(15,23,42,0.07)' : 'rgba(255,255,255,0.05)';
        const outlineFill = isLightTheme ? 'rgba(22,163,74,0.08)' : 'rgba(20,83,45,0.36)';
        const outlineStroke = isLightTheme ? 'rgba(22,163,74,0.9)' : 'rgba(34,197,94,0.68)';
        const titleColor = isLightTheme ? '#0F172A' : '#FFFFFF';
        const metaColor = isLightTheme ? '#CA8A04' : '#FACC15';
        const pinOuter = isLightTheme ? '#F59E0B' : '#FBBF24';
        const pinInner = isLightTheme ? '#FCD34D' : '#FED7AA';
        const plot = { x: 120, y: 50, w: canvas.width - 240, h: canvas.height - 100 };
        const ugandaOutline = [
          [0.39, 0.12], [0.46, 0.18], [0.49, 0.28], [0.56, 0.37], [0.53, 0.48],
          [0.46, 0.58], [0.43, 0.69], [0.40, 0.82], [0.31, 0.87], [0.24, 0.79],
          [0.20, 0.68], [0.17, 0.52], [0.20, 0.39], [0.24, 0.28], [0.30, 0.16]
        ];
        const allKnownOnUganda = mapRows.length > 0 && mapRows.every((row) => row.knownOnUgandaMap);
        const fitCanvasText = (text, maxWidth, fontWeight, maxSize, minSize = 16, fontFamily = 'Arial') => {
          let safeText = String(text || '');
          let size = maxSize;
          ctx.font = `${fontWeight} ${size}px ${fontFamily}`;
          while (ctx.measureText(safeText).width > maxWidth && size > minSize) {
            size -= 1;
            ctx.font = `${fontWeight} ${size}px ${fontFamily}`;
          }
          while (ctx.measureText(safeText).width > maxWidth && safeText.length > 3) {
            safeText = `${safeText.slice(0, -4).trimEnd()}...`;
          }
          return { text: safeText, size };
        };

        ctx.fillStyle = bgColor;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        ctx.strokeStyle = gridColor;
        ctx.lineWidth = 1;
        for (let gx = plot.x; gx <= plot.x + plot.w; gx += plot.w / 7) {
          ctx.beginPath();
          ctx.moveTo(gx, plot.y);
          ctx.lineTo(gx, plot.y + plot.h);
          ctx.stroke();
        }
        for (let gy = plot.y; gy <= plot.y + plot.h; gy += plot.h / 4) {
          ctx.beginPath();
          ctx.moveTo(plot.x, gy);
          ctx.lineTo(plot.x + plot.w, gy);
          ctx.stroke();
        }

        if (allKnownOnUganda) {
          ctx.beginPath();
          ugandaOutline.forEach(([px, py], index) => {
            const drawX = plot.x + (plot.w * px);
            const drawY = plot.y + (plot.h * py);
            if (index === 0) ctx.moveTo(drawX, drawY);
            else ctx.lineTo(drawX, drawY);
          });
          ctx.closePath();
          ctx.fillStyle = outlineFill;
          ctx.fill();
          ctx.strokeStyle = outlineStroke;
          ctx.lineWidth = 3;
          ctx.stroke();
        }

        mapRows.forEach((row) => {
          const px = plot.x + (plot.w * row.coord.x);
          const py = plot.y + (plot.h * row.coord.y);
          const labelMaxW = Math.min(280, plot.w * 0.26);
          const alignLeft = (row.coord.dx || 0) >= 0;
          const rawLabelX = px + row.coord.dx;
          const labelX = alignLeft
            ? Math.min(rawLabelX, (plot.x + plot.w) - labelMaxW - 12)
            : Math.max(rawLabelX, plot.x + labelMaxW + 12);
          const labelY = Math.min(Math.max(py + row.coord.dy, plot.y + 24), (plot.y + plot.h) - 44);
          const subText = `${row.shows} show${row.shows === 1 ? '' : 's'} | ${fmtUGX(row.revenue)}`;
          const titleFit = fitCanvasText(String(row.location || 'Unknown'), labelMaxW, 700, 34, 20, 'Arial');
          const subFit = fitCanvasText(subText, labelMaxW, 600, 22, 14, 'Courier New');

          const glow = ctx.createRadialGradient(px, py, 2, px, py, 28);
          glow.addColorStop(0, isLightTheme ? 'rgba(245,158,11,0.35)' : 'rgba(251,191,36,0.45)');
          glow.addColorStop(1, 'rgba(251,191,36,0)');
          ctx.fillStyle = glow;
          ctx.beginPath();
          ctx.arc(px, py, 28, 0, Math.PI * 2);
          ctx.fill();

          ctx.fillStyle = pinOuter;
          ctx.beginPath();
          ctx.arc(px, py, 12, 0, Math.PI * 2);
          ctx.fill();

          ctx.fillStyle = pinInner;
          ctx.beginPath();
          ctx.arc(px, py, 5, 0, Math.PI * 2);
          ctx.fill();

          ctx.font = `700 ${titleFit.size}px Arial`;
          ctx.fillStyle = titleColor;
          ctx.textAlign = alignLeft ? 'left' : 'right';
          ctx.textBaseline = 'middle';
          ctx.fillText(titleFit.text, labelX, labelY);

          ctx.font = `600 ${subFit.size}px Courier New`;
          ctx.fillStyle = metaColor;
          ctx.fillText(subFit.text, labelX, labelY + 30);
        });

        if (mapRows.length === 0) {
          ctx.font = '600 28px Arial';
          ctx.fillStyle = isLightTheme ? '#64748B' : '#A1A1AA';
          ctx.textAlign = 'center';
          ctx.fillText('No routed shows to map yet.', canvas.width / 2, canvas.height / 2);
        }

        return canvas;
      }

      function glassPanel(x, y, w, h) {
        fillColor(P.bgCard);
        pdf.roundedRect(x, y, w, h, 2.5, 2.5, 'F');
        pdf.setDrawColor(...P.border);
        pdf.setLineWidth(0.25);
        pdf.roundedRect(x, y, w, h, 2.5, 2.5, 'S');
      }

      // ══════════════════════════════════════════════════════════════════════
      // PAGE 1: The Money Moves
      // =====================================================================
      drawPageBg();
      drawHeader('PERIOD');

      let y = contentTop;

      const closingBalance = pdfData.metrics.closingBalance;
      const balanceChangePct = pdfData.metrics.bbf > 0
        ? ((closingBalance - pdfData.metrics.bbf) / pdfData.metrics.bbf) * 100
        : null;
      const trendChangePct = Number.isFinite(Number(pdfData.metrics.trendPct))
        ? Number(pdfData.metrics.trendPct)
        : null;
      const closingInsightValue = trendChangePct ?? balanceChangePct;
      const closingInsightText = closingInsightValue !== null
        ? `${fmtPct(closingInsightValue)} ${trendChangePct !== null ? 'vs previous' : 'vs BBF'}`
        : '';
      const closingBadgePadX = 4.2;
      const closingBadgeFit = closingInsightText
        ? fitSingleLineText(closingInsightText, Math.min(76, cw * 0.36), 'courier', 'bold', 8.4, 6.6)
        : null;
      const closingBadgeW = closingBadgeFit
        ? pdf.getTextWidth(closingBadgeFit.text) + (closingBadgePadX * 2)
        : 0;

      y = sectionTitle('Closing Balance', y);
      const heroH = 18;
      glassPanel(mg, y, cw, heroH);

      const closingValueFit = fitSingleLineText(
        formatMoney(closingBalance),
        cw - (cardPad * 2) - (closingBadgeW ? closingBadgeW + 10 : 0),
        'courier',
        'bold',
        18,
        11
      );
      pdf.setFont('courier', 'bold');
      pdf.setFontSize(closingValueFit.fontSize);
      textColor(closingBalance >= 0 ? P.green : P.red);
      pdf.text(closingValueFit.text, mg + cardPad, y + 9.2);

      if (closingBadgeFit) {
        pdf.setFont('courier', 'bold');
        pdf.setFontSize(closingBadgeFit.fontSize);
        const badgeH = 8.4;
        const badgeX = mg + cw - cardPad - closingBadgeW;
        const badgeY = y + 4.2;
        fillColor(closingInsightValue >= 0 ? P.green : P.red);
        pdf.roundedRect(badgeX, badgeY, closingBadgeW, badgeH, 4.2, 4.2, 'F');
        pdf.setTextColor(255, 255, 255);
        pdf.text(closingBadgeFit.text, badgeX + closingBadgePadX, badgeY + 5.6);
      }

      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(8.2);
      pdf.setTextColor(...P.textPrimary);
      const closingFormulaFit = fitSingleLineText(
        `(BBF ${formatMoney(pdfData.metrics.bbf)}) + Revenue + Other Income - Expenses`,
        cw - (cardPad * 2) - 8,
        'helvetica',
        'normal',
        8.2,
        6.2
      );
      pdf.setFontSize(closingFormulaFit.fontSize);
      pdf.text(closingFormulaFit.text, mg + cardPad, y + 14.2);

      y += heroH + sectionGap;

      // KPI Grid
      y = sectionTitle('Key Metrics', y);
      const kpis = [
        { label: 'Total Revenue', value: fmtUGX(pdfData.metrics.totalIncome), sub: `${pdfData.metrics.totalBookings} bookings`, color: P.green },
        { label: 'Total Expenses', value: fmtUGX(pdfData.metrics.totalExpenses), sub: `${pdfData.raw.filteredExpenses.length} transactions`, color: P.red },
        { label: 'Other Income', value: fmtUGX(pdfData.metrics.totalOtherIncome), sub: `${pdfData.raw.filteredOtherIncome.length} ${pdfData.raw.filteredOtherIncome.length === 1 ? 'entry' : 'entries'}`, color: P.blue },
        {
          label: 'Balance Brought Forward (BBF)',
          value: fmtUGX(pdfData.metrics.bbf),
          sub: pdfData.metrics.bbfSourcePeriodLabel
            ? `${pdfData.metrics.bbfSourcePeriodLabel} opening balance`
            : 'Opening balance',
          color: P.gold
        },
      ];

      const cols = 4;
      const kpiW = (cw - (cols - 1) * 4) / cols;
      const kpiH = 18;
      kpis.forEach((kpi, i) => {
        const col = i % cols;
        const row = Math.floor(i / cols);
        const kx = mg + col * (kpiW + 4);
        const ky = y + row * (kpiH + 4);

        glassPanel(kx, ky, kpiW, kpiH);
        pdf.setFont('helvetica', 'normal');
        const kpiLabelFit = fitSingleLineText(kpi.label, kpiW - (cardPad * 2), 'helvetica', 'normal', 7, 5.8);
        pdf.setFontSize(kpiLabelFit.fontSize);
        pdf.setTextColor(...P.textMuted);
        pdf.text(kpiLabelFit.text, kx + cardPad, ky + 5.2);

        const kpiValueFit = fitSingleLineText(kpi.value, kpiW - (cardPad * 2), 'courier', 'bold', 16, 9.5);
        pdf.setFont('courier', 'bold');
        pdf.setFontSize(kpiValueFit.fontSize);
        pdf.setTextColor(...kpi.color);
        pdf.text(kpiValueFit.text, kx + cardPad, ky + 11.8);

        pdf.setFont('helvetica', 'normal');
        const kpiSubFit = fitMultilineText(kpi.sub || '', kpiW - (cardPad * 2), 1, 'helvetica', 'normal', 6.5);
        pdf.setFontSize(kpiSubFit.fontSize);
        pdf.setTextColor(...P.textMuted);
        pdf.text(kpiSubFit.lines[0] || '', kx + cardPad, ky + 15.8);
      });

      const kpiRows = Math.ceil(kpis.length / cols);
      y += kpiRows * (kpiH + 4) + sectionGap;

      // Revenue + Cost chart row
      const chartsBottom = H - mg - footerH - 2;
      const chartsRowH = Math.max(52, chartsBottom - y);
      const chartsGap = 4;
      const chartCardW = (cw - chartsGap) / 2;
      y = ensureSectionPageBreak(y, chartsRowH, 'PERIOD', { allowHeuristicBreak: false });

      const revenueX = mg;
      const costX = mg + chartCardW + chartsGap;
      glassPanel(revenueX, y, chartCardW, chartsRowH);
      glassPanel(costX, y, chartCardW, chartsRowH);

      const revenueChartY = drawCardTitle('Revenue Momentum', revenueX, y, chartCardW) + 0.8;
      const costChartY = drawCardTitle('Cost Breakdown', costX, y, chartCardW) + 0.8;
      const revenueChartH = chartsRowH - (revenueChartY - y) - cardPad;
      const costChartH = chartsRowH - (costChartY - y) - cardPad;

      if (typeof Chart !== 'undefined' && m.allMonths.length > 0) {
        const canvas = document.createElement('canvas');
        canvas.width = 920;
        canvas.height = 420;
        const ctx = canvas.getContext('2d');

        const goldGrad = ctx.createLinearGradient(0, 0, 0, 420);
        goldGrad.addColorStop(0, 'rgba(255,179,0,0.35)');
        goldGrad.addColorStop(1, 'rgba(255,179,0,0.02)');
        const greenGrad = ctx.createLinearGradient(0, 0, 0, 420);
        greenGrad.addColorStop(0, 'rgba(34,197,94,0.3)');
        greenGrad.addColorStop(1, 'rgba(34,197,94,0.02)');

        const revData = m.allMonths.map(k => m.monthlyRevenue[k] || 0);
        const expData = m.allMonths.map(k => m.monthlyExpenses[k] || 0);
        const profData = m.allMonths.map((_, i) => revData[i] - expData[i]);

        ctx.fillStyle = P.chartBg;
        ctx.fillRect(0, 0, 920, 420);

        const chart = new Chart(ctx, {
          type: 'line',
          data: {
            labels: m.allMonths.map(monthLabel),
            datasets: [
              { label: 'Revenue', data: revData, borderColor: '#FFB300', backgroundColor: goldGrad, fill: true, tension: 0.45, borderWidth: 2.5, pointRadius: 3.6, pointBackgroundColor: '#FFB300' },
              { label: 'Expenses', data: expData, borderColor: '#ef4444', backgroundColor: 'transparent', fill: false, tension: 0.45, borderWidth: 2, borderDash: [6, 3], pointRadius: 2.8, pointBackgroundColor: '#ef4444' },
              { label: 'Net Profit', data: profData, borderColor: '#22c55e', backgroundColor: greenGrad, fill: true, tension: 0.45, borderWidth: 2.5, pointRadius: 3.6, pointBackgroundColor: '#22c55e' }
            ]
          },
          options: {
            responsive: false,
            maintainAspectRatio: false,
            animation: { duration: 0 },
            plugins: {
              legend: {
                position: 'top',
                labels: {
                  color: P.chartLegend,
                  font: { size: 14 },
                  usePointStyle: true,
                  padding: 12
                }
              }
            },
            scales: {
              y: {
                beginAtZero: true,
                ticks: { color: P.chartTicks, font: { size: 12.5 } },
                grid: { color: P.chartGrid }
              },
              x: {
                ticks: { color: P.chartTicks, font: { size: 12.5 } },
                grid: { color: P.chartGrid }
              }
            }
          }
        });
        chart.update();
        await new Promise(r => { const t = setTimeout(r, 50); requestAnimationFrame(() => { clearTimeout(t); r(); }); });
        drawContainedImage(
          canvas.toDataURL('image/png', 1.0),
          revenueX + cardPad,
          revenueChartY,
          chartCardW - (cardPad * 2),
          revenueChartH,
          canvas.width,
          canvas.height
        );
        chart.destroy();
      } else {
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(9);
        pdf.setTextColor(...P.textMuted);
        pdf.text('No chart data available.', revenueX + cardPad, revenueChartY + 12);
      }

      const costEntries = Object.entries(m.expenseByCat).sort((a, b) => b[1] - a[1]).slice(0, 6);
      if (typeof Chart !== 'undefined' && costEntries.length > 0) {
        const c2 = document.createElement('canvas');
        c2.width = 560;
        c2.height = 560;
        const ctx2 = c2.getContext('2d');
        ctx2.fillStyle = P.chartCard;
        ctx2.fillRect(0, 0, c2.width, c2.height);
        const dColors = CHART_COLORS.slice(0, costEntries.length);
        const ch2 = new Chart(ctx2, {
          type: 'doughnut',
          data: {
            labels: costEntries.map(e => e[0]),
            datasets: [{ data: costEntries.map(e => e[1]), backgroundColor: dColors, borderColor: P.chartBorder, borderWidth: 3 }]
          },
          options: {
            responsive: false,
            maintainAspectRatio: true,
            animation: { duration: 0 },
            cutout: '56%',
            plugins: {
              legend: {
                position: 'top',
                labels: {
                  color: P.chartLegend,
                  font: { size: 12 },
                  padding: 8,
                  boxWidth: 12,
                  usePointStyle: true
                }
              }
            }
          }
        });
        ch2.update();
        await new Promise(r => { const t = setTimeout(r, 50); requestAnimationFrame(() => { clearTimeout(t); r(); }); });
        drawContainedImage(
          c2.toDataURL('image/png', 1.0),
          costX + cardPad,
          costChartY,
          chartCardW - (cardPad * 2),
          costChartH,
          c2.width,
          c2.height
        );
        ch2.destroy();
      } else {
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(9);
        pdf.setTextColor(...P.textMuted);
        pdf.text('No expense data.', costX + cardPad, costChartY + 12);
      }
      y += chartsRowH + sectionGap;

      // =====================================================================
      // PAGE 2: The World Tour
      // =====================================================================
      pdf.addPage();
      drawPageBg();
      drawHeader('THE WORLD TOUR');
      y = contentTop;

      const venueHeaders = ['Venue / City', 'Shows', 'Revenue', 'Est. Cost', 'Profit', 'ROI %'];

      async function renderVenuePerformanceCard(x, yTop, w, h) {
        glassPanel(x, yTop, w, h);
        const rows = pdfData.metrics.pdfVenuePerf || [];
        const tableY = drawCardTitle('Venue Performance', x, yTop, w) + 0.8;

        if (rows.length === 0) {
          pdf.setFont('helvetica', 'normal');
          pdf.setFontSize(8.8);
          pdf.setTextColor(...P.textPrimary);
          pdf.text('No venue performance data available yet.', x + cardPad, tableY + 10);
          return;
        }

        const tableX = x + cardPad;
        const innerW = w - (cardPad * 2);
        const venueColWidths = [
          innerW * 0.29,
          innerW * 0.10,
          innerW * 0.17,
          innerW * 0.16,
          innerW * 0.17,
          innerW * 0.11
        ];
        const venueHeaderH = 5.2;
        const venueRowH = 6;
        const maxRows = Math.max(1, Math.min(rows.length, 4));
        const visibleRows = rows.slice(0, maxRows);

        fillColor(P.bgPanel);
        pdf.roundedRect(tableX - 1.4, tableY - 1.4, innerW + 2.8, venueHeaderH, 1.8, 1.8, 'F');
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(7.2);
        pdf.setTextColor(...P.gold);
        let headerX = tableX;
        venueHeaders.forEach((header, index) => {
          const headerFit = fitSingleLineText(header, venueColWidths[index] - 1.5, 'helvetica', 'bold', 7.2, 6.1);
          pdf.setFont('helvetica', 'bold');
          pdf.setFontSize(headerFit.fontSize);
          if (index === venueHeaders.length - 1) {
            pdf.text(headerFit.text, headerX + venueColWidths[index] - pdf.getTextWidth(headerFit.text), tableY + 2);
          } else {
            pdf.text(headerFit.text, headerX, tableY + 2);
          }
          headerX += venueColWidths[index];
        });

        let rowY = tableY + venueHeaderH + 1.8;
        visibleRows.forEach((row, idx) => {
          if (idx % 2 === 0) {
            fillColor(P.bgPanel);
            pdf.roundedRect(tableX - 1.4, rowY - 3.6, innerW + 2.8, venueRowH, 1.6, 1.6, 'F');
          }

          const profitabilityTone = row.profit > (row.revenue * 0.15) ? P.green : (row.profit >= 0 ? P.gold : P.red);
          fillColor(profitabilityTone);
          pdf.circle(tableX + 1.8, rowY - 1.2, 1.1, 'F');

          pdf.setFont('helvetica', 'normal');
          const locationFit = fitSingleLineText(row.location || '-', venueColWidths[0] - 6.4, 'helvetica', 'normal', 7.4, 6.1);
          pdf.setFontSize(locationFit.fontSize);
          pdf.setTextColor(...P.textPrimary);
          let cellX = tableX;
          pdf.text(locationFit.text, cellX + 4.2, rowY);
          cellX += venueColWidths[0];
          const showsFit = fitSingleLineText(String(row.shows || 0), venueColWidths[1] - 2.2, 'courier', 'bold', 7.4, 6.2);
          pdf.setFont('courier', 'bold');
          pdf.setFontSize(showsFit.fontSize);
          pdf.text(showsFit.text, cellX + 1.2, rowY);
          cellX += venueColWidths[1];
          const revenueFit = fitSingleLineText(fmtUGX(row.revenue), venueColWidths[2] - 2.2, 'courier', 'bold', 7.4, 5.8);
          pdf.setFont('courier', 'bold');
          pdf.setFontSize(revenueFit.fontSize);
          pdf.text(revenueFit.text, cellX + 1.2, rowY);
          cellX += venueColWidths[2];
          const costFit = fitSingleLineText(fmtUGX(row.cost), venueColWidths[3] - 2.2, 'courier', 'bold', 7.4, 5.8);
          pdf.setTextColor(...P.textMuted);
          pdf.setFontSize(costFit.fontSize);
          pdf.text(costFit.text, cellX + 1.2, rowY);
          cellX += venueColWidths[3];
          const profitFit = fitSingleLineText(fmtUGX(row.profit), venueColWidths[4] - 2.2, 'courier', 'bold', 7.4, 5.8);
          textColor(row.profit >= 0 ? P.green : P.red);
          pdf.setFontSize(profitFit.fontSize);
          pdf.text(profitFit.text, cellX + 1.2, rowY);
          cellX += venueColWidths[4];
          textColor(row.roi >= 0 ? P.green : P.red);
          const roiFit = fitSingleLineText(`${row.roi.toFixed(0)}%`, venueColWidths[5] - 1.8, 'courier', 'bold', 7.4, 6);
          pdf.setFontSize(roiFit.fontSize);
          pdf.text(roiFit.text, cellX + venueColWidths[5] - pdf.getTextWidth(roiFit.text), rowY);
          rowY += venueRowH + 0.6;
        });

        const footerLine = rows.length > visibleRows.length
          ? `Showing top ${visibleRows.length} of ${rows.length} venues.`
          : 'Est. cost is apportioned by each city\'s share of booking revenue.';
        pdf.setFont('helvetica', 'normal');
        const footerFit = fitSingleLineText(footerLine, w - (cardPad * 2), 'helvetica', 'normal', 6.1, 5.4);
        pdf.setFontSize(footerFit.fontSize);
        pdf.setTextColor(...P.textMuted);
        pdf.text(footerFit.text, x + cardPad, yTop + h - 3.2);
      }

      async function renderBookingsMixCard(x, yTop, w, h) {
        glassPanel(x, yTop, w, h);
        const chartY = drawCardTitle('Bookings Mix', x, yTop, w) + 0.8;
        const chartH = h - (chartY - yTop) - cardPad;
        const statusEntries = Object.entries(m.statusCounts || {}).filter(([, count]) => Number(count) > 0);
        const totalStatuses = statusEntries.reduce((sum, [, count]) => sum + Number(count || 0), 0);
        const confirmedCount = Math.max(0, Number(m.confirmedCount) || 0);
        const confirmedPct = totalStatuses > 0 ? Math.round((confirmedCount / totalStatuses) * 100) : 0;

        const donutBoxW = Math.min(34, (w - (cardPad * 2)) * 0.42);
        const donutX = x + cardPad;
        const summaryX = donutX + donutBoxW + 8;
        const summaryW = x + w - cardPad - summaryX;

        if (typeof Chart !== 'undefined' && totalStatuses > 0) {
          const c3 = document.createElement('canvas');
          c3.width = 420;
          c3.height = 420;
          const ctx3 = c3.getContext('2d');
          ctx3.fillStyle = P.chartCard;
          ctx3.fillRect(0, 0, c3.width, c3.height);
          const sColors = { confirmed: '#22c55e', pending: '#FFB300', completed: '#60a5fa', cancelled: '#ef4444' };
          const ch3 = new Chart(ctx3, {
            type: 'doughnut',
            data: {
              labels: statusEntries.map(([status]) => status),
              datasets: [{
                data: statusEntries.map(([, count]) => count),
                backgroundColor: statusEntries.map(([status]) => sColors[status] || '#888'),
                borderColor: P.chartBorder,
                borderWidth: 3
              }]
            },
            options: {
              responsive: false,
              maintainAspectRatio: true,
              animation: { duration: 0 },
              cutout: '60%',
              plugins: { legend: { display: false } }
            }
          });
          ch3.update();
          await new Promise(r => { const t = setTimeout(r, 50); requestAnimationFrame(() => { clearTimeout(t); r(); }); });

          ctx3.save();
          ctx3.fillStyle = P.chartLegend;
          ctx3.font = 'bold 56px Courier New';
          ctx3.textAlign = 'center';
          ctx3.textBaseline = 'middle';
          ctx3.fillText(`${confirmedPct}%`, c3.width / 2, (c3.height / 2) - 10);
          ctx3.fillStyle = P.chartTicks;
          ctx3.font = '24px Courier New';
          ctx3.fillText(`${totalStatuses} bookings`, c3.width / 2, (c3.height / 2) + 34);
          ctx3.restore();

          drawContainedImage(
            c3.toDataURL('image/png', 1.0),
            donutX,
            chartY,
            donutBoxW,
            chartH,
            c3.width,
            c3.height
          );
          ch3.destroy();
        } else {
          pdf.setFont('helvetica', 'normal');
          pdf.setFontSize(9);
          pdf.setTextColor(...P.textPrimary);
          pdf.text('No booking data.', donutX, chartY + 12);
        }

        const summaryEntries = statusEntries.length > 0
          ? statusEntries.slice().sort((a, b) => b[1] - a[1]).slice(0, 3)
          : [['confirmed', 0]];
        const bulletColors = { confirmed: P.green, pending: P.gold, completed: P.blue, cancelled: P.red };
        let summaryY = chartY + 8;
        summaryEntries.forEach(([status, count], idx) => {
          fillColor(bulletColors[status] || P.textMuted);
          pdf.circle(summaryX + 2.2, summaryY - 1.3, 1.4, 'F');
          pdf.setFont('helvetica', 'bold');
          pdf.setFontSize(8.8);
          pdf.setTextColor(...P.textPrimary);
          pdf.text(status, summaryX + 6, summaryY);
          pdf.setFont('helvetica', 'normal');
          pdf.setFontSize(7.4);
          pdf.setTextColor(...P.textMuted);
          const detail = `${count} of ${totalStatuses} bookings`;
          const detailLines = pdf.splitTextToSize(detail, summaryW - 6);
          detailLines.slice(0, 2).forEach((line, lineIdx) => {
            pdf.text(line, summaryX + 6, summaryY + 4 + (lineIdx * 3.6));
          });
          summaryY += idx === 0 ? 16 : 12;
        });
      }

      async function renderWorldTourPanel(x, yTop, w, h) {
        glassPanel(x, yTop, w, h);
        const bodyY = drawCardTitle('Tour Map', x, yTop, w) + 0.8;
        const bodyH = h - (bodyY - yTop) - cardPad;
        const panelGap = 4;
        const mapPanelW = (w - (cardPad * 2) - panelGap) * 0.7;
        const sidebarW = (w - (cardPad * 2) - panelGap) - mapPanelW;
        const mapX = x + cardPad;
        const sidebarX = mapX + mapPanelW + panelGap;

        glassPanel(mapX, bodyY, mapPanelW, bodyH);
        glassPanel(sidebarX, bodyY, sidebarW, bodyH);

        const tourMapCanvas = buildPdfTourMapCanvas(pdfData.metrics.pdfVenuePerf || []);
        if (tourMapCanvas) {
          pdf.addImage(
            tourMapCanvas.toDataURL('image/png', 0.98),
            'PNG',
            mapX + 2,
            bodyY + 2,
            mapPanelW - 4,
            bodyH - 4
          );
        } else {
          pdf.setFont('helvetica', 'normal');
          pdf.setFontSize(9);
          pdf.setTextColor(...P.textMuted);
          pdf.text('Map preview unavailable.', mapX + 6, bodyY + 10);
        }

        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(10);
        pdf.setTextColor(...P.gold);
        pdf.text('Next on Stage', sidebarX + 6, bodyY + 8);

        const sidebarItems = Array.isArray(pdfData.nextOnStage) ? pdfData.nextOnStage.slice(0, 3) : [];
        const footerLeftX = sidebarX + 6;
        const footerRightX = sidebarX + sidebarW - 6;
        const footerSeparatorY = yTop + h - 13.5;
        const itemsBottomLimit = footerSeparatorY - 4;
        const footerLabelY = footerSeparatorY + 4.8;
        const footerMetaY = footerSeparatorY + 9.2;
        let itemY = bodyY + 16;
        if (sidebarItems.length === 0) {
          pdf.setFont('helvetica', 'normal');
          pdf.setFontSize(8.4);
          pdf.setTextColor(...P.textMuted);
          pdf.text('No upcoming or recent bookings to highlight.', sidebarX + 6, itemY);
        } else {
          let renderedSidebarItems = 0;
          for (const booking of sidebarItems) {
            const venueFit = fitMultilineText(
              String(booking.event || booking.location || booking.artist || 'Untitled booking'),
              sidebarW - 12,
              2,
              'helvetica',
              'normal',
              7.8
            );
            const itemBottomY = itemY + 4.2 + ((venueFit.lines.length - 1) * 3.8);
            if (renderedSidebarItems > 0 && itemBottomY > itemsBottomLimit) {
              break;
            }

            if (renderedSidebarItems > 0) {
              pdf.setDrawColor(...P.border);
              pdf.setLineWidth(0.18);
              pdf.line(sidebarX + 6, itemY - 4, sidebarX + sidebarW - 6, itemY - 4);
            }

            pdf.setFont('courier', 'bold');
            pdf.setFontSize(8.4);
            pdf.setTextColor(...P.gold);
            pdf.text(fmtDate(booking.date), sidebarX + 6, itemY);

            const statusText = String(booking.status || 'pending');
            const statusTone = statusText.toLowerCase() === 'confirmed'
              ? P.green
              : statusText.toLowerCase() === 'pending'
                ? P.gold
                : P.textMuted;
            pdf.setFont('helvetica', 'bold');
            pdf.setFontSize(7.2);
            pdf.setTextColor(...statusTone);
            const statusLabel = statusText.charAt(0).toUpperCase() + statusText.slice(1);
            const statusFit = fitSingleLineText(statusLabel, 24, 'helvetica', 'bold', 7.2, 6);
            pdf.setFontSize(statusFit.fontSize);
            pdf.text(statusFit.text, sidebarX + sidebarW - 6 - pdf.getTextWidth(statusFit.text), itemY);

            pdf.setFont('helvetica', 'normal');
            pdf.setFontSize(venueFit.fontSize);
            pdf.setTextColor(...P.textPrimary);
            venueFit.lines.forEach((line, lineIdx) => {
              pdf.text(line, sidebarX + 6, itemY + 4.2 + (lineIdx * 3.8));
            });
            renderedSidebarItems += 1;
            itemY = itemBottomY + 6.2;
          }
        }

        pdf.setDrawColor(...P.border);
        pdf.setLineWidth(0.18);
        pdf.line(footerLeftX, footerSeparatorY, footerRightX, footerSeparatorY);
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(6.8);
        pdf.setTextColor(...P.textMuted);
        pdf.text('Projected Revenue', footerLeftX, footerLabelY);
        const forecastLabel = pdfData.projectedRevenueShows > 0
          ? `${fmtUGX(pdfData.projectedRevenue)}`
          : 'UGX 0';
        const forecastValueLabelW = pdf.getTextWidth('Projected Revenue');
        const forecastValueMaxW = Math.max(24, footerRightX - footerLeftX - forecastValueLabelW - 5);
        const forecastValueFit = fitSingleLineText(forecastLabel, forecastValueMaxW, 'courier', 'bold', 10.2, 6.6);
        pdf.setFont('courier', 'bold');
        pdf.setFontSize(forecastValueFit.fontSize);
        pdf.setTextColor(...P.textPrimary);
        pdf.text(forecastValueFit.text, footerRightX - pdf.getTextWidth(forecastValueFit.text), footerLabelY);
        pdf.setFont('helvetica', 'normal');
        const forecastMeta = pdfData.projectedRevenueShows > 0
          ? `${pdfData.projectedRevenueShows} upcoming show${pdfData.projectedRevenueShows === 1 ? '' : 's'} in the next month`
          : 'No confirmed revenue forecast in the next month';
        const forecastMetaFit = fitMultilineText(
          forecastMeta,
          sidebarW - 12,
          1,
          'helvetica',
          'normal',
          5.8
        );
        pdf.setFontSize(forecastMetaFit.fontSize);
        pdf.setTextColor(...P.textMuted);
        if (forecastMetaFit.lines[0]) {
          pdf.text(forecastMetaFit.lines[0], footerLeftX, footerMetaY);
        }
      }

      function renderCoverageSnapshotRow(x, yTop, w, h) {
        const venueRows = pdfData.metrics.pdfVenuePerf || [];
        const totalShows = venueRows.reduce((sum, row) => sum + Math.max(0, Number(row.shows) || 0), 0);
        const topMarket = venueRows[0] || null;
        const topShare = topMarket && pdfData.metrics.totalIncome > 0
          ? Math.round((topMarket.revenue / pdfData.metrics.totalIncome) * 100)
          : 0;
        const items = [
          { label: 'Run Type', value: getPdfRunTypeLabel(venueRows) },
          { label: 'Top Market', value: topMarket ? `${topMarket.location} - ${topShare}% Rev` : 'No market yet' },
          { label: 'Shows', value: String(totalShows) },
          { label: 'Audience', value: audienceTrend?.latestTotals?.social ? `${fmtCompactCount(audienceTrend.latestTotals.social)}+ Followers` : 'Live demand active' }
        ];

        const gap = 4;
        const itemW = (w - (gap * 3)) / 4;
        items.forEach((item, idx) => {
          const ix = x + idx * (itemW + gap);
          glassPanel(ix, yTop, itemW, h);
          pdf.setFont('helvetica', 'normal');
          pdf.setFontSize(6.8);
          pdf.setTextColor(...P.textMuted);
          pdf.text(item.label.toUpperCase(), ix + 6, yTop + 6.2);
          const valueFit = fitSingleLineText(String(item.value || '-'), itemW - 12, 'courier', 'bold', 10.5, 7);
          pdf.setFont('courier', 'bold');
          pdf.setFontSize(valueFit.fontSize);
          pdf.setTextColor(...P.textPrimary);
          pdf.text(valueFit.text, ix + 6, yTop + 12.8);
        });
      }

      const worldTourH = 74;
      const snapshotH = 18;
      const bottomRowH = Math.max(36, (H - mg - footerH) - (y + worldTourH + snapshotH + (sectionGap * 2)));
      const bottomGap = 4;
      const venueCardW = (cw - bottomGap) * 0.58;
      const bookingsCardW = cw - bottomGap - venueCardW;
      y = ensureSectionPageBreak(y, worldTourH + snapshotH + bottomRowH + (sectionGap * 2), 'THE WORLD TOUR', { allowHeuristicBreak: false });
      await renderWorldTourPanel(mg, y, cw, worldTourH);
      y += worldTourH + sectionGap;
      renderCoverageSnapshotRow(mg, y, cw, snapshotH);
      y += snapshotH + sectionGap;
      await renderVenuePerformanceCard(mg, y, venueCardW, bottomRowH);
      await renderBookingsMixCard(mg + venueCardW + bottomGap, y, bookingsCardW, bottomRowH);
      y += bottomRowH + sectionGap;

      // =====================================================================
      // PAGE 3+: The Proof of Work
      // =====================================================================
      pdf.addPage();
      drawPageBg();
      drawHeader('THE PROOF OF WORK');
      y = contentTop;

      const allTx = Array.isArray(pdfData.ledgerTransactions) ? pdfData.ledgerTransactions : [];

      if (allTx.length === 0) {
        y = sectionTitle('Transaction Ledger', y);
        glassPanel(mg, y, cw, 16);
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(9);
        pdf.setTextColor(...P.textPrimary);
        pdf.text('No transactions in this period.', mg + cardPad, y + 9);
      } else {
        const ledgerDateW = 24;
        const ledgerTypeW = 22;
        const ledgerAmountW = 34;
        const ledgerDescW = cw - (cardPad * 2) - ledgerDateW - ledgerTypeW - ledgerAmountW - 4;
        const ledgerHeaderH = 5.6;
        const ledgerRowH = 5.4;
        let txIndex = 0;

        while (txIndex < allTx.length) {
          y = ensureSectionPageBreak(y, 70, 'THE PROOF OF WORK');
          y = sectionTitle('Transaction Ledger', y);

          const rowsPerPage = Math.max(
            1,
            Math.floor(((H - mg - footerH) - (y + cardPad + ledgerHeaderH + 2)) / ledgerRowH)
          );
          const chunk = allTx.slice(txIndex, txIndex + rowsPerPage);
          const panelH = (cardPad * 2) + ledgerHeaderH + (chunk.length * ledgerRowH) + 2;
          glassPanel(mg, y, cw, panelH);

          const tableX = mg + cardPad;
          const tableY = y + cardPad;
          const typeX = tableX + ledgerDateW;
          const descX = typeX + ledgerTypeW;
          const amountRight = mg + cw - cardPad;

          fillColor(P.bgPanel);
          pdf.rect(tableX - 1.4, tableY - 1.6, cw - ((cardPad * 2) - 2.8), ledgerHeaderH, 'F');
          pdf.setFont('helvetica', 'bold');
          pdf.setFontSize(7.2);
          pdf.setTextColor(...P.gold);
          pdf.text('Date', tableX, tableY + 2.2);
          pdf.text('Type', typeX, tableY + 2.2);
          pdf.text('Description', descX, tableY + 2.2);
          const amountLabel = 'Amount';
          pdf.text(amountLabel, amountRight - pdf.getTextWidth(amountLabel), tableY + 2.2);

          let rowY = tableY + ledgerHeaderH + 1.6;
          chunk.forEach((tx, idx) => {
            if (idx % 2 === 0) {
              fillColor(P.bgPanel);
              pdf.rect(tableX - 1.4, rowY - 3.7, cw - ((cardPad * 2) - 2.8), ledgerRowH, 'F');
            }

            const descFit = fitSingleLineText(String(tx.desc || '-'), ledgerDescW, 'helvetica', 'normal', 7.5, 6);
            const typeFit = fitSingleLineText(String(tx.type || '-'), ledgerTypeW - 1, 'helvetica', 'normal', 7.5, 6.2);
            const amountFit = fitSingleLineText(formatMoney(tx.amount), ledgerAmountW, 'courier', 'bold', 7.5, 5.6);

            pdf.setFont('helvetica', 'normal');
            pdf.setFontSize(descFit.fontSize);
            pdf.setTextColor(...P.textPrimary);
            pdf.text(fmtDate(tx.date), tableX, rowY);
            pdf.text(typeFit.text, typeX, rowY);
            pdf.text(descFit.text, descX, rowY);

            pdf.setFont('courier', 'bold');
            const amtColor = tx.type === 'Expense' ? P.red : (tx.type === 'Income' ? P.blue : P.green);
            textColor(amtColor);
            pdf.setFontSize(amountFit.fontSize);
            pdf.text(amountFit.text, amountRight - pdf.getTextWidth(amountFit.text), rowY);

            pdf.setDrawColor(...P.border);
            pdf.setLineWidth(0.08);
            pdf.line(tableX - 1.4, rowY + 1.5, mg + cw - cardPad + 1.4, rowY + 1.5);
            rowY += ledgerRowH;
          });

          txIndex += chunk.length;
          y += panelH + sectionGap;
          if (txIndex < allTx.length) {
            pdf.addPage();
            drawPageBg();
            drawHeader('THE PROOF OF WORK');
            y = contentTop;
          }
        }
      }

      const strategyNotes = Array.isArray(pdfData.strategyNotes) && pdfData.strategyNotes.length > 0
        ? pdfData.strategyNotes
        : ['Add more data to strengthen strategy notes and performance focus.'];

      const noteItems = [];
      strategyNotes.forEach((line) => {
        const wrappedLines = pdf.splitTextToSize(line, cw - (cardPad * 2) - 8);
        wrappedLines.forEach((wrappedLine, idx) => {
          noteItems.push({ text: wrappedLine, bullet: idx === 0 });
        });
      });

      pdf.addPage();
      drawPageBg();
      drawHeader('THE GAME PLAN');
      y = contentTop;

      let noteIndex = 0;
      while (noteIndex < noteItems.length) {
        y = ensureSectionPageBreak(y, 60, 'THE GAME PLAN');
        y = sectionTitle('The Game Plan', y);
        const notesLineHeight = 4.8;
        const linesPerPage = Math.max(
          1,
          Math.floor(((H - mg - footerH) - (y + cardPad + 2)) / notesLineHeight)
        );
        const noteChunk = noteItems.slice(noteIndex, noteIndex + linesPerPage);
        const notesH = (cardPad * 2) + (noteChunk.length * notesLineHeight) + 2;
        glassPanel(mg, y, cw, notesH);

        let noteY = y + cardPad + 2.2;
        noteChunk.forEach((item) => {
          pdf.setFont('helvetica', 'normal');
          pdf.setFontSize(8.5);
          if (item.bullet) {
            pdf.setTextColor(...P.gold);
            pdf.text('-', mg + cardPad, noteY);
          }
          pdf.setTextColor(...P.textPrimary);
          pdf.text(item.text, mg + cardPad + 5, noteY);
          noteY += notesLineHeight;
        });

        noteIndex += noteChunk.length;
        y += notesH + sectionGap;
        if (noteIndex < noteItems.length) {
          pdf.addPage();
          drawPageBg();
          drawHeader('THE GAME PLAN');
          y = contentTop;
        }
      }
      // ── Add footers to all pages ──
      const totalPages = pdf.getNumberOfPages();
      for (let p = 1; p <= totalPages; p++) {
        pdf.setPage(p);
        drawFooter(p, totalPages);
      }

      // ── Save ──
      const safeName = artistObj ? artistName.replace(/[^a-zA-Z0-9]/g, '-') : 'Report';
      const periodStr = actualPeriodLabel.replace(/\s+/g, '-');
      pdf.save(`Money-Moves-${safeName}-${periodStr}.pdf`);

      if (typeof window.toastSuccess === 'function') {
        window.toastSuccess(`${artistObj ? artistName + "'s Money Moves" : 'Money Moves'} report downloaded`);
      }
    } catch (err) {
      if (typeof window.toastError === 'function') window.toastError('PDF generation failed');
      if (typeof Sentry !== 'undefined') Sentry.captureException(err);
    } finally {
      generateMomentumPDF._busy = false;
    }
  }

  // ── WINDOW EXPOSURE ──────────────────────────────────────────────────────────
  window.renderMomentumDashboard ||= renderDashboard;
  window.generateMomentumPDF ||= generateMomentumPDF;
  window.openPdfExportModal ||= openPdfExportModal;
  window.closePdfExportModal ||= closePdfExportModal;

  // Listen for period changes to auto-refresh
  document.addEventListener('DOMContentLoaded', () => {
    const periodEl = document.getElementById('reportPeriod');
    if (periodEl) {
      periodEl.addEventListener('change', () => {
        setTimeout(renderDashboard, 50);
      });
    }
  });

  // Auto-render when reports tab becomes visible
  const _origShowSection = window.showSection;
  if (typeof _origShowSection === 'function') {
    window.showSection = function (section) {
      _origShowSection(section);
      if (section === 'money') {
        setTimeout(renderDashboard, 100);
      }
    };
  }

})();
