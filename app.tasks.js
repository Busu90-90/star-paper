/**
 * Star Paper - Task List Module
 * Section-based task board with add/edit/toggle/delete/clear completed.
 */
(function () {
    let tasks = [];
    let currentStorageKey = null;

    function getScopeKey() {
        if (typeof window.getActiveDataScopeKey === "function") {
            const key = window.getActiveDataScopeKey();
            if (key) return key;
        }
        return String(window.currentManagerId || window.currentUser || "global");
    }

    function getStorageKey() {
        return `starPaperTasks:${getScopeKey()}`;
    }

    function getActiveRole() {
        if (typeof window.getActiveTeamRole === "function") return window.getActiveTeamRole();
        if (window.SP?.getActiveTeamRole) return window.SP.getActiveTeamRole();
        return window.currentTeamRole || null;
    }

    function isViewerRole() {
        return String(getActiveRole() || "").toLowerCase() === "viewer";
    }

    function guardReadOnly(actionLabel) {
        if (typeof window.guardReadOnly === "function") {
            return window.guardReadOnly(actionLabel);
        }
        if (!isViewerRole()) return false;
        if (typeof window.toastWarn === "function") {
            window.toastWarn(`Read-only access: you cannot ${actionLabel}.`);
        }
        return true;
    }

    function syncTasksToCloud() {
        if (!navigator.onLine) return;
        if (window.SP?.saveTasks) {
            window.SP.saveTasks(tasks).catch((err) => {
                console.warn("Cloud task sync failed:", err);
            });
        } else if (typeof window.syncCloudExtras === "function") {
            window.syncCloudExtras();
        }
    }

    function ensureLoadedForCurrentUser() {
        const nextKey = getStorageKey();
        if (currentStorageKey === nextKey) return;
        currentStorageKey = nextKey;
        loadTasks();
    }

    function parseStoredTasks(raw) {
        if (!raw) return [];
        try {
            const parsed = JSON.parse(raw);
            return Array.isArray(parsed) ? parsed : [];
        } catch {
            return [];
        }
    }

    function normalizeTask(task) {
        const safe = task && typeof task === "object" ? task : {};
        return {
            id: String(safe.id || (Date.now().toString(36) + Math.random().toString(36).slice(2))),
            text: String(safe.text || "").trim(),
            dueDate: safe.dueDate ? String(safe.dueDate) : "",
            completed: Boolean(safe.completed),
            createdAt: safe.createdAt || new Date().toISOString()
        };
    }

    function loadTasks() {
        const scoped = parseStoredTasks(localStorage.getItem(currentStorageKey || getStorageKey()));
        if (scoped.length > 0) {
            tasks = scoped.map(normalizeTask).filter((task) => task.text);
            return tasks;
        }

        // One-time legacy fallback for older installs using non-scoped key.
        const legacy = parseStoredTasks(localStorage.getItem("starPaperTasks"));
        tasks = legacy.map(normalizeTask).filter((task) => task.text);
        saveTasks();
        return tasks;
    }

    function saveTasks() {
        if (!currentStorageKey) currentStorageKey = getStorageKey();
        localStorage.setItem(currentStorageKey, JSON.stringify(tasks));
    }

    function commitTasks(options = {}) {
        saveTasks();
        if (options.render !== false) {
            renderTasks();
        }
        syncTasksToCloud();
    }

    function escapeHtml(value) {
        return String(value ?? "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
    }

    function sortTasks(input) {
        return [...input].sort((a, b) => {
            if (a.completed !== b.completed) return a.completed ? 1 : -1;
            const aDue = a.dueDate ? new Date(a.dueDate).getTime() : Number.MAX_SAFE_INTEGER;
            const bDue = b.dueDate ? new Date(b.dueDate).getTime() : Number.MAX_SAFE_INTEGER;
            if (aDue !== bDue) return aDue - bDue;
            return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        });
    }

    function formatTaskDate(dateStr) {
        if (!dateStr) return "";
        const date = new Date(dateStr);
        if (Number.isNaN(date.getTime())) return "";

        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(today.getDate() + 1);

        const target = new Date(date);
        target.setHours(0, 0, 0, 0);

        if (target.getTime() === today.getTime()) return "Today";
        if (target.getTime() === tomorrow.getTime()) return "Tomorrow";
        if (target < today) return "Overdue";

        const day = String(target.getDate()).padStart(2, "0");
        const month = String(target.getMonth() + 1).padStart(2, "0");
        const year = target.getFullYear();
        return `${day}/${month}/${year}`;
    }

    function updateBadges() {
        const now = new Date();
        now.setHours(0, 0, 0, 0);

        const incomplete = tasks.filter((task) => !task.completed);
        const overdueCount = incomplete.filter((task) => {
            if (!task.dueDate) return false;
            const due = new Date(task.dueDate);
            due.setHours(0, 0, 0, 0);
            return due < now;
        }).length;

        const badge = document.getElementById("taskBadge");
        const badgeNav = document.getElementById("taskBadgeNav");

        if (badge) {
            if (overdueCount > 0) {
                badge.textContent = String(overdueCount);
                badge.style.display = "inline-flex";
            } else {
                badge.style.display = "none";
            }
        }

        if (badgeNav) {
            if (overdueCount > 0) {
                badgeNav.textContent = String(overdueCount);
                badgeNav.style.display = "flex";
            } else {
                badgeNav.style.display = "none";
            }
        }
    }

    function renderTasks() {
        ensureLoadedForCurrentUser();
        const container = document.getElementById("taskList");
        if (!container) return;

        const readOnly = isViewerRole();
        updateBadges();
        const sorted = sortTasks(tasks);

        if (sorted.length === 0) {
            container.innerHTML = '<div class="task-empty">No tasks yet. Add one below.</div>';
            return;
        }

        const now = new Date();
        now.setHours(0, 0, 0, 0);

        container.innerHTML = sorted.map((task) => {
            const due = task.dueDate ? new Date(task.dueDate) : null;
            if (due) due.setHours(0, 0, 0, 0);
            const isOverdue = Boolean(due && due < now && !task.completed);

            return `
                <div class="task-item ${task.completed ? "task-completed" : ""} ${isOverdue ? "task-overdue" : ""}">
                    <input type="checkbox" ${task.completed ? "checked" : ""} ${readOnly ? "disabled" : ""}
                           onchange="window.toggleTask('${escapeHtml(task.id)}')" class="task-checkbox" />
                    <div class="task-content">
                        <div class="task-text">${escapeHtml(task.text)}</div>
                        ${task.dueDate ? `<div class="task-due">${escapeHtml(formatTaskDate(task.dueDate))}</div>` : ""}
                    </div>
                    <button class="task-edit" ${readOnly ? "disabled" : ""} onclick="window.startEditTask('${escapeHtml(task.id)}')" aria-label="Edit task">Edit</button>
                    <button class="task-delete" ${readOnly ? "disabled" : ""} onclick="window.deleteTask('${escapeHtml(task.id)}')" aria-label="Delete task">&times;</button>
                </div>
            `;
        }).join("");
    }

    function addTask(text, dueDate = "") {
        if (guardReadOnly("add tasks")) return null;
        ensureLoadedForCurrentUser();
        const cleanText = String(text || "").trim();
        if (!cleanText) return null;

        const task = {
            id: Date.now().toString(36) + Math.random().toString(36).slice(2),
            text: cleanText,
            dueDate: String(dueDate || ""),
            completed: false,
            createdAt: new Date().toISOString()
        };

        tasks.push(task);
        commitTasks();
        return task;
    }

    function toggleTask(id) {
        if (guardReadOnly("update tasks")) {
            renderTasks();
            return;
        }
        ensureLoadedForCurrentUser();
        const task = tasks.find((item) => item.id === id);
        if (!task) return;
        task.completed = !task.completed;
        commitTasks();
    }

    function deleteTask(id) {
        if (guardReadOnly("delete tasks")) return;
        ensureLoadedForCurrentUser();
        tasks = tasks.filter((task) => task.id !== id);
        commitTasks();
        if (window.SP?.deleteTask) {
            window.SP.deleteTask(id).catch((err) => {
                console.warn("Cloud delete task failed:", err);
            });
        }
    }

    function startEditTask(id) {
        if (guardReadOnly("edit tasks")) return;
        ensureLoadedForCurrentUser();
        const task = tasks.find((item) => item.id === id);
        if (!task) return;

        const nextText = window.prompt("Edit task text:", task.text);
        if (nextText === null) return;
        const trimmed = nextText.trim();
        if (!trimmed) {
            alert("Task text cannot be empty.");
            return;
        }

        const currentDue = task.dueDate || "";
        const nextDue = window.prompt("Edit due date (YYYY-MM-DD) or leave blank:", currentDue);
        if (nextDue === null) return;

        const dueValue = nextDue.trim();
        if (dueValue && Number.isNaN(new Date(dueValue).getTime())) {
            alert("Due date must be in YYYY-MM-DD format.");
            return;
        }

        task.text = trimmed;
        task.dueDate = dueValue;
        commitTasks();
    }

    function clearCompletedTasks() {
        if (guardReadOnly("clear completed tasks")) return;
        ensureLoadedForCurrentUser();
        const hasCompleted = tasks.some((task) => task.completed);
        if (!hasCompleted) return;
        const removedIds = tasks.filter((task) => task.completed).map((task) => task.id);
        tasks = tasks.filter((task) => !task.completed);
        commitTasks();
        if (window.SP?.deleteTask && removedIds.length) {
            removedIds.forEach((taskId) => {
                window.SP.deleteTask(taskId).catch((err) => {
                    console.warn("Cloud delete task failed:", err);
                });
            });
        }
    }

    function applyTaskSync(nextTasks, options = {}) {
        if (!Array.isArray(nextTasks)) return;
        ensureLoadedForCurrentUser();
        tasks = nextTasks.map(normalizeTask).filter((task) => task.text);
        saveTasks();
        if (options.render !== false) {
            renderTasks();
        }
    }

    function handleAddTask() {
        const input = document.getElementById("taskInput");
        const dateInput = document.getElementById("taskDueDate");
        if (!input) return;

        if (guardReadOnly("add tasks")) return;
        const text = input.value.trim();
        if (!text) return;

        addTask(text, dateInput?.value || "");
        input.value = "";
        if (dateInput) dateInput.value = "";
        input.focus();
    }

    function bindTaskInputEnter() {
        const input = document.getElementById("taskInput");
        if (!input || input.dataset.enterBound === "true") return;
        input.dataset.enterBound = "true";
        input.addEventListener("keydown", (event) => {
            if (event.key !== "Enter") return;
            event.preventDefault();
            handleAddTask();
        });
    }

    function openTasksSection() {
        if (typeof window.showSection === "function") {
            window.showSection("tasks");
        }
    }

    window.loadTasks = function () {
        ensureLoadedForCurrentUser();
        return tasks;
    };
    window.addTask = addTask;
    window.toggleTask = toggleTask;
    window.deleteTask = deleteTask;
    window.startEditTask = startEditTask;
    window.clearCompletedTasks = clearCompletedTasks;
    window.applyTaskSync = applyTaskSync;
    window.renderTasks = function () {
        bindTaskInputEnter();
        renderTasks();
    };
    window.handleAddTask = handleAddTask;
    window.toggleTaskPanel = openTasksSection;
    window.toggleTaskWidget = openTasksSection;

    function initializeTasksModule() {
        ensureLoadedForCurrentUser();
        bindTaskInputEnter();
        renderTasks();
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initializeTasksModule, { once: true });
    } else {
        initializeTasksModule();
    }
})();
