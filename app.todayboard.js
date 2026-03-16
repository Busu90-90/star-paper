/**
 * Star Paper - Today Board Logic
 * Populates the Today Board with real-time data
 */
(function () {
    let alertHandlersBound = false;

    function formatDateDDMMYYYY(date) {
        const d = typeof date === "string" ? new Date(date) : date;
        if (isNaN(d.getTime())) return "Invalid Date";
        const day = String(d.getDate()).padStart(2, "0");
        const month = String(d.getMonth() + 1).padStart(2, "0");
        const year = d.getFullYear();
        return `${day}-${month}-${year}`;
    }

    function getDayName(date) {
        const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
        return days[date.getDay()];
    }

    function escapeText(value) {
        return String(value ?? "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
    }

    function updateTodayBoard() {
        const today = new Date();
        const todayStr = today.toISOString().split("T")[0];

        // Update header
        const dayEl = document.getElementById("todayBoardDay");
        const dateEl = document.getElementById("todayBoardDate");
        const statusEl = document.getElementById("todayBoardStatus");

        if (dayEl) dayEl.textContent = getDayName(today);
        if (dateEl) dateEl.textContent = formatDateDDMMYYYY(today);

        // Get current data
        const bookings = window.bookings || [];
        const expenses = window.expenses || [];
        const otherIncome = window.otherIncome || [];

        // Calculate alerts
        const alerts = calculateAlerts(bookings, todayStr);

        // Update status
        if (statusEl) {
            if (alerts.length === 0) {
                statusEl.textContent = "All Clear";
                statusEl.className = "today-board__status today-board__status--clear";
            } else {
                statusEl.textContent = `${alerts.length} Alert${alerts.length > 1 ? "s" : ""}`;
                statusEl.className = "today-board__status today-board__status--alerts";
            }
        }

        // Render alerts
        renderAlerts(alerts);

        // Update revenue progress
        updateRevenueProgress(bookings, otherIncome, expenses);
    }

    function calculateAlerts(bookings, todayStr) {
        const alerts = [];
        const today = new Date(todayStr);

        // Check for shows today
        const showsToday = bookings.filter((booking) => booking.date === todayStr);
        if (showsToday.length > 0) {
            showsToday.forEach((show) => {
                alerts.push({
                    type: "urgent",
                    title: `Show Today: ${show.event}`,
                    message: `${show.artist} performs at ${show.location || "TBD"}`,
                    action: "showBookingDetails",
                    actionData: String(show.id ?? "")
                });
            });
        }

        // Check for shows in next 3 days
        for (let i = 1; i <= 3; i += 1) {
            const futureDate = new Date(today);
            futureDate.setDate(today.getDate() + i);
            const futureDateStr = futureDate.toISOString().split("T")[0];

            const upcomingShows = bookings.filter((booking) => booking.date === futureDateStr);
            upcomingShows.forEach((show) => {
                const daysText = i === 1 ? "tomorrow" : `in ${i} days`;
                alerts.push({
                    type: "warning",
                    title: `Upcoming: ${show.event}`,
                    message: `${show.artist} performs ${daysText}`,
                    action: "showBookingDetails",
                    actionData: String(show.id ?? "")
                });
            });
        }

        // Check for overdue balances
        const overdueBalances = bookings.filter((booking) => {
            if (!booking.balance || parseFloat(booking.balance) <= 0) return false;
            const showDate = new Date(booking.date);
            return showDate < today;
        });

        if (overdueBalances.length > 0) {
            const totalOverdue = overdueBalances.reduce((sum, booking) => sum + parseFloat(booking.balance || 0), 0);
            alerts.push({
                type: "warning",
                title: "Overdue Balances",
                message: `${overdueBalances.length} booking${overdueBalances.length > 1 ? "s" : ""} with UGX ${totalOverdue.toLocaleString()} due`,
                action: "showBalancesDue",
                actionData: String(overdueBalances[0]?.id ?? "")
            });
        }

        // Check for pending bookings and make each pending booking directly editable.
        const pendingBookings = bookings.filter(
            (booking) => String(booking?.status || "").toLowerCase() === "pending"
        );
        if (pendingBookings.length > 0) {
            pendingBookings.slice(0, 3).forEach((booking) => {
                alerts.push({
                    type: "info",
                    title: "Pending Confirmation",
                    message: `${booking.event} for ${booking.artist} is awaiting confirmation`,
                    action: "editBooking",
                    actionData: String(booking.id ?? "")
                });
            });

            if (pendingBookings.length > 3) {
                alerts.push({
                    type: "info",
                    title: "More Pending Confirmations",
                    message: `${pendingBookings.length - 3} additional booking${pendingBookings.length - 3 > 1 ? "s" : ""} awaiting confirmation`,
                    action: "showPendingBookings",
                    actionData: String(pendingBookings[3]?.id ?? "")
                });
            }
        }

        return alerts;
    }

    function renderAlerts(alerts) {
        const container = document.getElementById("todayBoardAlerts");
        if (!container) return;

        if (alerts.length === 0) {
            container.innerHTML = `
                <div class="timeline-item dashboard-stream-item dashboard-alert-item dashboard-alert-item--clear">
                    <div class="timeline-meta">
                        <div class="timeline-title">
                            <span class="dashboard-alert-icon" aria-hidden="true">OK</span>
                            <span>All Clear</span>
                        </div>
                        <div class="timeline-sub">No urgent items require your attention today</div>
                    </div>
                    <div class="timeline-amount">
                        <span class="booking-status-pill status-confirmed">CLEAR</span>
                    </div>
                </div>
            `;
            return;
        }

        container.innerHTML = alerts.map((alert) => {
            const alertType = String(alert?.type || "info").toLowerCase();
            return `
            <div
                class="timeline-item dashboard-stream-item dashboard-alert-item dashboard-alert-item--${escapeText(alertType)} ${alert.action ? "dashboard-alert-item--clickable" : ""}"
                ${alert.action ? `data-alert-action="${escapeText(alert.action)}" data-alert-id="${escapeText(alert.actionData || "")}" tabindex="0" role="button"` : ""}
            >
                <div class="timeline-meta">
                    <div class="timeline-title">
                        <span class="dashboard-alert-icon" aria-hidden="true">${escapeText(getAlertIcon(alertType))}</span>
                        <span>${escapeText(alert.title)}</span>
                    </div>
                    <div class="timeline-sub">${escapeText(alert.message)}</div>
                </div>
                <div class="timeline-amount">
                    <span class="booking-status-pill ${escapeText(getAlertStatusClass(alertType))}">${escapeText(getAlertLabel(alertType))}</span>
                </div>
            </div>
        `;
        }).join("");
    }

    function getAlertIcon(type) {
        const icons = {
            urgent: "!",
            warning: "!!",
            info: "i"
        };
        return icons[type] || "-";
    }

    function getAlertStatusClass(type) {
        const classes = {
            urgent: "status-cancelled",
            warning: "status-pending",
            info: "status-confirmed"
        };
        return classes[type] || "status-pending";
    }

    function getAlertLabel(type) {
        const labels = {
            urgent: "Urgent",
            warning: "Warning",
            info: "Info"
        };
        return labels[type] || "Alert";
    }

    function navigateToBookingEditor(action, bookingId) {
        if (!action) return;

        if (typeof window.showSection === "function") {
            window.showSection("bookings");
        }

        const rawId = String(bookingId || "").trim();
        const openEditorById = (idValue) => {
            if (!idValue || typeof window.editBooking !== "function") return;
            setTimeout(() => {
                const numericId = Number(idValue);
                window.editBooking(Number.isFinite(numericId) ? numericId : idValue);
            }, 60);
        };

        if (action === "editBooking" || action === "showBookingDetails") {
            openEditorById(rawId);
            return;
        }

        if (action === "showPendingBookings") {
            if (rawId) {
                openEditorById(rawId);
                return;
            }
            const pending = (window.bookings || []).find(
                (booking) => String(booking?.status || "").toLowerCase() === "pending"
            );
            if (pending?.id !== undefined) {
                openEditorById(String(pending.id));
            }
            return;
        }

        if (action === "showBalancesDue") {
            if (rawId) {
                openEditorById(rawId);
                return;
            }
            const now = new Date();
            const overdue = (window.bookings || []).find((booking) => {
                const balance = Number(booking?.balance || 0);
                if (balance <= 0) return false;
                const showDate = new Date(booking?.date || "");
                return !Number.isNaN(showDate.getTime()) && showDate < now;
            });
            if (overdue?.id !== undefined) {
                openEditorById(String(overdue.id));
            }
        }
    }

    function bindAlertInteractions() {
        if (alertHandlersBound) return;
        alertHandlersBound = true;

        document.addEventListener("click", (event) => {
            const target = event.target && event.target.closest
                ? event.target.closest(".dashboard-alert-item[data-alert-action]")
                : null;
            if (!target) return;
            navigateToBookingEditor(target.dataset.alertAction, target.dataset.alertId || "");
        });

        document.addEventListener("keydown", (event) => {
            if (event.key !== "Enter" && event.key !== " ") return;
            const target = event.target && event.target.closest
                ? event.target.closest(".dashboard-alert-item[data-alert-action]")
                : null;
            if (!target) return;
            event.preventDefault();
            navigateToBookingEditor(target.dataset.alertAction, target.dataset.alertId || "");
        });
    }

    function updateRevenueProgress(bookings, otherIncome, expenses) {
        const today = new Date();
        const currentMonth = today.getMonth();
        const currentYear = today.getFullYear();

        // Filter this month's data
        const thisMonthBookings = bookings.filter((booking) => {
            const date = new Date(booking.date);
            return date.getMonth() === currentMonth && date.getFullYear() === currentYear;
        });

        const thisMonthOtherIncome = otherIncome.filter((entry) => {
            const date = new Date(entry.date);
            return date.getMonth() === currentMonth && date.getFullYear() === currentYear;
        });

        const thisMonthExpenses = expenses.filter((entry) => {
            const date = new Date(entry.date);
            return date.getMonth() === currentMonth && date.getFullYear() === currentYear;
        });

        // Calculate totals
        const showIncome = thisMonthBookings.reduce((sum, booking) => sum + parseFloat(booking.fee || 0), 0);
        const otherIncomeTotal = thisMonthOtherIncome.reduce((sum, entry) => sum + parseFloat(entry.amount || 0), 0);
        const totalRevenue = showIncome + otherIncomeTotal;
        const totalExpenses = thisMonthExpenses.reduce((sum, entry) => sum + parseFloat(entry.amount || 0), 0);

        // Get monthly goal
        const goal = getCurrentMonthlyRevenueGoal();

        // Update UI
        const currentEl = document.getElementById("revenueProgressCurrent");
        const goalEl = document.getElementById("revenueProgressGoal");
        const fillEl = document.getElementById("revenueProgressFill");

        if (currentEl) currentEl.textContent = `UGX ${totalRevenue.toLocaleString()}`;
        if (goalEl) goalEl.textContent = goal > 0 ? `UGX ${goal.toLocaleString()}` : "No goal set";

        if (fillEl) {
            const percentage = goal > 0 ? Math.min((totalRevenue / goal) * 100, 100) : 0;
            fillEl.style.width = `${percentage}%`;

            // Update color based on progress
            if (percentage >= 100) {
                fillEl.style.background = "linear-gradient(90deg, #4caf50, #66bb6a)";
            } else if (percentage >= 75) {
                fillEl.style.background = "linear-gradient(90deg, #2196f3, #42a5f5)";
            } else if (percentage >= 50) {
                fillEl.style.background = "linear-gradient(90deg, #ff9800, #ffa726)";
            } else {
                fillEl.style.background = "linear-gradient(90deg, #f44336, #ef5350)";
            }
        }
    }

    function getCurrentMonthlyRevenueGoal() {
        const revenueGoals = window.revenueGoals || {};
        const currentManagerId = window.currentManagerId || window.currentUser;
        const key = String(currentManagerId || "");
        if (!key) return 0;
        const raw = Number(revenueGoals[key] || 0);
        return Number.isFinite(raw) && raw > 0 ? raw : 0;
    }

    // Expose function globally
    window.updateTodayBoard = updateTodayBoard;
    bindAlertInteractions();

    // Auto-update when data changes
    if (typeof window.addEventListener === "function") {
        window.addEventListener("dataUpdated", updateTodayBoard);
    }
})();
