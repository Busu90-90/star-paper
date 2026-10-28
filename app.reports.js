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
  const REPORT_RUNTIME_VERSION = 'report-runtime-v19';
  window.SP_REPORT_RUNTIME_VERSION = REPORT_RUNTIME_VERSION;

  function buildStarPaperChartTheme(mode = 'dark') {
    const light = mode === 'light';
    const palette = light
      ? {
          surface: '#FFF9ED',
          surfaceAlt: '#F7EFD9',
          ink: '#17130B',
          muted: '#665334',
          faint: '#8A7650',
          grid: 'rgba(95, 74, 33, 0.18)',
          border: 'rgba(138, 109, 26, 0.28)',
          tooltipBg: 'rgba(255, 250, 239, 0.98)',
          tooltipBorder: 'rgba(184, 137, 47, 0.64)',
          gold: '#B8892F',
          goldBright: '#D4A843',
          goldSoft: 'rgba(184, 137, 47, 0.18)',
          silver: '#6F7480',
          revenue: '#8A6D1A',
          revenueFill: 'rgba(184, 137, 47, 0.18)',
          other: '#52677F',
          otherFill: 'rgba(82, 103, 127, 0.14)',
          expense: '#9A3412',
          expenseFill: 'rgba(154, 52, 18, 0.14)',
          profit: '#2F6B3F',
          profitFill: 'rgba(47, 107, 63, 0.14)',
          red: '#B42318',
          green: '#257A3E',
          blue: '#2F5D8C'
        }
      : {
          surface: '#101116',
          surfaceAlt: '#171922',
          ink: '#F8EED2',
          muted: '#B9AA83',
          faint: '#8C846F',
          grid: 'rgba(248, 237, 207, 0.10)',
          border: 'rgba(212, 168, 67, 0.24)',
          tooltipBg: 'rgba(13, 14, 18, 0.96)',
          tooltipBorder: 'rgba(212, 168, 67, 0.58)',
          gold: '#D4A843',
          goldBright: '#F2CF75',
          goldSoft: 'rgba(212, 168, 67, 0.22)',
          silver: '#B8BDC7',
          revenue: '#F2CF75',
          revenueFill: 'rgba(212, 168, 67, 0.18)',
          other: '#B8BDC7',
          otherFill: 'rgba(184, 189, 199, 0.12)',
          expense: '#F59E72',
          expenseFill: 'rgba(245, 158, 114, 0.13)',
          profit: '#9CCF9B',
          profitFill: 'rgba(156, 207, 155, 0.13)',
          red: '#F87171',
          green: '#86D28C',
          blue: '#A8B8D8'
        };
    return {
      ...palette,
      pie: [palette.goldBright, palette.silver, palette.profit, palette.expense, palette.blue, '#8B7BD4', '#C08B5C', '#7E8794'],
      fontFamily: "'Montserrat', 'Inter', system-ui, sans-serif",
      monoFamily: "'Courier New', monospace"
    };
  }

  if (!window.SP_CHART_THEME) {
    window.SP_CHART_THEME = {
      get(mode) {
        const selected = mode || (document.body.classList.contains('light-theme') ? 'light' : 'dark');
        return buildStarPaperChartTheme(selected);
      }
    };
  }

  function chartTheme() {
    return (window.SP_CHART_THEME && typeof window.SP_CHART_THEME.get === 'function')
      ? window.SP_CHART_THEME.get()
      : buildStarPaperChartTheme(document.body.classList.contains('light-theme') ? 'light' : 'dark');
  }

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

  function getAudiencePlatformRows(audienceTrend) {
    const totals = audienceTrend?.latestTotals || {};
    return [
      { key: 'social', platform: 'Social Media', summaryLabel: 'Social Media:', pdfPrefix: 'Social media followers:', value: totals.social, unit: 'social media followers', compactUnit: 'followers' },
      { key: 'spotify', platform: 'Spotify', summaryLabel: 'Spotify:', pdfPrefix: 'Spotify:', value: totals.spotify, unit: 'monthly listeners', compactUnit: 'listeners' },
      { key: 'youtube', platform: 'YouTube', summaryLabel: 'YouTube:', pdfPrefix: 'YouTube:', value: totals.youtube, unit: 'monthly listeners', compactUnit: 'listeners' },
    ].map((row) => ({
      ...row,
      value: Math.round(Number(row.value) || 0)
    })).filter((row) => row.value > 0);
  }

  function formatAudiencePlatformSummary(audienceTrend, { compact = false } = {}) {
    const rows = getAudiencePlatformRows(audienceTrend);
    if (!rows.length) return '';
    return rows.map((row) => {
      const count = compact ? fmtCompactCount(row.value) : row.value.toLocaleString();
      return `${row.summaryLabel} ${count} ${row.unit}`;
    }).join(' | ');
  }

  function getCurrentThemeMode() {
    if (document.body.classList.contains('light-theme')) return 'light';
    try {
      if (window.localStorage?.getItem('starPaperTheme') === 'light') return 'light';
    } catch (_e) { /* ignore */ }
    return 'dark';
  }

  function getCurrentReportArtistFilter() {
    return String(document.getElementById('spPdfArtistSelect')?.value || '').trim();
  }

  function reportRecordMatchesArtist(record, artistName = '', artistId = '') {
    const normalizedId = String(artistId || '').trim();
    const normalizedName = String(artistName || '').trim().toLowerCase();
    if (!normalizedId && !normalizedName) return true;
    if (!record || typeof record !== 'object') return false;
    const recordArtistId = String(record.artistId || '').trim();
    const recordArtistName = String(record.artist || record.artistName || '').trim().toLowerCase();
    if (normalizedId && recordArtistId && recordArtistId === normalizedId) return true;
    if (normalizedName && recordArtistName && recordArtistName === normalizedName) return true;
    return false;
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

  function buildPdfNextOnStage(bookings, artistName, maxItems = 3, artistId = '') {
    const allBookings = Array.isArray(bookings) ? bookings : [];
    const today = new Date().toISOString().slice(0, 10);
    const relevant = allBookings
      .filter((booking) => booking && booking.date)
      .filter((booking) => reportRecordMatchesArtist(booking, artistName, artistId))
      .filter((booking) => String(booking.status || '').toLowerCase() !== 'cancelled');

    const future = relevant
      .filter((booking) => booking.date >= today)
      .sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')));
    if (future.length > 0) return future.slice(0, maxItems);

    // Nothing ahead: the most recent shows, flagged so the report titles them
    // "Last on stage" and never passes them off as coming up.
    const past = relevant
      .slice()
      .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))
      .slice(0, maxItems);
    past.isPast = true;
    return past;
  }

  function buildPdfForecastBookings(bookings, artistName, anchorDateIso, maxDays = 31, artistId = '') {
    const allBookings = Array.isArray(bookings) ? bookings : [];
    const anchorDate = new Date(anchorDateIso || new Date().toISOString().slice(0, 10));
    if (Number.isNaN(anchorDate.getTime())) return [];
    const endDate = new Date(anchorDate);
    endDate.setDate(endDate.getDate() + Math.max(1, Number(maxDays) || 31));
    const startIso = anchorDate.toISOString().slice(0, 10);
    const endIso = endDate.toISOString().slice(0, 10);

    return allBookings
      .filter((booking) => booking && booking.date)
      .filter((booking) => reportRecordMatchesArtist(booking, artistName, artistId))
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
    const periodNetProfit = Number(data?.periodNetProfit ?? netProfit) || 0;
    const bbf = Number(data?.bbf) || 0;
    const closingBalance = Number(data?.closingBalance ?? (bbf + periodNetProfit)) || 0;

    // Cancelled shows stay in the status counts but earn nothing.
    const liveBookings = filteredBookings.filter(b => String(b?.status || '').toLowerCase() !== 'cancelled');
    const totalBookings = liveBookings.length;
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

    const totalCapacity = liveBookings.reduce((sum, b) => sum + Math.max(0, Math.round(Number(b.capacity) || 0)), 0);
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
    liveBookings.forEach(b => {
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
    liveBookings.forEach(b => {
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
      const costPerShow = liveBookings.length > 0
        ? Math.round(totalExpenses / liveBookings.length)
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
      grossIncome, netProfit, periodNetProfit, bbf, closingBalance, totalIncome, totalExpenses, totalOtherIncome,
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
      if (social !== 0) insights.push(`Social media followers ${formatDelta(social)} since last month`);
      if (spotify !== 0) insights.push(`Spotify listeners ${formatDelta(spotify)} since last month`);
      if (youtube !== 0) insights.push(`YouTube listeners ${formatDelta(youtube)} since last month`);
    } else if (audienceTrend && audienceTrend.latestTotals) {
      const audienceSummary = formatAudiencePlatformSummary(audienceTrend);
      if (audienceSummary) insights.push(`Audience snapshot: ${audienceSummary}`);
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
    const allBookings = (Array.isArray(bookings) ? bookings : [])
      .filter((booking) => String(booking?.status || '').toLowerCase() !== 'cancelled');
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
          .filter((booking) => String(booking?.status || '').toLowerCase() !== 'cancelled')
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
    const audienceSummary = formatAudiencePlatformSummary(audienceTrend);
    if (audienceSummary) {
      notes.push(`Audience snapshot: ${audienceSummary}.`);
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

  function renderReportFocusLines(bodyEl, lines) {
    const fragment = document.createDocumentFragment();
    lines.forEach((line) => {
      const row = document.createElement('div');
      row.textContent = String(line ?? '');
      fragment.appendChild(row);
    });
    bodyEl.replaceChildren(fragment);
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
      renderReportFocusLines(bodyEl, state.lines || fallback.lines);
    }
  }

  function darkChartDefaults() {
    const T = chartTheme();
    return {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 620, easing: 'easeOutQuart' },
      layout: { padding: { top: 8, right: 8, bottom: 4, left: 4 } },
      plugins: {
        legend: {
          labels: {
            color: T.ink,
            font: { size: 11, family: T.fontFamily, weight: '700' },
            usePointStyle: true,
            pointStyle: 'rectRounded',
            padding: 14
          }
        },
        tooltip: {
          backgroundColor: T.tooltipBg,
          titleColor: T.goldBright,
          bodyColor: T.ink,
          borderColor: T.tooltipBorder,
          borderWidth: 1,
          cornerRadius: 10,
          padding: 12,
          displayColors: true,
          boxPadding: 4,
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
    const T = chartTheme();

    _charts.momentum = new Chart(canvas, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: 'Revenue',
            data: revData,
            borderColor: T.revenue,
            backgroundColor: T.revenueFill,
            fill: true,
            tension: 0.42,
            borderWidth: 3,
            pointRadius: 3.5,
            pointHoverRadius: 6,
            pointBackgroundColor: T.surface,
            pointBorderColor: T.revenue,
            pointBorderWidth: 2,
          },
          {
            label: 'Expenses',
            data: expData,
            borderColor: T.expense,
            backgroundColor: T.expenseFill,
            fill: false,
            tension: 0.42,
            borderWidth: 2.5,
            borderDash: [6, 4],
            pointRadius: 2.5,
            pointBackgroundColor: T.surface,
            pointBorderColor: T.expense,
            pointBorderWidth: 2,
          },
          {
            label: 'Net Profit',
            data: profitData,
            borderColor: T.profit,
            backgroundColor: T.profitFill,
            fill: true,
            tension: 0.42,
            borderWidth: 2.5,
            pointRadius: 3,
            pointBackgroundColor: T.surface,
            pointBorderColor: T.profit,
            pointBorderWidth: 2,
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
          x: { ticks: { color: T.muted, font: { family: T.fontFamily, weight: '700' } }, grid: { color: T.grid } },
          y: {
            ticks: { color: T.muted, font: { family: T.fontFamily, weight: '700' }, callback: v => fmtUGX(v) },
            grid: { color: T.grid }
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
    const T = chartTheme();
    _charts.cost = new Chart(canvas, {
      type: 'doughnut',
      data: {
        labels,
        datasets: [{
          data: values,
          backgroundColor: T.pie.slice(0, entries.length),
          borderColor: T.surface,
          borderWidth: 3,
          hoverBorderColor: T.goldBright,
          hoverOffset: 4,
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
    const T = chartTheme();
    const statusColors = { confirmed: T.profit, pending: T.goldBright, completed: T.silver, cancelled: T.red };
    _charts.status = new Chart(canvas, {
      type: 'doughnut',
      data: {
        labels,
        datasets: [{
          data: values,
          backgroundColor: entries.map(e => statusColors[e[0]] || T.faint),
          borderColor: T.surface,
          borderWidth: 3,
          hoverBorderColor: T.goldBright,
          hoverOffset: 4,
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
    fillReportArtists();
    const previousArtistFilter = getCurrentReportArtistFilter();

    // Get period data
    const getPeriod = window.getReportPeriodSelection || (() => ({ period: 'month', periodLabel: new Date().toLocaleString('en-US', { month: 'long', year: 'numeric' }) }));
    const getData = window.getReportPeriodData || (() => ({
      filteredBookings: [], filteredExpenses: [], filteredOtherIncome: [],
      totalIncome: 0, totalExpenses: 0, totalOtherIncome: 0, netProfit: 0, periodNetProfit: 0, balancesDue: 0, totalBookings: 0, bbf: 0, closingBalance: 0
    }));

    const { period, periodLabel } = getPeriod();
    const artists = Array.isArray(window.artists) ? window.artists : [];
    const selectedArtist = artists.some(a => a.name === previousArtistFilter) ? previousArtistFilter : '';
    const selectedArtistObj = selectedArtist ? artists.find(a => a.name === selectedArtist) : null;
    const selectedArtistId = selectedArtistObj?.id || '';
    let data = getData(period, { sortNewestFirst: true, selectedArtist, artistId: selectedArtistId });

    // Previous period data for trend
    const prevPeriodMap = { month: 'prevMonth', year: 'prevYear', quarter: 'all', prevMonth: 'month', prevYear: 'year', all: 'all' };
    const prevPeriod = prevPeriodMap[period] || 'all';
    const prevData = getData(prevPeriod, { sortNewestFirst: false, selectedArtist, artistId: selectedArtistId });

    const m = computeMetrics(data, prevData);
    const artistObj = selectedArtistObj;
    const audienceTrend = getAudienceTrend(Array.isArray(window.audienceMetrics) ? window.audienceMetrics : [], selectedArtist, artistObj?.id);
    const upcomingShows = (Array.isArray(window.bookings) ? window.bookings : [])
      .filter(b => b && b.date)
      .filter(b => b.status !== 'cancelled')
      .filter(b => reportRecordMatchesArtist(b, selectedArtist, selectedArtistId))
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
    const trendToneClass = m.trendPct >= 0 ? 'sp-rpt-tone-good' : 'sp-rpt-tone-bad';
    const marginToneClass = m.profitMargin >= 20 ? 'sp-rpt-tone-good' : m.profitMargin >= 0 ? 'sp-rpt-tone-gold' : 'sp-rpt-tone-bad';

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
          <div class="sp-rpt-hero__trend ${trendToneClass}">
            <i class="ph ${trendIcon}" aria-hidden="true"></i> ${fmtPct(m.trendPct)} vs previous
          </div>
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
          <div class="sp-rpt-kpi__value sp-rpt-tone-good">${fmtUGX(m.grossIncome)}</div>
          <div class="sp-rpt-kpi__sub">${m.totalBookings} bookings</div>
        </div>
        <div class="sp-rpt-kpi sp-haptic">
          <div class="sp-rpt-kpi__label">Expenses</div>
          <div class="sp-rpt-kpi__value sp-rpt-tone-bad">${fmtUGX(m.totalExpenses)}</div>
          <div class="sp-rpt-kpi__sub">${Object.keys(m.expenseByCat).length} categories</div>
        </div>
        <div class="sp-rpt-kpi sp-haptic">
          <div class="sp-rpt-kpi__label">Profit Margin</div>
          <div class="sp-rpt-kpi__value ${marginToneClass}">${m.profitMargin.toFixed(1)}%</div>
          <div class="sp-rpt-kpi__sub">${m.profitMargin >= 20 ? 'Healthy' : m.profitMargin >= 0 ? 'Watch' : 'Loss'}</div>
        </div>
        <div class="sp-rpt-kpi sp-haptic">
          <div class="sp-rpt-kpi__label">Avg Per Show</div>
          <div class="sp-rpt-kpi__value">${fmtUGX(m.avgPerShow)}</div>
          <div class="sp-rpt-kpi__sub">per booking</div>
        </div>
        <div class="sp-rpt-kpi sp-haptic">
          <div class="sp-rpt-kpi__label">Balances Due</div>
          <div class="sp-rpt-kpi__value ${m.balancesDue > 0 ? 'sp-rpt-tone-bad' : 'sp-rpt-tone-good'}">${fmtUGX(m.balancesDue)}</div>
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
                  <td class="sp-rpt-num ${r.profit >= 0 ? 'sp-rpt-tone-good' : 'sp-rpt-tone-bad'}">${fmtUGX(r.profit)}</td>
                  <td class="sp-rpt-num ${r.roi >= 0 ? 'sp-rpt-tone-good' : 'sp-rpt-tone-bad'}">${r.roi.toFixed(0)}%</td>
                </tr>
              `).join('') : '<tr><td class="sp-rpt-empty-cell" colspan="6">No venue data yet</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>

      <!-- ACHIEVEMENTS + RECOMMENDATIONS -->
      <div class="sp-rpt-bottom-row">
        <div class="sp-rpt-achievements sp-haptic">
          <h4 class="sp-rpt-chart-title"><i class="ph-duotone ph-trophy" aria-hidden="true"></i> Achievements</h4>
          <div class="sp-rpt-badge-list">
            ${m.bestMonth ? `<div class="sp-rpt-badge"><i class="ph-duotone ph-star sp-rpt-tone-gold"></i> Best Month: ${monthLabel(m.bestMonth[0])} (${fmtUGX(m.bestMonth[1])})</div>` : ''}
            ${m.topCity ? `<div class="sp-rpt-badge"><i class="ph-duotone ph-map-pin sp-rpt-tone-good"></i> Top City: ${escapeHTML(m.topCity[0])}</div>` : ''}
            ${m.totalBookings >= 10 ? `<div class="sp-rpt-badge"><i class="ph-duotone ph-fire sp-rpt-tone-orange"></i> ${m.totalBookings} Shows Booked</div>` : ''}
            ${m.profitMargin >= 30 ? `<div class="sp-rpt-badge"><i class="ph-duotone ph-rocket sp-rpt-tone-gold"></i> 30%+ Profit Margin</div>` : ''}
            ${(!m.bestMonth && !m.topCity) ? '<div class="sp-rpt-badge sp-rpt-tone-muted"><i class="ph ph-info"></i> Keep adding data to unlock achievements</div>' : ''}
          </div>
        </div>
        <div class="sp-rpt-recs sp-haptic">
          <h4 class="sp-rpt-chart-title"><i class="ph ph-lightbulb" aria-hidden="true"></i> Smart Recommendations</h4>
          <div class="sp-rpt-rec-list">
            ${recs.map(r => `<div class="sp-rpt-rec"><i class="ph ${r.icon} sp-rpt-tone-gold"></i> ${escapeHTML(r.text)}</div>`).join('')}
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

    // Render charts after DOM is in place. Chart.js is lazy-loaded so auth boot
    // is not competing with report visuals on first paint.
    requestAnimationFrame(() => {
      const renderCharts = () => {
        renderMomentumChart(m);
        renderCostDoughnut(m);
        renderStatusPie(m);
        updateReportFocusPanel();
        wireReportRowInteractions();
      };
      if (!window.Chart && typeof window.__spLoadDeferredLibrary === 'function') {
        window.__spLoadDeferredLibrary('chart')
          .then(renderCharts)
          .catch(() => {
            updateReportFocusPanel();
            wireReportRowInteractions();
          });
        return;
      }
      renderCharts();
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

    if (all.length === 0) return '<p class="sp-rpt-ledger-note">No transactions in this period</p>';

    const rows = all.slice(0, 100).map(t => {
      const amountToneClass = t.sign === '+' ? 'sp-rpt-tone-good' : 'sp-rpt-tone-bad';
      const fmtDate = t.date ? new Date(t.date).toLocaleDateString('en-GB') : '—';
      return `<tr>
        <td>${fmtDate}</td>
        <td><span class="sp-rpt-ledger-type sp-rpt-ledger-type--${t.type.toLowerCase()}">${t.type}</span></td>
        <td>${escapeHTML(t.desc)}</td>
        <td class="sp-rpt-num ${amountToneClass}">${t.sign}${fmtUGX(t.amount).replace('UGX ', '')}</td>
      </tr>`;
    }).join('');

    return `<table class="sp-rpt-table sp-rpt-table--ledger">
      <thead><tr><th>Date</th><th>Type</th><th>Description</th><th class="sp-rpt-num">Amount</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>${all.length > 100 ? '<p class="sp-rpt-ledger-note sp-rpt-ledger-note--small">Showing first 100 of ' + all.length + ' entries</p>' : ''}`;
  }

  // ── REPORT PICKER ───────────────────────────────────────────────────────────
  // The "Who" list on the report card: the whole roster or one artist. Kept in
  // step with the roster, and the choice survives a refresh.
  function fillReportArtists() {
    const sel = document.getElementById('spPdfArtistSelect');
    if (!sel) return;
    const artists = Array.isArray(window.artists) ? window.artists : [];
    const picked = sel.value;
    sel.replaceChildren(new Option('Whole roster', ''));
    artists.forEach((a) => { if (a && a.name) sel.appendChild(new Option(a.name, a.name)); });
    sel.value = artists.some((a) => a && a.name === picked) ? picked : '';
  }

  // Home's "Report" shortcut opens the Reports tab with the picker ready.
  function openPdfExportModal() {
    if (typeof window.showSection === 'function') window.showSection('money');
    document.querySelector('[data-action="switchMoneyTab"][data-tab="reports"]')?.click();
    const card = document.getElementById('reportControlsCard');
    if (!card) return;
    card.scrollIntoView({ block: 'start', behavior: 'smooth' });
    setTimeout(() => document.getElementById('spPdfArtistSelect')?.focus({ preventScroll: true }), 300);
  }

  // ── AVATAR LOADING ─────────────────────────────────────────────────────────

  // Real uploaded photo only; symbol or emoji avatars fall back to initials.
  function reportArtistPhotoSource(artist) {
    const raw = String(artist?.avatar || '').trim();
    if (!raw) return '';
    if (/^data:image\/(png|jpe?g|webp|gif)[;,]/i.test(raw)) return raw;
    if (/^(https?:)?\/\//i.test(raw) || raw.startsWith('./') || raw.startsWith('/')) return raw;
    return '';
  }

  function reportInitials(name) {
    const words = String(name || '').trim().split(/\s+/).filter(Boolean);
    if (!words.length) return '?';
    const letters = words.length === 1 ? words[0][0] : words[0][0] + words[words.length - 1][0];
    return letters.toUpperCase();
  }

  async function loadAvatarDataUrl(src) {
    if (!src) return '';
    // Already a data URI
    if (src.startsWith('data:image/')) return src;
    // URL — fetch and convert to data URI
    if (src.startsWith('http') || src.startsWith('./') || src.startsWith('/')) {
      try {
        const origin = window.location.origin !== 'null' ? window.location.origin : '';
        const url = src.startsWith('http') ? src : `${origin}${src.startsWith('.') ? src.slice(1) : src}`;
        const resp = await fetch(url, { cache: 'reload', mode: 'cors' });
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

        let sourceX = 0;
        let sourceY = 0;
        let sourceW = img.width;
        let sourceH = img.height;
        if (!circular) {
          const scanCanvas = document.createElement('canvas');
          scanCanvas.width = img.width;
          scanCanvas.height = img.height;
          const scanCtx = scanCanvas.getContext('2d');
          if (scanCtx) {
            scanCtx.clearRect(0, 0, img.width, img.height);
            scanCtx.drawImage(img, 0, 0);
            try {
              const { data } = scanCtx.getImageData(0, 0, img.width, img.height);
              let minX = img.width;
              let minY = img.height;
              let maxX = -1;
              let maxY = -1;
              for (let y = 0; y < img.height; y += 1) {
                for (let x = 0; x < img.width; x += 1) {
                  const alphaIndex = ((y * img.width) + x) * 4 + 3;
                  if (data[alphaIndex] < 18) continue;
                  if (x < minX) minX = x;
                  if (y < minY) minY = y;
                  if (x > maxX) maxX = x;
                  if (y > maxY) maxY = y;
                }
              }
              if (maxX >= minX && maxY >= minY) {
                sourceX = minX;
                sourceY = minY;
                sourceW = (maxX - minX) + 1;
                sourceH = (maxY - minY) + 1;
              }
            } catch (_scanErr) {
              // Fall back to the full image if pixel inspection is unavailable.
            }
          }
        }

        const scale = mode === 'cover'
          ? Math.max(size / sourceW, size / sourceH)
          : Math.min(size / sourceW, size / sourceH);
        const drawW = sourceW * scale;
        const drawH = sourceH * scale;
        const drawX = (size - drawW) / 2;
        const drawY = (size - drawH) / 2;
        ctx.drawImage(img, sourceX, sourceY, sourceW, sourceH, drawX, drawY, drawW, drawH);

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

  function parseIsoDateOnly(value) {
    const normalized = String(value || '').trim();
    return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : '';
  }

  function isoToLocalDate(value) {
    const iso = parseIsoDateOnly(value);
    if (!iso) return null;
    const [year, month, day] = iso.split('-').map(Number);
    return new Date(year, month - 1, day);
  }

  function localDateToIso(date) {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function getPreviousExplicitDateRange(dateStart, dateEnd) {
    const start = isoToLocalDate(dateStart);
    const end = isoToLocalDate(dateEnd);
    if (!start || !end || end < start) return null;

    const dayMs = 24 * 60 * 60 * 1000;
    const inclusiveDays = Math.max(1, Math.round((end - start) / dayMs) + 1);
    const previousEnd = new Date(start);
    previousEnd.setDate(previousEnd.getDate() - 1);
    const previousStart = new Date(previousEnd);
    previousStart.setDate(previousStart.getDate() - (inclusiveDays - 1));

    return {
      dateStart: localDateToIso(previousStart),
      dateEnd: localDateToIso(previousEnd)
    };
  }

  function hasReportActivity(data) {
    if (!data) return false;
    return Boolean(
      (Array.isArray(data.filteredBookings) && data.filteredBookings.length) ||
      (Array.isArray(data.filteredExpenses) && data.filteredExpenses.length) ||
      (Array.isArray(data.filteredOtherIncome) && data.filteredOtherIncome.length)
    );
  }

  function hasPdfDataHydrationPending() {
    return Boolean(
      window.__spCloudBootstrapPending ||
      window.__spAuthRedirectInProgress ||
      window.__spSupabaseBootPromise ||
      (window.__spCloudOnly && window.__spWorkspaceDataHydrated === false)
    );
  }

  function waitMs(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async function waitForPdfDataHydration(timeoutMs = 6500) {
    const startedAt = Date.now();
    const bootPromise = window.__spSupabaseBootPromise;
    if (bootPromise && typeof bootPromise.then === 'function') {
      await Promise.race([
        bootPromise.catch(() => null),
        waitMs(timeoutMs)
      ]);
    }

    while (hasPdfDataHydrationPending() && Date.now() - startedAt < timeoutMs) {
      await waitMs(200);
    }

    return !hasPdfDataHydrationPending();
  }

  // ── PDF RENDERER ─────────────────────────────────────────────────────────────
  // Draws the Money Moves report with jsPDF vector primitives so the PDF matches
  // the app: Sage palette, Roschild headings, Inter Tight text and JetBrains Mono
  // figures. Charts are drawn as shapes, not screenshots, so they stay sharp.
  const PDF_FONT_FILES = Object.freeze({
    display: 'roschild.ttf',
    ui: 'inter-400.ttf',
    uiBold: 'inter-600.ttf',
    mono: 'mono-500.ttf',
    monoBold: 'mono-700.ttf'
  });
  let pdfFontCache = null;

  async function loadPdfFonts() {
    if (pdfFontCache) return pdfFontCache;
    const assets = window.SP_BROWSER_ASSETS;
    const entries = await Promise.all(Object.entries(PDF_FONT_FILES).map(async ([key, file]) => {
      const path = `./assets/fonts/pdf/${file}`;
      const res = await fetch(typeof assets?.url === 'function' ? assets.url(path) : path);
      if (!res.ok) throw new Error(`PDF font ${file} failed to load (${res.status})`);
      const bytes = new Uint8Array(await res.arrayBuffer());
      let binary = '';
      for (let i = 0; i < bytes.length; i += 0x8000) {
        binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
      }
      return [key, { file, data: btoa(binary) }];
    }));
    pdfFontCache = Object.fromEntries(entries);
    return pdfFontCache;
  }

  function hexRgb(hex) {
    const h = String(hex).replace('#', '');
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }

  function mixRgb(a, b, t) {
    return a.map((v, i) => Math.round(v * t + b[i] * (1 - t)));
  }

  function buildPdfPalette(mode) {
    const light = mode === 'light';
    const c = light
      ? {
          page: '#F5F8F5', card: '#FFFFFF', card2: '#EAF0EB',
          ink: '#0F1C15', ink2: '#34443A', ink3: '#4F5E54',
          gold: '#A67C2A', goldText: '#7A5818', goldHi: '#D9B45A',
          inn: '#13704C', out: '#A3402B', steel: '#557489', sage: '#3F5A44', onGold: '#16130A'
        }
      : {
          page: '#0A1210', card: '#121C17', card2: '#1B2516',
          ink: '#F7F3E8', ink2: '#C9CFC4', ink3: '#8E9A8F',
          gold: '#D9B45A', goldText: '#E3C46B', goldHi: '#F6E68A',
          inn: '#5FD3A0', out: '#F0846C', steel: '#7E9CB0', sage: '#A9C2A7', onGold: '#16130A'
        };
    const P = {};
    Object.keys(c).forEach((k) => { P[k] = hexRgb(c[k]); });
    const lineBase = light ? hexRgb('#0F281C') : P.gold;
    P.line = mixRgb(lineBase, P.card, light ? 0.12 : 0.16);
    P.lineStrong = mixRgb(lineBase, P.card, light ? 0.26 : 0.34);
    P.goldSoft = mixRgb(P.gold, P.card, light ? 0.14 : 0.16);
    P.inSoft = mixRgb(P.inn, P.card, light ? 0.12 : 0.16);
    P.outSoft = mixRgb(P.out, P.card, light ? 0.12 : 0.16);
    P.steelSoft = mixRgb(P.steel, P.card, 0.16);
    P.track = light ? hexRgb('#E3EAE4') : mixRgb(P.ink, P.card, 0.07);
    P.series = [P.gold, P.steel, P.sage, P.out, P.goldHi, P.ink3];
    P.light = light;
    return P;
  }

  async function renderMoneyMovesPdf(jsPDF, d) {
    const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4', putOnlyUsedFonts: true, compress: true });
    const P = buildPdfPalette(d.themeMode);
    const W = pdf.internal.pageSize.getWidth();
    const H = pdf.internal.pageSize.getHeight();
    const mg = 14;
    const cw = W - mg * 2;
    const gap = 5;
    const footerY = H - 8;

    // ── Fonts ──
    const F = {
      display: ['helvetica', 'bold'], ui: ['helvetica', 'normal'], uiBold: ['helvetica', 'bold'],
      mono: ['courier', 'normal'], monoBold: ['courier', 'bold']
    };
    try {
      const fonts = await loadPdfFonts();
      const family = { display: ['SPDisplay', 'normal'], ui: ['SPUI', 'normal'], uiBold: ['SPUI', 'bold'], mono: ['SPMono', 'normal'], monoBold: ['SPMono', 'bold'] };
      Object.entries(fonts).forEach(([key, font]) => {
        pdf.addFileToVFS(font.file, font.data);
        pdf.addFont(font.file, family[key][0], family[key][1]);
        F[key] = family[key];
      });
    } catch (_e) {
      // Built-in fonts keep the report working if the font files can't load.
    }

    // ── Primitives ──
    const fill = (c) => pdf.setFillColor(c[0], c[1], c[2]);
    const stroke = (c) => pdf.setDrawColor(c[0], c[1], c[2]);
    const ink = (c) => pdf.setTextColor(c[0], c[1], c[2]);
    const font = (kind, size, color) => {
      pdf.setFont(F[kind][0], F[kind][1]);
      pdf.setFontSize(size);
      if (color) ink(color);
    };
    const textW = (t) => pdf.getTextWidth(String(t));
    const fit = (text, maxW, kind, size, minSize = size * 0.75) => {
      let s = size;
      const t = String(text ?? '');
      font(kind, s);
      while (s > minSize && textW(t) > maxW) { s -= 0.25; font(kind, s); }
      if (textW(t) <= maxW) return { text: t, size: s };
      let cut = t;
      while (cut.length > 1 && textW(`${cut}…`) > maxW) cut = cut.slice(0, -1);
      return { text: `${cut.trimEnd()}…`, size: s };
    };
    const put = (text, x, y, kind, size, color, opts = {}) => {
      const f = opts.maxW ? fit(text, opts.maxW, kind, size, opts.minSize) : { text: String(text ?? ''), size };
      font(kind, f.size, color);
      const o = {};
      if (opts.align) o.align = opts.align;
      if (opts.charSpace) o.charSpace = opts.charSpace;
      pdf.text(f.text, x, y, o);
      return f;
    };
    const caps = (text, x, y, color = P.ink3, opts = {}) => put(String(text).toUpperCase(), x, y, 'uiBold', opts.size || 6.4, color, { charSpace: 0.35, ...opts });
    const card = (x, y, w, h, opts = {}) => {
      fill(opts.fill || P.card);
      stroke(opts.line || P.line);
      pdf.setLineWidth(0.25);
      pdf.roundedRect(x, y, w, h, 3, 3, 'FD');
    };
    const pill = (text, x, y, color, soft, opts = {}) => {
      font(opts.mono ? 'monoBold' : 'uiBold', opts.size || 6.6);
      const w = textW(text) + 5;
      const h = 4.8;
      const px = opts.align === 'right' ? x - w : x;
      fill(soft);
      pdf.roundedRect(px, y - h + 1.3, w, h, h / 2, h / 2, 'F');
      ink(color);
      pdf.text(text, px + 2.5, y);
      return w;
    };
    const opacity = (o) => {
      if (typeof pdf.GState === 'function' && typeof pdf.setGState === 'function') {
        pdf.setGState(new pdf.GState({ opacity: o, 'stroke-opacity': o }));
      }
    };
    const poly = (pts, style) => {
      const rel = [];
      for (let i = 1; i < pts.length; i += 1) rel.push([pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]]);
      pdf.lines(rel, pts[0][0], pts[0][1], [1, 1], style, true);
    };
    const ringSegment = (cx, cy, r0, r1, a0, a1, color) => {
      const steps = Math.max(6, Math.ceil(Math.abs(a1 - a0) / 0.06));
      const pts = [];
      for (let i = 0; i <= steps; i += 1) {
        const a = a0 + (a1 - a0) * (i / steps);
        pts.push([cx + Math.cos(a) * r1, cy + Math.sin(a) * r1]);
      }
      for (let i = steps; i >= 0; i -= 1) {
        const a = a0 + (a1 - a0) * (i / steps);
        pts.push([cx + Math.cos(a) * r0, cy + Math.sin(a) * r0]);
      }
      fill(color);
      poly(pts, 'F');
    };
    const money = (v) => `UGX ${Math.round(Number(v) || 0).toLocaleString('en-US')}`;
    const compact = (v) => {
      const n = Math.round(Number(v) || 0);
      const a = Math.abs(n);
      const sign = n < 0 ? '-' : '';
      if (a >= 1e9) return `${sign}${(a / 1e9).toFixed(a >= 1e10 ? 0 : 1).replace(/\.0$/, '')}B`;
      if (a >= 1e6) return `${sign}${(a / 1e6).toFixed(a >= 1e7 ? 0 : 1).replace(/\.0$/, '')}M`;
      if (a >= 1e3) return `${sign}${Math.round(a / 1e3)}K`;
      return `${sign}${a}`;
    };
    const pct = (v) => `${Math.round(Number(v) || 0)}%`;
    const signedPct = (v) => `${v >= 0 ? '+' : ''}${(Math.round(v * 10) / 10).toFixed(Math.abs(v) >= 100 ? 0 : 1)}%`;
    const fmtDate = (iso) => {
      if (!iso) return '';
      const dt = new Date(`${String(iso).slice(0, 10)}T00:00:00`);
      return Number.isNaN(dt.getTime()) ? String(iso) : dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    };
    const now = new Date();
    const stamp = `${now.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}, ${now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`;

    // ── Page chrome ──
    function startPage(section) {
      fill(P.page);
      pdf.rect(0, 0, W, H, 'F');
      let x = mg;
      if (d.logo) {
        try { pdf.addImage(d.logo, 'PNG', mg, 8.2, 7.6, 7.6); x += 10; } catch (_e) { /* skip */ }
      }
      put('STAR PAPER', x, 13.3, 'uiBold', 8, P.goldText, { charSpace: 0.9 });
      font('uiBold', 6.4);
      const right = `${section.toUpperCase()}   ·   ${String(d.periodLabel || '').toUpperCase()}`;
      put(right, W - mg, 13.3, 'uiBold', 6.4, P.ink3, { align: 'right', charSpace: 0.35 });
      stroke(P.line);
      pdf.setLineWidth(0.25);
      pdf.line(mg, 19, W - mg, 19);
    }

    function drawFooters() {
      const total = pdf.getNumberOfPages();
      for (let p = 1; p <= total; p += 1) {
        pdf.setPage(p);
        stroke(P.line);
        pdf.setLineWidth(0.2);
        pdf.line(mg, footerY - 4, W - mg, footerY - 4);
        put(`Money Moves · ${d.subjectName}`, mg, footerY, 'ui', 6.6, P.ink3);
        put(`Prepared by ${d.generatedBy} · ${stamp}`, W / 2, footerY, 'ui', 6.6, P.ink3, { align: 'center' });
        put(`${p} / ${total}`, W - mg, footerY, 'mono', 6.6, P.ink3, { align: 'right' });
      }
    }

    function sectionHead(title, kicker, x, y, w) {
      put(title, x, y, 'display', 15, P.goldText);
      if (kicker) put(kicker, x + w, y, 'ui', 7, P.ink3, { align: 'right', maxW: w * 0.5 });
      return y + 5;
    }

    function cardTitle(title, x, y, w, note) {
      caps(title, x + 5, y + 7.4, P.ink2, { size: 6.8 });
      if (note) put(note, x + w - 5, y + 7.4, 'ui', 6.6, P.ink3, { align: 'right', maxW: w * 0.55 });
      return y + 12;
    }

    function emptyNote(text, x, y, w, h) {
      put(text, x + w / 2, y + h / 2, 'ui', 8, P.ink3, { align: 'center', maxW: w - 10 });
    }

    const m = d.metrics;

    // ════════════════════════════════════════════════════════════════════════
    // PAGE 1 · OVERVIEW
    // ════════════════════════════════════════════════════════════════════════
    startPage('Overview');
    let y = 36;
    put('Money Moves', mg, y, 'display', 30, P.goldText);
    const subX = mg;
    put(`${d.subjectName}  ·  ${d.periodLabel}`, subX, y + 8.4, 'uiBold', 11, P.ink, { maxW: cw * 0.62 });
    put(`Prepared by ${d.generatedBy} on ${stamp}`, subX, y + 14, 'ui', 7.6, P.ink3, { maxW: cw * 0.62 });
    if (d.avatar) {
      try { pdf.addImage(d.avatar, 'PNG', W - mg - 22, y - 13, 22, 22); } catch (_e) { /* skip */ }
      stroke(P.gold);
      pdf.setLineWidth(0.5);
      pdf.circle(W - mg - 11, y - 2, 11, 'S');
    } else if (d.subjectInitials) {
      fill(P.gold);
      stroke(P.gold);
      pdf.setLineWidth(0.5);
      pdf.circle(W - mg - 11, y - 2, 11, 'FD');
      put(d.subjectInitials, W - mg - 11, y + 1.6, 'display', d.subjectInitials.length > 1 ? 13 : 15, P.onGold, { align: 'center' });
    } else {
      // Roster reports: a highlight chip with how many shows this report covers.
      const chip = `${m.activeShows} show${m.activeShows === 1 ? '' : 's'}  ·  ${compact(m.totalIncome)} booked`;
      pill(chip, W - mg, y - 1, P.onGold, P.gold, { align: 'right', size: 7.4 });
    }

    // Hero: closing balance + cash-flow waterfall
    y = 58;
    const heroH = 52;
    const heroLW = 96;
    card(mg, y, heroLW, heroH, { fill: P.card2, line: P.lineStrong });
    caps('Closing balance', mg + 6, y + 9, P.ink2, { size: 6.8 });
    const closing = Math.round(Number(m.closingBalance) || 0);
    put(money(closing), mg + 6, y + 23, 'monoBold', 21, closing >= 0 ? P.ink : P.out, { maxW: heroLW - 12, minSize: 13 });
    if (m.trendPct !== null && Number.isFinite(m.trendPct)) {
      const up = m.trendPct >= 0;
      pill(`${signedPct(m.trendPct)} net vs last period`, mg + 6, y + 31.5, up ? P.inn : P.out, up ? P.inSoft : P.outSoft);
    }
    const formulaY = y + 40;
    stroke(P.line);
    pdf.setLineWidth(0.2);
    pdf.line(mg + 6, formulaY - 3.6, mg + heroLW - 6, formulaY - 3.6);
    const formula = [
      ['Brought forward', m.bbf, P.ink2],
      ['+ Bookings', m.totalIncome, P.inn],
      ['+ Other income', m.totalOtherIncome, P.inn],
      ['− Expenses', m.totalExpenses, P.out]
    ];
    formula.forEach(([label, value, color], i) => {
      const fx = mg + 6 + (i % 2) * ((heroLW - 12) / 2);
      const fy = formulaY + Math.floor(i / 2) * 5.6;
      put(label, fx, fy, 'ui', 6.6, P.ink3);
      put(compact(value), fx + (heroLW - 12) / 2 - 4, fy, 'mono', 6.8, color, { align: 'right' });
    });

    // Waterfall
    const wfX = mg + heroLW + gap;
    const wfW = cw - heroLW - gap;
    card(wfX, y, wfW, heroH);
    cardTitle('Where the money went', wfX, y, wfW, 'Opening balance to closing balance');
    const steps = [
      { label: 'Brought fwd', value: m.bbf, kind: 'total' },
      { label: 'Bookings', value: m.totalIncome, kind: 'up' },
      { label: 'Other income', value: m.totalOtherIncome, kind: 'up' },
      { label: 'Expenses', value: -m.totalExpenses, kind: 'down' },
      { label: 'Closing', value: closing, kind: 'total' }
    ];
    let run = 0;
    const bars = steps.map((s) => {
      if (s.kind === 'total') { const b = { ...s, from: 0, to: s.value }; run = s.value; return b; }
      const b = { ...s, from: run, to: run + s.value };
      run += s.value;
      return b;
    });
    const hi = Math.max(1, ...bars.map((b) => Math.max(b.from, b.to)));
    const lo = Math.min(0, ...bars.map((b) => Math.min(b.from, b.to)));
    const plotTop = y + 18;
    const plotBottom = y + heroH - 10;
    const plotH = plotBottom - plotTop;
    const yAt = (v) => plotBottom - ((v - lo) / (hi - lo)) * plotH;
    const slot = (wfW - 12) / bars.length;
    const barW = Math.min(22, slot * 0.56);
    stroke(P.line);
    pdf.setLineWidth(0.2);
    pdf.line(wfX + 6, yAt(0), wfX + wfW - 6, yAt(0));
    bars.forEach((b, i) => {
      const bx = wfX + 6 + slot * i + (slot - barW) / 2;
      const top = yAt(Math.max(b.from, b.to));
      const bottom = yAt(Math.min(b.from, b.to));
      const color = b.kind === 'up' ? P.inn : b.kind === 'down' ? P.out : (b.value < 0 ? P.out : P.gold);
      fill(color);
      const bh = Math.max(0.6, bottom - top);
      pdf.roundedRect(bx, top, barW, bh, Math.min(1.2, bh / 2), Math.min(1.2, bh / 2), 'F');
      if (i < bars.length - 1) {
        stroke(P.lineStrong);
        pdf.setLineWidth(0.2);
        pdf.setLineDashPattern([0.8, 0.8], 0);
        pdf.line(bx + barW, yAt(b.to), bx + slot, yAt(b.to));
        pdf.setLineDashPattern([], 0);
      }
      const sign = b.kind === 'up' ? '+' : b.kind === 'down' ? '−' : '';
      put(`${sign}${compact(Math.abs(b.value))}`, bx + barW / 2, top - 1.6, 'monoBold', 7, b.kind === 'total' ? P.ink : color, { align: 'center' });
      put(b.label, bx + barW / 2, plotBottom + 5, 'ui', 6.6, P.ink3, { align: 'center', maxW: slot - 1 });
    });

    // KPI tiles
    y += heroH + gap;
    const kpiH = 30;
    const kpiW = (cw - gap * 3) / 4;
    const gross = Math.max(0, m.totalIncome + m.totalOtherIncome);
    const kpis = [
      {
        label: 'Booked revenue', value: m.totalIncome, color: P.ink,
        sub: `${m.activeShows} show${m.activeShows === 1 ? '' : 's'} · ${compact(m.collected)} collected`,
        share: m.totalIncome > 0 ? m.collected / m.totalIncome : 0, bar: P.inn, barNote: 'collected'
      },
      {
        label: 'Other income', value: m.totalOtherIncome, color: P.ink,
        sub: `${m.otherCount} ${m.otherCount === 1 ? 'entry' : 'entries'}`,
        share: gross > 0 ? m.totalOtherIncome / gross : 0, bar: P.steel, barNote: 'of income'
      },
      {
        label: 'Expenses', value: m.totalExpenses, color: P.out,
        sub: `${m.expenseCount} ${m.expenseCount === 1 ? 'payment' : 'payments'}`,
        share: gross > 0 ? m.totalExpenses / gross : 0, bar: P.out, barNote: 'of income'
      },
      {
        label: 'Net profit', value: m.netProfit, color: m.netProfit >= 0 ? P.inn : P.out,
        sub: `${pct(m.profitMargin)} margin`,
        share: Math.max(0, m.profitMargin / 100), bar: P.gold, barNote: 'margin'
      }
    ];
    kpis.forEach((k, i) => {
      const kx = mg + i * (kpiW + gap);
      card(kx, y, kpiW, kpiH);
      caps(k.label, kx + 5, y + 7, P.ink3);
      put(money(k.value), kx + 5, y + 15.4, 'monoBold', 12.5, k.color, { maxW: kpiW - 10, minSize: 8 });
      put(k.sub, kx + 5, y + 20.6, 'ui', 6.8, P.ink2, { maxW: kpiW - 10 });
      const tw = kpiW - 10 - 17;
      fill(P.track);
      pdf.roundedRect(kx + 5, y + 24.2, tw, 1.6, 0.8, 0.8, 'F');
      const sw = Math.max(0, Math.min(1, k.share)) * tw;
      if (sw > 0.2) {
        fill(k.bar);
        pdf.roundedRect(kx + 5, y + 24.2, sw, 1.6, 0.8, 0.8, 'F');
      }
      put(`${pct(Math.min(1, Math.max(0, k.share)) * 100)}`, kx + kpiW - 5, y + 25.7, 'mono', 6.4, P.ink3, { align: 'right' });
    });

    // Momentum + cost breakdown
    y += kpiH + gap;
    const rowH = footerY - 6 - y;
    const momW = cw * 0.6;
    const costW = cw - momW - gap;
    card(mg, y, momW, rowH);
    cardTitle('Revenue momentum', mg, y, momW, 'Last 6 months · income vs expenses');
    const hist = Array.isArray(d.history) ? d.history : [];
    const legendY = y + 7.4;
    [['Income', P.gold], ['Expenses', P.out], ['Net', P.inn]].reduce((lx, [name, color]) => {
      fill(color);
      pdf.circle(lx, legendY - 1.1, 1.1, 'F');
      put(name, lx + 2.2, legendY, 'ui', 6.6, P.ink2);
      return lx + textW(name) + 7.5;
    }, mg + 46);
    const chartX = mg + 18;
    const chartW = momW - 24;
    const chartTop = y + 16;
    const chartBottom = y + rowH - 10;
    const maxV = Math.max(1, ...hist.map((h) => Math.max(h.income, h.expenses)));
    const niceMax = (() => {
      const rough = maxV / 4;
      const mag = 10 ** Math.floor(Math.log10(rough));
      const step = [1, 2, 2.5, 5, 10].map((k) => k * mag).find((v) => v >= rough) || 10 * mag;
      return step * 4;
    })();
    const minNet = Math.min(0, ...hist.map((h) => h.income - h.expenses));
    const floorV = minNet < 0 ? -Math.ceil(Math.abs(minNet) / (niceMax / 4)) * (niceMax / 4) : 0;
    const vy = (v) => chartBottom - ((v - floorV) / (niceMax - floorV)) * (chartBottom - chartTop);
    const hasHistory = hist.some((h) => h.income || h.expenses);
    for (let g = 0; g <= 4 && hasHistory; g += 1) {
      const v = floorV + ((niceMax - floorV) / 4) * g;
      const gy = vy(v);
      stroke(v === 0 ? P.lineStrong : P.line);
      pdf.setLineWidth(0.2);
      pdf.line(chartX, gy, chartX + chartW, gy);
      put(compact(v), chartX - 2, gy + 1, 'mono', 6.2, P.ink3, { align: 'right' });
    }
    if (hasHistory) {
      const groupW = chartW / hist.length;
      const bw = Math.min(8, groupW * 0.28);
      const netPts = [];
      hist.forEach((h, i) => {
        const gx = chartX + groupW * i + groupW / 2;
        const current = i === hist.length - 1;
        if (!current) opacity(0.62);
        fill(P.gold);
        const iy = vy(h.income);
        if (h.income > 0) pdf.roundedRect(gx - bw - 0.5, iy, bw, vy(0) - iy, 1, 1, 'F');
        fill(P.out);
        const ey = vy(h.expenses);
        if (h.expenses > 0) pdf.roundedRect(gx + 0.5, ey, bw, vy(0) - ey, 1, 1, 'F');
        opacity(1);
        netPts.push([gx, vy(h.income - h.expenses)]);
        put(h.label, gx, chartBottom + 5, current ? 'uiBold' : 'ui', 6.8, current ? P.ink : P.ink3, { align: 'center' });
      });
      stroke(P.inn);
      pdf.setLineWidth(0.6);
      for (let i = 1; i < netPts.length; i += 1) pdf.line(netPts[i - 1][0], netPts[i - 1][1], netPts[i][0], netPts[i][1]);
      netPts.forEach(([px, py], i) => {
        fill(P.card);
        stroke(P.inn);
        pdf.setLineWidth(0.5);
        pdf.circle(px, py, i === netPts.length - 1 ? 1.3 : 0.9, 'FD');
      });
      const last = hist[hist.length - 1];
      const lastNet = last.income - last.expenses;
      put(`${lastNet >= 0 ? '+' : ''}${compact(lastNet)} net`, netPts[netPts.length - 1][0], netPts[netPts.length - 1][1] - 2.6, 'monoBold', 6.8, P.inn, { align: 'center' });
    } else {
      emptyNote('No income or expenses recorded in the last six months.', chartX, chartTop, chartW, chartBottom - chartTop);
    }

    // Cost breakdown donut
    const costX = mg + momW + gap;
    card(costX, y, costW, rowH);
    cardTitle('Where costs went', costX, y, costW, m.totalExpenses > 0 ? compact(m.totalExpenses) + ' total' : '');
    const cats = (m.costBreakdown || []).slice();
    if (cats.length && m.totalExpenses > 0) {
      const r1 = Math.min(19, (rowH - 22) / 2);
      const r0 = r1 * 0.64;
      const cx = costX + 6 + r1;
      const cy = y + 14 + (rowH - 18) / 2;
      let a = -Math.PI / 2;
      cats.forEach((c, i) => {
        const span = (c.value / m.totalExpenses) * Math.PI * 2;
        ringSegment(cx, cy, r0, r1, a + 0.012, a + span - 0.012, P.series[i % P.series.length]);
        a += span;
      });
      put(compact(m.totalExpenses), cx, cy + 1, 'monoBold', 10, P.ink, { align: 'center' });
      put('spent', cx, cy + 5, 'ui', 6.4, P.ink3, { align: 'center' });
      const lx = cx + r1 + 7;
      const lw = costX + costW - 5 - lx;
      const rowGap = Math.min(8.4, (rowH - 20) / Math.max(1, cats.length));
      let ly = cy - ((cats.length - 1) * rowGap) / 2;
      cats.forEach((c, i) => {
        fill(P.series[i % P.series.length]);
        pdf.roundedRect(lx, ly - 2.4, 2.4, 2.4, 0.6, 0.6, 'F');
        // One line per cost: name, share, amount. The share used to sit under
        // the name and ran into the next row.
        put(c.label, lx + 4, ly, 'ui', 7.2, P.ink, { maxW: lw - 34 });
        put(pct((c.value / m.totalExpenses) * 100), lx + lw - 15, ly, 'mono', 6.4, P.ink3, { align: 'right' });
        put(compact(c.value), lx + lw, ly, 'mono', 7, P.ink2, { align: 'right' });
        ly += rowGap;
      });
    } else {
      emptyNote('No expenses in this period.', costX, y + 12, costW, rowH - 12);
    }

    // ════════════════════════════════════════════════════════════════════════
    // PAGE 2 · SHOWS & MARKETS
    // ════════════════════════════════════════════════════════════════════════
    pdf.addPage();
    startPage('Shows & markets');
    y = 30;
    sectionHead('Shows & markets', `${m.activeShows} active show${m.activeShows === 1 ? '' : 's'} in ${d.periodLabel}`, mg, y, cw);
    y += 6;
    const leftW = cw * 0.62;
    const rightW = cw - leftW - gap;
    const rightX = mg + leftW + gap;

    // Booking pipeline: status bar + collection bar
    const pipeH = 40;
    card(mg, y, leftW, pipeH);
    cardTitle('Booking pipeline', mg, y, leftW, `${m.allShows} booking${m.allShows === 1 ? '' : 's'} in period`);
    const statuses = [
      ['confirmed', 'Confirmed', P.inn],
      ['completed', 'Completed', P.gold],
      ['pending', 'Pending', P.steel],
      ['cancelled', 'Cancelled', P.out]
    ].map(([key, label, color]) => ({ key, label, color, n: Number(m.statusCounts?.[key]) || 0 }));
    const knownN = statuses.reduce((s, x) => s + x.n, 0);
    const otherN = Math.max(0, m.allShows - knownN);
    if (otherN) statuses.push({ key: 'other', label: 'Other', color: P.ink3, n: otherN });
    const sbX = mg + 5;
    const sbW = leftW - 10;
    const sbY = y + 15;
    fill(P.track);
    pdf.roundedRect(sbX, sbY, sbW, 4, 2, 2, 'F');
    if (m.allShows > 0) {
      let sx = sbX;
      statuses.filter((s) => s.n > 0).forEach((s) => {
        const w = (s.n / m.allShows) * sbW;
        fill(s.color);
        pdf.rect(sx + 0.15, sbY, Math.max(0.3, w - 0.3), 4, 'F');
        sx += w;
      });
    }
    let lgx = sbX;
    statuses.forEach((s) => {
      fill(s.color);
      pdf.circle(lgx + 1, sbY + 8.2, 1, 'F');
      const label = `${s.label}`;
      put(label, lgx + 3, sbY + 9, 'ui', 6.8, P.ink2);
      const lw2 = textW(label);
      put(String(s.n), lgx + 4 + lw2, sbY + 9, 'monoBold', 6.8, P.ink);
      lgx += lw2 + 12 + textW(String(s.n));
    });
    // Collection
    const colY = sbY + 15;
    caps('Collected', sbX, colY, P.ink3);
    const colBarX = sbX + 20;
    const colBarW = sbW - 20 - 52;
    fill(P.track);
    pdf.roundedRect(colBarX, colY - 2.4, colBarW, 3, 1.5, 1.5, 'F');
    const colShare = m.totalIncome > 0 ? Math.max(0, Math.min(1, m.collected / m.totalIncome)) : 0;
    if (colShare > 0) {
      fill(P.inn);
      pdf.roundedRect(colBarX, colY - 2.4, Math.max(1.5, colBarW * colShare), 3, 1.5, 1.5, 'F');
    }
    put(`${compact(m.collected)} of ${compact(m.totalIncome)}`, sbX + sbW, colY, 'monoBold', 7, P.ink, { align: 'right' });
    if (m.balancesDue > 0) {
      put(`${compact(m.balancesDue)} still owed`, sbX + sbW, colY + 4.2, 'mono', 6.4, P.out, { align: 'right' });
    }

    // Venue performance
    const vY = y + pipeH + gap;
    const venues = (m.venues || []).slice(0, 6);
    const topShows = (m.topShows || []).slice(0, 5);
    const vSpace = footerY - 6 - vY;
    const vH = topShows.length ? Math.max(42, 26 + Math.max(1, venues.length) * 8.2) : vSpace;
    card(mg, vY, leftW, vH);
    cardTitle('Markets', mg, vY, leftW, 'Cost is shared out by each city\'s revenue');
    const cols = [
      { key: 'location', label: 'City / venue', x: mg + 5, align: 'left' },
      { key: 'shows', label: 'Shows', x: mg + 5 + leftW * 0.27, align: 'right' },
      { key: 'revenue', label: 'Revenue', x: mg + 5 + leftW * 0.31, align: 'left' },
      { key: 'cost', label: 'Est. cost', x: mg + leftW * 0.76, align: 'right' },
      { key: 'profit', label: 'Profit', x: mg + leftW * 0.88, align: 'right' },
      { key: 'margin', label: 'Margin', x: mg + leftW - 5, align: 'right' }
    ];
    const thY = vY + 18;
    cols.forEach((c) => caps(c.label, c.x, thY, P.ink3, { align: c.align === 'right' ? 'right' : undefined, size: 6 }));
    stroke(P.line);
    pdf.setLineWidth(0.2);
    pdf.line(mg + 5, thY + 2, mg + leftW - 5, thY + 2);
    if (venues.length) {
      const maxRev = Math.max(1, ...venues.map((v) => v.revenue));
      const rowHt = Math.min(8.2, (vY + vH - 6 - (thY + 4)) / venues.length);
      venues.forEach((v, i) => {
        const ry = thY + 4 + rowHt * i + rowHt * 0.62;
        put(v.location, cols[0].x, ry, i === 0 ? 'uiBold' : 'ui', 7.6, P.ink, { maxW: leftW * 0.22 });
        put(String(v.shows), cols[1].x, ry, 'mono', 7.4, P.ink2, { align: 'right' });
        const barMax = cols[3].x - cols[2].x - 30;
        const bw2 = Math.max(1, (v.revenue / maxRev) * barMax);
        fill(i === 0 ? P.gold : P.goldSoft);
        pdf.roundedRect(cols[2].x, ry - 2.6, bw2, 3, 1, 1, 'F');
        put(compact(v.revenue), cols[2].x + bw2 + 2, ry, 'mono', 7.2, P.ink, {});
        put(compact(v.cost), cols[3].x, ry, 'mono', 7.2, P.ink3, { align: 'right' });
        put(compact(v.profit), cols[4].x, ry, 'monoBold', 7.2, v.profit >= 0 ? P.inn : P.out, { align: 'right' });
        const mgn = v.revenue > 0 ? (v.profit / v.revenue) * 100 : 0;
        put(pct(mgn), cols[5].x, ry, 'mono', 7.2, P.ink2, { align: 'right' });
        if (i < venues.length - 1) {
          stroke(P.line);
          pdf.setLineWidth(0.15);
          pdf.line(mg + 5, ry + rowHt * 0.38, mg + leftW - 5, ry + rowHt * 0.38);
        }
      });
    } else {
      emptyNote('No shows in this period yet.', mg, thY + 4, leftW, vY + vH - thY - 8);
    }

    // Biggest shows: each fee as a bar, so one big night stands out
    if (topShows.length) {
      const tsY = vY + vH + gap;
      const tsH = footerY - 6 - tsY;
      card(mg, tsY, leftW, tsH);
      cardTitle('Biggest shows', mg, tsY, leftW, 'By fee, this period');
      // Each row needs about 8.4mm for the name and date line; when the card
      // is short, show fewer of the biggest shows rather than squash them.
      const fits = Math.max(1, Math.floor((tsH - 16) / 8.4));
      topShows.splice(fits);
      const maxFee = Math.max(1, ...topShows.map((b) => b.fee));
      const rowT = Math.min(8.4, (tsH - 16) / topShows.length);
      const labelW = leftW * 0.36;
      const barX0 = mg + 5 + labelW + 3;
      const barMax = leftW - 10 - labelW - 3 - 22;
      topShows.forEach((b, i) => {
        const ry = tsY + 14 + rowT * i + rowT * 0.55;
        put(b.event || 'Show', mg + 5, ry, i === 0 ? 'uiBold' : 'ui', 7.4, P.ink, { maxW: labelW });
        put([fmtDate(b.date), b.location].filter(Boolean).join(' · '), mg + 5, ry + 3.2, 'ui', 6, P.ink3, { maxW: labelW });
        const bw3 = Math.max(1, (b.fee / maxFee) * barMax);
        fill(i === 0 ? P.gold : P.goldSoft);
        pdf.roundedRect(barX0, ry - 2.2, bw3, 3.4, 1, 1, 'F');
        put(compact(b.fee), barX0 + bw3 + 2, ry + 0.4, 'monoBold', 7.2, i === 0 ? P.goldText : P.ink2);
      });
    }

    // Right column: next 30 days + next on stage
    // Same height as the pipeline card, so both columns line up.
    const fcH = pipeH;
    card(rightX, y, rightW, fcH, { fill: P.card2, line: P.lineStrong });
    caps(d.projectedFrom ? `Booked for the 30 days after ${fmtDate(d.projectedFrom)}` : 'Booked for the next 30 days', rightX + 5, y + 9, P.ink2, { size: 6.8, maxW: rightW - 10 });
    put(money(d.projectedRevenue), rightX + 5, y + 23, 'monoBold', 16, P.goldText, { maxW: rightW - 10, minSize: 10 });
    put(`${d.projectedShows} show${d.projectedShows === 1 ? '' : 's'} on the calendar`, rightX + 5, y + 31, 'ui', 7, P.ink3);

    const nsY = y + fcH + gap;
    const nsH = footerY - 6 - nsY;
    card(rightX, nsY, rightW, nsH);
    cardTitle(d.nextOnStagePast ? 'Last on stage' : 'Next on stage', rightX, nsY, rightW, d.nextOnStagePast ? 'Nothing booked ahead yet' : '');
    const upcoming = (d.nextOnStage || []).slice(0, 5);
    if (upcoming.length) {
      const itemH = Math.min(17, (nsH - 16) / upcoming.length);
      upcoming.forEach((b, i) => {
        const iy = nsY + 14 + itemH * i;
        const dt = new Date(`${String(b.date || '').slice(0, 10)}T00:00:00`);
        const ok = !Number.isNaN(dt.getTime());
        fill(P.card2);
        pdf.roundedRect(rightX + 5, iy, 12, 12, 2, 2, 'F');
        put(ok ? String(dt.getDate()) : '–', rightX + 11, iy + 6.6, 'monoBold', 10, P.ink, { align: 'center' });
        put(ok ? dt.toLocaleDateString('en-GB', { month: 'short' }).toUpperCase() : '', rightX + 11, iy + 10.2, 'uiBold', 5.6, P.goldText, { align: 'center', charSpace: 0.3 });
        const tx = rightX + 20;
        const tw2 = rightW - 25;
        put(b.event || 'Show', tx, iy + 4.4, 'uiBold', 8, P.ink, { maxW: tw2 - 22 });
        put([b.artist, b.location].filter(Boolean).join(' · '), tx, iy + 8.6, 'ui', 6.8, P.ink3, { maxW: tw2 - 22 });
        put(compact(b.fee), rightX + rightW - 5, iy + 4.4, 'monoBold', 7.6, P.ink, { align: 'right' });
        const st = String(b.status || 'pending').toLowerCase();
        const stColor = st === 'confirmed' ? P.inn : st === 'cancelled' ? P.out : P.steel;
        const stSoft = st === 'confirmed' ? P.inSoft : st === 'cancelled' ? P.outSoft : P.steelSoft;
        pill(st.charAt(0).toUpperCase() + st.slice(1), rightX + rightW - 5, iy + 9.4, stColor, stSoft, { align: 'right', size: 5.8 });
      });
    } else {
      emptyNote('Nothing booked ahead yet.', rightX, nsY + 12, rightW, nsH - 12);
    }

    // ════════════════════════════════════════════════════════════════════════
    // PAGE 3+ · LEDGER, then THE GAME PLAN
    // ════════════════════════════════════════════════════════════════════════
    pdf.addPage();
    startPage('Ledger');
    y = 30;
    const ledger = Array.isArray(d.ledger) ? d.ledger : [];
    const totIn = ledger.filter((t) => t.type !== 'Expense').reduce((s, t) => s + t.amount, 0);
    const totOut = ledger.filter((t) => t.type === 'Expense').reduce((s, t) => s + t.amount, 0);
    sectionHead('Ledger', `${ledger.length} entr${ledger.length === 1 ? 'y' : 'ies'} · newest first`, mg, y, cw);
    y += 6;
    const lc = {
      date: mg + 5,
      type: mg + 34,
      desc: mg + 62,
      inn: mg + cw - 60,
      out: mg + cw - 32,
      bal: mg + cw - 5
    };
    const ledgerHeader = (top) => {
      ['Date', 'Type', 'Description'].forEach((label, i) => caps(label, [lc.date, lc.type, lc.desc][i], top + 7, P.ink3, { size: 6 }));
      caps('Money in', lc.inn, top + 7, P.ink3, { size: 6, align: 'right' });
      caps('Money out', lc.out, top + 7, P.ink3, { size: 6, align: 'right' });
      caps('Running', lc.bal, top + 7, P.ink3, { size: 6, align: 'right' });
      stroke(P.lineStrong);
      pdf.setLineWidth(0.25);
      pdf.line(mg + 5, top + 9.4, mg + cw - 5, top + 9.4);
      return top + 9.4;
    };
    const rowH2 = 6.6;
    const bottomLimit = footerY - 8;
    let rows = ledger.slice().sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')));
    let running = Math.round(Number(m.bbf) || 0);
    rows = rows.map((t) => {
      running += t.type === 'Expense' ? -t.amount : t.amount;
      return { ...t, running };
    }).reverse();
    let idx = 0;
    const typeStyle = {
      Booking: [P.goldText, P.goldSoft],
      Income: [P.steel, P.steelSoft],
      Expense: [P.out, P.outSoft]
    };
    do {
      const available = Math.floor((bottomLimit - y - 22) / rowH2);
      const chunk = rows.slice(idx, idx + Math.max(1, available));
      const isLast = idx + chunk.length >= rows.length;
      const blockH = 10 + Math.max(1, chunk.length) * rowH2 + (isLast ? 12 : 3);
      card(mg, y, cw, blockH);
      let ry = ledgerHeader(y);
      if (!chunk.length) {
        put('No transactions in this period.', mg + cw / 2, ry + 5, 'ui', 7.6, P.ink3, { align: 'center' });
        ry += rowH2;
      }
      chunk.forEach((t, i) => {
        const rowTop = ry;
        if (i % 2 === 1) {
          fill(P.light ? P.page : P.card2);
          pdf.rect(mg + 1, rowTop, cw - 2, rowH2, 'F');
        }
        const by = rowTop + 4.4;
        put(fmtDate(t.date), lc.date, by, 'mono', 6.8, P.ink2);
        const [tc, ts] = typeStyle[t.type] || [P.ink2, P.track];
        pill(t.type, lc.type, by, tc, ts, { size: 5.8 });
        put(t.desc || '—', lc.desc, by, 'ui', 7.4, P.ink, { maxW: lc.inn - lc.desc - 26 });
        if (t.type === 'Expense') put(money(t.amount).replace('UGX ', ''), lc.out, by, 'mono', 7, P.out, { align: 'right' });
        else put(money(t.amount).replace('UGX ', ''), lc.inn, by, 'mono', 7, P.inn, { align: 'right' });
        put(money(t.running).replace('UGX ', ''), lc.bal, by, 'mono', 7, t.running >= 0 ? P.ink2 : P.out, { align: 'right' });
        ry += rowH2;
      });
      if (isLast) {
        stroke(P.lineStrong);
        pdf.setLineWidth(0.25);
        pdf.line(mg + 5, ry + 1.4, mg + cw - 5, ry + 1.4);
        caps('Period totals (UGX)', lc.desc, ry + 7, P.ink2, { size: 6.4 });
        put(totIn.toLocaleString('en-US'), lc.inn, ry + 7, 'monoBold', 7.4, P.inn, { align: 'right' });
        put(totOut.toLocaleString('en-US'), lc.out, ry + 7, 'monoBold', 7.4, P.out, { align: 'right' });
        put(closing.toLocaleString('en-US'), lc.bal, ry + 7, 'monoBold', 7.4, closing >= 0 ? P.ink : P.out, { align: 'right' });
      }
      idx += chunk.length;
      y += blockH + gap;
      if (!isLast) {
        pdf.addPage();
        startPage('Ledger (continued)');
        y = 26;
      }
    } while (idx < rows.length);

    // The game plan
    const notes = (Array.isArray(d.notes) ? d.notes : []).filter(Boolean).slice(0, 8);
    if (notes.length) {
      const colW = (cw - gap) / 2;
      font('ui', 8);
      const noteBlocks = notes.map((n) => {
        const lines = pdf.splitTextToSize(String(n), colW - 22);
        return { lines: lines.slice(0, 4), h: Math.max(16, 9 + lines.slice(0, 4).length * 3.9) };
      });
      const rowsOfNotes = [];
      for (let i = 0; i < noteBlocks.length; i += 2) rowsOfNotes.push([noteBlocks[i], noteBlocks[i + 1]].filter(Boolean));
      const planH = 12 + rowsOfNotes.reduce((s, r) => s + Math.max(...r.map((b) => b.h)) + 3, 0);
      if (y + planH > bottomLimit) {
        pdf.addPage();
        startPage('The game plan');
        y = 30;
      } else {
        y += 4;
      }
      sectionHead('The game plan', 'What the numbers say, and what to do next', mg, y, cw);
      y += 5;
      let n = 0;
      rowsOfNotes.forEach((r) => {
        const rh = Math.max(...r.map((b) => b.h));
        r.forEach((b, j) => {
          n += 1;
          const nx = mg + j * (colW + gap);
          card(nx, y, colW, rh);
          put(String(n).padStart(2, '0'), nx + 5, y + 8.6, 'display', 13, P.goldText);
          font('ui', 8, P.ink);
          b.lines.forEach((ln, k) => pdf.text(ln, nx + 17, y + 7.4 + k * 3.9));
        });
        y += rh + 3;
      });
    }

    drawFooters();
    if (typeof pdf.setProperties === 'function') {
      pdf.setProperties({
        title: `Money Moves · ${d.subjectName} · ${d.periodLabel}`,
        subject: `Generated with ${REPORT_RUNTIME_VERSION}`,
        creator: `Star Paper ${REPORT_RUNTIME_VERSION}`
      });
    }
    return pdf;
  }

  async function generateMomentumPDF() {
    if (generateMomentumPDF._busy) return;
    generateMomentumPDF._busy = true;

    try {
      const dataReady = await waitForPdfDataHydration();
      if (!dataReady) {
        window.toastWarn?.('Cloud data is still loading. Wait a moment, then generate the PDF again.');
        return;
      }

      if (!window.jspdf?.jsPDF && typeof window.__spLoadDeferredLibrary === 'function') {
        await window.__spLoadDeferredLibrary('pdf');
      }
      const { jsPDF } = window.jspdf || {};
      if (!jsPDF) { window.toastError?.('PDF library not loaded'); return; }

      // ── Read the report picker ──
      const selectedArtist = (document.getElementById('spPdfArtistSelect')?.value || '').trim();
      let dateStart = (document.getElementById('spPdfDateStart')?.value || '').trim();
      let dateEnd = (document.getElementById('spPdfDateEnd')?.value || '').trim();
      if (dateStart && dateEnd && dateStart > dateEnd) [dateStart, dateEnd] = [dateEnd, dateStart];

      // ── Gather data ──
      const getPeriod = window.getReportPeriodSelection || (() => ({ period: 'month', periodLabel: new Date().toLocaleString('en-US', { month: 'long', year: 'numeric' }) }));
      const getData = window.getReportPeriodData || (() => ({
        filteredBookings: [], filteredExpenses: [], filteredOtherIncome: [],
        totalIncome: 0, totalExpenses: 0, totalOtherIncome: 0, netProfit: 0, periodNetProfit: 0, balancesDue: 0, totalBookings: 0, bbf: 0, closingBalance: 0
      }));

      const { period, periodLabel } = getPeriod();
      const artists = Array.isArray(window.artists) ? window.artists : [];
      const selectedArtistId = selectedArtist ? (artists.find(a => a.name === selectedArtist)?.id || '') : '';
      let data = getData(period, {
        sortNewestFirst: true,
        selectedArtist,
        artistId: selectedArtistId,
        dateStart,
        dateEnd
      });
      const hasCustomDateRange = Boolean(dateStart || dateEnd);
      const prevPeriodMap = { month: 'prevMonth', year: 'prevYear', quarter: 'all', prevMonth: 'month', prevYear: 'year', all: 'all' };
      let prevData = null;
      let hasComparablePreviousData = false;
      if (hasCustomDateRange) {
        const previousRange = getPreviousExplicitDateRange(dateStart, dateEnd);
        if (previousRange) {
          prevData = getData('all', {
            sortNewestFirst: false,
            selectedArtist,
            artistId: selectedArtistId,
            dateStart: previousRange.dateStart,
            dateEnd: previousRange.dateEnd
          });
          hasComparablePreviousData = hasReportActivity(prevData);
        }
      } else {
        prevData = getData(prevPeriodMap[period] || 'all', {
          sortNewestFirst: false,
          selectedArtist,
          artistId: selectedArtistId
        });
        hasComparablePreviousData = true;
      }

      const artistObj = selectedArtist ? artists.find(a => a.name === selectedArtist) : null;
      const artistName = artistObj ? artistObj.name : (selectedArtist || (window.currentUser || 'Manager'));
      const audienceTrend = getAudienceTrend(Array.isArray(window.audienceMetrics) ? window.audienceMetrics : [], selectedArtist, artistObj?.id);
      const upcomingForContext = (Array.isArray(window.bookings) ? window.bookings : [])
        .filter(b => b && b.date)
        .filter(b => b.status !== 'cancelled')
        .filter(b => reportRecordMatchesArtist(b, selectedArtist, selectedArtistId))
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
      const pdfNextOnStage = buildPdfNextOnStage(allBookings, selectedArtist, 5, selectedArtistId);
      // "The next 30 days" counts from today; a picked date range counts from
      // its last day instead, and the card says so.
      const todayIso = new Date().toISOString().slice(0, 10);
      const forecastAnchorIso = dateEnd || todayIso;
      const pdfForecastBookings = buildPdfForecastBookings(allBookings, selectedArtist, forecastAnchorIso, 31, selectedArtistId);

      const m = computeMetrics(data, prevData);
      if (hasCustomDateRange && !hasComparablePreviousData) {
        m.trendPct = null;
      }
      const insights = generateInsights(m, ctx);

      // ── Artist info ──
      const reportTitle = `MONEY MOVES: ${(artistName || 'ROSTER').toUpperCase()}`;
      const actualPeriodLabel = getActualPeriodLabel(dateStart, dateEnd, periodLabel);
      const reportThemeMode = getCurrentThemeMode();
      // ── Load assets ──
      let logoDataUrl = '';
      if (typeof window.getReportLogoDataUrl === 'function') {
        try { logoDataUrl = await window.getReportLogoDataUrl({ themeMode: reportThemeMode }); } catch (_e) { /* skip */ }
      }

      // Artist reports show the artist's current photo, or their initials when they have none.
      let avatarDataUrl = '';
      const artistPhoto = reportArtistPhotoSource(artistObj);
      if (artistPhoto) avatarDataUrl = await loadAvatarDataUrl(artistPhoto);
      const subjectInitials = artistObj ? reportInitials(artistObj.name) : '';
      const logoHeaderAsset = await prepareReportHeaderAsset(logoDataUrl, { mode: 'contain', circular: false });
      const avatarHeaderAsset = avatarDataUrl
        ? await prepareReportHeaderAsset(avatarDataUrl, { mode: 'cover', circular: true })
        : '';

      // ── Closing thoughts ──
      const closingInput = document.getElementById('closingThoughtsInput');
      const closingDraft = String(closingInput?.value || '').trim();
      const closingFn = window.getClosingThoughtsForPeriod;
      const closingThoughts = closingDraft || (typeof closingFn === 'function' ? closingFn(period).trim() : '');
      const pdfClosingBalance = Math.round(Number(data.closingBalance ?? m.closingBalance) || 0);
      const pdfVenuePerf = buildPdfVenuePerformance(m.filteredBookings, m.totalExpenses);
      const pdfTransactions = sortTransactionsForPdf([
        ...m.filteredBookings.filter(b => String(b?.status || '').toLowerCase() !== 'cancelled').map(b => ({ type: 'Booking', date: b.date, desc: b.event || b.artist || '', amount: Math.round(Number(b.fee) || 0) })),
        ...m.filteredExpenses.map(e => {
          const baseDesc = e.description || e.category || '';
          const hasArtistTag = Boolean(String(e.artistId || '').trim()) || Boolean(String(e.artist || e.artistName || '').trim());
          const desc = (selectedArtist && !hasArtistTag) ? `${baseDesc} (shared)` : baseDesc;
          return { type: 'Expense', date: e.date, desc, amount: Math.round(Number(e.amount) || 0) };
        }),
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
      // ── Render ──
      const isLive = (b) => String(b?.status || '').toLowerCase() !== 'cancelled';
      const liveBookings = m.filteredBookings.filter(isLive);
      const collected = liveBookings.reduce((sum, b) => {
        const fee = Math.round(Number(b.fee) || 0);
        const owed = Math.max(0, Math.round(Number(b.balance) || 0));
        return sum + Math.max(0, Math.min(fee, fee - owed));
      }, 0);
      const titleCase = (s) => String(s || 'Other').replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
      const costEntries = Object.entries(m.expenseByCat).sort((a, b) => b[1] - a[1]);
      const costBreakdown = costEntries.slice(0, 5).map(([label, value]) => ({ label: titleCase(label), value }));
      if (costEntries.length > 5) {
        costBreakdown.push({ label: 'Everything else', value: costEntries.slice(5).reduce((s, e) => s + e[1], 0) });
      }

      // Six months of history ending at the report's last month, so the trend
      // chart has context even for a single-month report.
      const anchorKey = String(forecastAnchorIso || '').slice(0, 7) || new Date().toISOString().slice(0, 7);
      const [anchorYear, anchorMonth] = anchorKey.split('-').map(Number);
      const history = [];
      for (let i = 5; i >= 0; i -= 1) {
        const dt = new Date(anchorYear, anchorMonth - 1 - i, 1);
        const key = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
        history.push({ key, label: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][dt.getMonth()], income: 0, expenses: 0 });
      }
      const historyIndex = Object.fromEntries(history.map((h, i) => [h.key, i]));
      const addHistory = (list, field, amountKey, filter = () => true) => {
        (Array.isArray(list) ? list : []).forEach((row) => {
          if (!row || !filter(row) || !reportRecordMatchesArtist(row, selectedArtist, selectedArtistId)) return;
          const i = historyIndex[String(row.date || '').slice(0, 7)];
          if (i === undefined) return;
          history[i][field] += Math.round(Number(row[amountKey]) || 0);
        });
      };
      addHistory(allBookings, 'income', 'fee', isLive);
      addHistory(window.otherIncome, 'income', 'amount');
      addHistory(window.expenses, 'expenses', 'amount');

      const venues = buildPdfVenuePerformance(liveBookings, m.totalExpenses);
      const grossIncome = m.totalIncome + m.totalOtherIncome;
      const pdf = await renderMoneyMovesPdf(jsPDF, {
        themeMode: reportThemeMode,
        logo: logoHeaderAsset,
        avatar: avatarHeaderAsset,
        subjectName: artistObj ? artistName : 'Full roster',
        subjectInitials,
        periodLabel: actualPeriodLabel,
        generatedBy: window.currentUser || 'Manager',
        metrics: {
          bbf: Math.round(Number(data.bbf) || 0),
          closingBalance: pdfClosingBalance,
          totalIncome: m.totalIncome,
          totalOtherIncome: m.totalOtherIncome,
          totalExpenses: m.totalExpenses,
          netProfit: m.netProfit,
          profitMargin: grossIncome > 0 ? (m.netProfit / grossIncome) * 100 : 0,
          trendPct: (hasCustomDateRange && !hasComparablePreviousData) ? null : m.trendPct,
          activeShows: liveBookings.length,
          allShows: m.filteredBookings.length,
          statusCounts: m.statusCounts,
          collected,
          balancesDue: liveBookings.reduce((s, b) => s + Math.max(0, Math.round(Number(b.balance) || 0)), 0),
          otherCount: m.filteredOtherIncome.length,
          expenseCount: m.filteredExpenses.length,
          costBreakdown,
          venues,
          topShows: liveBookings
            .map((b) => ({ event: b.event, date: b.date, location: b.location || '', fee: Math.round(Number(b.fee) || 0) }))
            .filter((b) => b.fee > 0)
            .sort((a, b) => b.fee - a.fee)
        },
        history,
        projectedRevenue: pdfForecastBookings.reduce((sum, booking) => sum + Math.round(Number(booking?.fee) || 0), 0),
        projectedShows: pdfForecastBookings.length,
        projectedFrom: forecastAnchorIso === todayIso ? '' : forecastAnchorIso,
        nextOnStagePast: Boolean(pdfNextOnStage.isPast),
        nextOnStage: pdfNextOnStage.map((b) => ({
          date: b.date,
          event: b.event,
          artist: b.artist || b.artist_name || '',
          location: b.location || '',
          fee: Math.round(Number(b.fee) || 0),
          status: b.status
        })),
        ledger: pdfTransactions,
        notes: pdfStrategyNotes.length ? pdfStrategyNotes : insights
      });

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

  // ── EXCEL EXPORT ─────────────────────────────────────────────────────────────
  // The "Export Excel" button. app.js (exportCSV) gathers the rows; this lays
  // them out as a styled workbook in the app's colours: a dark banner with the
  // logo, gold headings, real dates and UGX number formats, status colours and
  // bold totals. Returns false if ExcelJS can't load, so app.js can fall back
  // to the plain CSV.
  const XL = {
    night: 'FF0A1210', ink: 'FF0F1C15', ink3: 'FF4F5E54', mist: 'FF8E9A8F',
    gold: 'FFD9B45A', goldText: 'FF7A5818', goldBright: 'FFE3C46B', cream: 'FFF7F3E8',
    zebra: 'FFF5F8F5', total: 'FFEAF0EB', line: 'FFD5DDD7', white: 'FFFFFFFF',
    inn: 'FF13704C', innSoft: 'FFE2F1E9', out: 'FFA3402B', outSoft: 'FFF7E6E1',
    steel: 'FF557489', steelSoft: 'FFE6EEF3', goldSoft: 'FFF6EEDA'
  };
  const XL_MONEY = '#,##0;[Red]-#,##0';
  const XL_DATE = 'dd mmm yyyy';
  const xlFill = (argb) => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });
  const xlFont = ({ argb, ...o } = {}) => ({ name: 'Calibri', size: 11, ...o, color: { argb: argb || XL.ink } });

  function xlDate(value) {
    const iso = String(value || '').slice(0, 10);
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
    if (!m) return value ? String(value) : '';
    // UTC midnight, so Excel shows the same day whatever the phone's timezone.
    return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  }

  function xlStatusTone(status) {
    const s = String(status || '').toLowerCase();
    if (s === 'confirmed' || s === 'paid' || s === 'completed') return { argb: XL.inn, fill: XL.innSoft };
    if (s === 'cancelled') return { argb: XL.out, fill: XL.outSoft };
    return { argb: XL.steel, fill: XL.steelSoft };
  }

  // Dark band across the top of every sheet: title, who, period.
  function xlBanner(ws, cols, title, subtitle, note, textCol = 1) {
    const last = cols;
    for (let r = 1; r <= 3; r += 1) {
      ws.getRow(r).height = r === 1 ? 30 : 18;
      for (let c = 1; c <= last; c += 1) ws.getCell(r, c).fill = xlFill(XL.night);
    }
    const t = ws.getCell(1, textCol);
    t.value = title;
    t.font = xlFont({ size: 18, bold: true, argb: XL.goldBright });
    t.alignment = { vertical: 'middle' };
    const s = ws.getCell(2, textCol);
    s.value = subtitle;
    s.font = xlFont({ size: 12, bold: true, argb: XL.cream });
    const n = ws.getCell(3, textCol);
    n.value = note;
    n.font = xlFont({ size: 10, argb: XL.mist });
    for (let c = 1; c <= last; c += 1) {
      ws.getCell(3, c).border = { bottom: { style: 'medium', color: { argb: XL.gold } } };
    }
  }

  function xlHeader(ws, rowNo, labels, start = 1) {
    const row = ws.getRow(rowNo);
    row.height = 22;
    labels.forEach((label, i) => {
      const cell = row.getCell(i + start);
      cell.value = label;
      cell.font = xlFont({ bold: true, size: 10, argb: XL.goldBright });
      cell.fill = xlFill(XL.ink);
      cell.alignment = { vertical: 'middle', horizontal: label === 'Status' ? 'center' : (/UGX|Share|Shows|Capacity/.test(label) ? 'right' : 'left') };
      cell.border = { bottom: { style: 'thin', color: { argb: XL.gold } } };
    });
  }

  function xlBodyRow(ws, rowNo, values, formats, zebra, start = 1) {
    const row = ws.getRow(rowNo);
    values.forEach((v, i) => {
      const cell = row.getCell(i + start);
      cell.value = v;
      cell.font = xlFont();
      if (formats[i]) cell.numFmt = formats[i];
      if (zebra) cell.fill = xlFill(XL.zebra);
      cell.border = { bottom: { style: 'hair', color: { argb: XL.line } } };
      cell.alignment = { vertical: 'middle', horizontal: v instanceof Date ? 'left' : undefined, wrapText: typeof v === 'string' && v.length > 28 };
    });
    return row;
  }

  function xlTotalRow(ws, rowNo, cols, label, sums, formats, start = 1) {
    const row = ws.getRow(rowNo);
    row.height = 20;
    for (let c = 1; c <= cols; c += 1) {
      const cell = row.getCell(c + start - 1);
      cell.fill = xlFill(XL.total);
      cell.font = xlFont({ bold: true });
      cell.border = { top: { style: 'medium', color: { argb: XL.gold } } };
      if (sums[c - 1] != null) {
        cell.value = sums[c - 1];
        cell.numFmt = formats[c - 1] || XL_MONEY;
      }
    }
    row.getCell(start).value = label;
  }

  // One data sheet (Bookings / Expenses / Other income).
  function xlTableSheet(wb, cfg) {
    const ws = wb.addWorksheet(cfg.name, {
      properties: { tabColor: { argb: cfg.tab } },
      views: [{ state: 'frozen', ySplit: 5, showGridLines: false }],
      pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 }
    });
    ws.columns = cfg.columns.map((c) => ({ width: c.width }));
    xlBanner(ws, cfg.columns.length, cfg.title, cfg.who, cfg.note);
    xlHeader(ws, 5, cfg.columns.map((c) => c.label));
    const formats = cfg.columns.map((c) => c.fmt || null);
    let r = 6;
    if (!cfg.rows.length) {
      const cell = ws.getCell(r, 1);
      cell.value = cfg.empty;
      cell.font = xlFont({ italic: true, argb: XL.ink3 });
      r += 1;
    }
    cfg.rows.forEach((item, i) => {
      const row = xlBodyRow(ws, r, cfg.columns.map((c) => c.value(item)), formats, i % 2 === 1);
      if (cfg.decorate) cfg.decorate(row, item);
      r += 1;
    });
    if (cfg.rows.length) {
      ws.autoFilter = { from: { row: 5, column: 1 }, to: { row: r - 1, column: cfg.columns.length } };
      xlTotalRow(ws, r, cfg.columns.length, cfg.totalLabel, cfg.columns.map((c) => (c.total == null ? null : c.total)), formats);
      if (cfg.footnote) {
        const f = ws.getCell(r + 1, 1);
        f.value = cfg.footnote;
        f.font = xlFont({ italic: true, size: 9, argb: XL.ink3 });
      }
    }
    return ws;
  }

  async function exportMoneyWorkbook(input) {
    let ExcelJS = window.ExcelJS;
    if (!ExcelJS && typeof window.__spLoadDeferredLibrary === 'function') {
      try { await window.__spLoadDeferredLibrary('exceljs'); } catch (_e) { /* fall back below */ }
      ExcelJS = window.ExcelJS;
    }
    if (!ExcelJS) return false;

    const { who, isRoster, periodLabel, bookings, expenses, otherIncome, totals } = input;
    const prepared = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    const note = `${periodLabel}  ·  Prepared ${prepared}  ·  Amounts in UGX`;
    const isCancelled = (b) => String(b.status || '').toLowerCase() === 'cancelled';
    const sum = (list, key) => list.reduce((s, x) => s + (Math.round(Number(x[key]) || 0)), 0);

    const wb = new ExcelJS.Workbook();
    wb.creator = 'Star Paper';
    wb.created = new Date();

    // ── Summary ──
    const ws = wb.addWorksheet('Summary', {
      properties: { tabColor: { argb: XL.gold } },
      views: [{ showGridLines: false }],
      pageSetup: { orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 }
    });
    // Column A is a narrow gutter that holds the logo; everything else starts at B.
    ws.columns = [{ width: 8 }, { width: 30 }, { width: 16 }, { width: 16 }, { width: 16 }, { width: 16 }, { width: 16 }, { width: 16 }];
    xlBanner(ws, 8, 'MONEY MOVES', isRoster ? 'Whole roster' : who, note, 2);
    if (input.logoDataUrl && /^data:image\/png/.test(input.logoDataUrl)) {
      try {
        const logoId = wb.addImage({ base64: input.logoDataUrl, extension: 'png' });
        ws.addImage(logoId, { tl: { col: 0.15, row: 0.2 }, ext: { width: 44, height: 44 }, editAs: 'oneCell' });
      } catch (_e) { /* the sheet is fine without the logo */ }
    }

    let r = 5;
    const section = (label) => {
      const cell = ws.getCell(r, 2);
      cell.value = label;
      cell.font = xlFont({ bold: true, size: 11, argb: XL.goldText });
      for (let c = 2; c <= 8; c += 1) ws.getCell(r, c).border = { bottom: { style: 'thin', color: { argb: XL.gold } } };
      r += 1;
    };
    section('THE NUMBERS');
    const net = totals.netProfit;
    const lines = [
      ['Shows booked', totals.shows, '0', null],
      ['Show fees', totals.income, XL_MONEY, null],
      ['Other income', totals.otherIncome, XL_MONEY, null],
      ['Total money in', totals.income + totals.otherIncome, XL_MONEY, 'in'],
      ['Expenses', totals.expenses, XL_MONEY, 'out'],
      [net >= 0 ? 'Net profit' : 'Net loss', net, XL_MONEY, 'net'],
      ['Still owed on shows (balances)', totals.balancesDue, XL_MONEY, null]
    ];
    if (Number.isFinite(totals.bbf) && totals.bbf !== 0) {
      lines.push(['Brought forward', totals.bbf, XL_MONEY, null]);
      lines.push(['Closing balance', totals.closingBalance, XL_MONEY, 'net']);
    }
    lines.forEach(([label, value, fmt, tone], i) => {
      const a = ws.getCell(r, 2);
      const b = ws.getCell(r, 3);
      a.value = label;
      b.value = value;
      b.numFmt = fmt;
      b.alignment = { horizontal: 'right' };
      a.font = xlFont({ bold: Boolean(tone) });
      b.font = xlFont({ bold: Boolean(tone) });
      const zebra = i % 2 === 1 ? XL.zebra : XL.white;
      a.fill = xlFill(zebra); b.fill = xlFill(zebra);
      if (tone === 'in') b.font = xlFont({ bold: true, argb: XL.inn });
      if (tone === 'out') b.font = xlFont({ bold: true, argb: XL.out });
      if (tone === 'net') {
        const good = Number(value) >= 0;
        a.fill = xlFill(good ? XL.innSoft : XL.outSoft);
        b.fill = xlFill(good ? XL.innSoft : XL.outSoft);
        a.font = xlFont({ bold: true, size: 12 });
        b.font = xlFont({ bold: true, size: 12, argb: good ? XL.inn : XL.out });
      }
      a.border = { bottom: { style: 'hair', color: { argb: XL.line } } };
      b.border = { bottom: { style: 'hair', color: { argb: XL.line } } };
      r += 1;
    });
    r += 1;

    const liveBookings = bookings.filter((b) => !isCancelled(b));
    if (isRoster) {
      section('BY ARTIST');
      const byArtist = new Map();
      const slot = (name) => {
        const key = name || 'Roster / Shared';
        if (!byArtist.has(key)) byArtist.set(key, { name: key, shows: 0, fees: 0, other: 0, spent: 0, owed: 0 });
        return byArtist.get(key);
      };
      liveBookings.forEach((b) => { const s = slot(b.artist); s.shows += 1; s.fees += Math.round(Number(b.fee) || 0); s.owed += Math.round(Number(b.balance) || 0); });
      otherIncome.forEach((i) => { slot(i.artist).other += Math.round(Number(i.amount) || 0); });
      expenses.forEach((e) => { slot(e.artist).spent += Math.round(Number(e.amount) || 0); });
      const rows = Array.from(byArtist.values()).sort((a, b) => (b.fees + b.other) - (a.fees + a.other));
      const labels = ['Artist', 'Shows', 'Show fees (UGX)', 'Other income (UGX)', 'Expenses (UGX)', 'Net (UGX)', 'Still owed (UGX)'];
      xlHeader(ws, r, labels, 2);
      r += 1;
      const fmts = [null, '0', XL_MONEY, XL_MONEY, XL_MONEY, XL_MONEY, XL_MONEY];
      if (!rows.length) {
        ws.getCell(r, 2).value = 'Nothing recorded in this period.';
        ws.getCell(r, 2).font = xlFont({ italic: true, argb: XL.ink3 });
        r += 1;
      }
      rows.forEach((a, i) => {
        const row = xlBodyRow(ws, r, [a.name, a.shows, a.fees, a.other, a.spent, a.fees + a.other - a.spent, a.owed], fmts, i % 2 === 1, 2);
        row.getCell(2).font = xlFont({ bold: true });
        const netCell = row.getCell(7);
        netCell.font = xlFont({ bold: true, argb: (a.fees + a.other - a.spent) >= 0 ? XL.inn : XL.out });
        r += 1;
      });
      if (rows.length) {
        xlTotalRow(ws, r, 7, 'Total', [null, totals.shows, totals.income, totals.otherIncome, totals.expenses, net, totals.balancesDue], fmts, 2);
        r += 1;
      }
      r += 1;
    }

    section('WHERE COSTS WENT');
    const byCategory = new Map();
    expenses.forEach((e) => {
      const raw = String(e.category || 'Other').trim();
      const key = raw.charAt(0).toUpperCase() + raw.slice(1);
      byCategory.set(key, (byCategory.get(key) || 0) + Math.round(Number(e.amount) || 0));
    });
    const cats = Array.from(byCategory.entries()).sort((a, b) => b[1] - a[1]);
    xlHeader(ws, r, ['Category', 'Amount (UGX)', 'Share'], 2);
    r += 1;
    if (!cats.length) {
      ws.getCell(r, 2).value = 'No expenses in this period.';
      ws.getCell(r, 2).font = xlFont({ italic: true, argb: XL.ink3 });
      r += 1;
    }
    cats.forEach(([name, amount], i) => {
      xlBodyRow(ws, r, [name, amount, totals.expenses ? amount / totals.expenses : 0], [null, XL_MONEY, '0%'], i % 2 === 1, 2);
      r += 1;
    });
    if (cats.length) xlTotalRow(ws, r, 3, 'Total', [null, totals.expenses, 1], [null, XL_MONEY, '0%'], 2);

    // ── Bookings ──
    const whoLine = isRoster ? 'Whole roster' : who;
    const cancelledCount = bookings.length - liveBookings.length;
    xlTableSheet(wb, {
      name: 'Bookings', tab: XL.inn, title: 'BOOKINGS', who: whoLine, note,
      empty: 'No shows in this period.',
      totalLabel: `Total · ${liveBookings.length} show${liveBookings.length === 1 ? '' : 's'}`,
      footnote: cancelledCount ? `Cancelled shows (${cancelledCount}) are greyed out and not counted in the totals.` : '',
      rows: bookings,
      columns: [
        { label: 'Date', width: 13, fmt: XL_DATE, value: (b) => xlDate(b.date) },
        { label: 'Show', width: 28, value: (b) => b.event || '' },
        { label: 'Artist', width: 18, value: (b) => b.artist || '' },
        { label: 'Venue', width: 22, value: (b) => b.venue || '' },
        { label: 'Promoter', width: 18, value: (b) => b.promoter || '' },
        { label: 'Capacity', width: 10, fmt: '#,##0', value: (b) => Math.round(Number(b.capacity) || 0) || null },
        { label: 'Fee (UGX)', width: 15, fmt: XL_MONEY, total: totals.income, value: (b) => Math.round(Number(b.fee) || 0) },
        { label: 'Deposit (UGX)', width: 15, fmt: XL_MONEY, total: sum(liveBookings, 'deposit'), value: (b) => Math.round(Number(b.deposit) || 0) },
        { label: 'Balance (UGX)', width: 15, fmt: XL_MONEY, total: totals.balancesDue, value: (b) => Math.round(Number(b.balance) || 0) },
        { label: 'Status', width: 12, value: (b) => b.status ? b.status.charAt(0).toUpperCase() + b.status.slice(1) : '' }
      ],
      decorate: (row, b) => {
        const tone = xlStatusTone(b.status);
        const status = row.getCell(10);
        status.font = xlFont({ bold: true, size: 10, argb: tone.argb });
        status.fill = xlFill(tone.fill);
        status.alignment = { horizontal: 'center', vertical: 'middle' };
        if (isCancelled(b)) {
          for (let c = 1; c <= 9; c += 1) row.getCell(c).font = xlFont({ argb: XL.mist, strike: c >= 7 });
        } else {
          row.getCell(9).font = xlFont({ bold: Number(b.balance) > 0, argb: Number(b.balance) > 0 ? XL.out : XL.ink });
        }
      }
    });

    // ── Expenses ──
    xlTableSheet(wb, {
      name: 'Expenses', tab: XL.out, title: 'EXPENSES', who: whoLine, note,
      empty: 'No expenses in this period.',
      totalLabel: `Total · ${expenses.length} item${expenses.length === 1 ? '' : 's'}`,
      rows: expenses,
      columns: [
        { label: 'Date', width: 13, fmt: XL_DATE, value: (e) => xlDate(e.date) },
        { label: 'Artist', width: 18, value: (e) => e.artist || '' },
        { label: 'Category', width: 16, value: (e) => { const c = String(e.category || ''); return c.charAt(0).toUpperCase() + c.slice(1); } },
        { label: 'Description', width: 34, value: (e) => e.description || '' },
        { label: 'Paid to', width: 20, value: (e) => e.paidTo || '' },
        { label: 'Amount (UGX)', width: 16, fmt: XL_MONEY, total: totals.expenses, value: (e) => Math.round(Number(e.amount) || 0) }
      ],
      decorate: (row) => { row.getCell(6).font = xlFont({ argb: XL.out }); }
    });

    // ── Other income ──
    xlTableSheet(wb, {
      name: 'Other income', tab: XL.steel, title: 'OTHER INCOME', who: whoLine, note,
      empty: 'No other income in this period.',
      totalLabel: `Total · ${otherIncome.length} item${otherIncome.length === 1 ? '' : 's'}`,
      rows: otherIncome,
      columns: [
        { label: 'Date', width: 13, fmt: XL_DATE, value: (i) => xlDate(i.date) },
        { label: 'Artist', width: 18, value: (i) => i.artist || '' },
        { label: 'Source', width: 22, value: (i) => i.source || '' },
        { label: 'Description', width: 34, value: (i) => i.description || '' },
        { label: 'Amount (UGX)', width: 16, fmt: XL_MONEY, total: totals.otherIncome, value: (i) => Math.round(Number(i.amount) || 0) }
      ],
      decorate: (row) => { row.getCell(5).font = xlFont({ argb: XL.inn }); }
    });

    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const slug = (s) => String(s || '').trim().replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'Report';
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `Money-Moves-${slug(isRoster ? 'Roster' : who)}-${slug((/\(([^)]+)\)/.exec(periodLabel) || [])[1] || periodLabel)}.xlsx`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    return true;
  }

  // ── WINDOW EXPOSURE ──────────────────────────────────────────────────────────
  window.renderMomentumDashboard ||= renderDashboard;
  window.generateMomentumPDF ||= generateMomentumPDF;
  window.openPdfExportModal ||= openPdfExportModal;
  window.getReportStartPeriodKey ||= getReportStartPeriodKey;
  window.getActualReportPeriodLabel ||= getActualPeriodLabel;
  window.SPExportMoneyWorkbook ||= exportMoneyWorkbook;

  // The report picker (app.js handleReportPeriodChange) re-renders through this.
  // Only while the Reports tab is showing: charts drawn in a hidden tab come
  // out the wrong size. Opening the tab renders with the picker as it stands.
  window.SPRenderReports = () => {
    if (!document.getElementById('moneyPanel-reports')?.classList.contains('sp-tab-panel--active')) return;
    setTimeout(renderDashboard, 0);
  };

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
