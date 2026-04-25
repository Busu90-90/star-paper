(function () {
    "use strict";

    // FIXED: Star Paper is cloud-first now; legacy browser-storage migrations are intentionally disabled.
    // Supabase remains the source of truth, and this shim preserves the old public hook for callers.
    window.runStarPaperMigrations = function noopCloudOnlyStorageMigrations() {
        return { skipped: true, reason: "cloud-first" };
    };
})();
