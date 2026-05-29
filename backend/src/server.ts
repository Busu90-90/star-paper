import express, { type Request, type Response } from "express";
import helmet from "helmet";
import type { ApiError, HealthResponse } from "./types.js";

const diagnosticsEnabled = process.env.SP_ENABLE_RETIRED_BACKEND_DIAGNOSTIC === "1";
const PORT = Number(process.env.PORT ?? 3000);

if (!diagnosticsEnabled) {
  console.error("Retired Star Paper backend diagnostics are disabled.");
  console.error("Use `npm run preview` for app development.");
  console.error("Set SP_ENABLE_RETIRED_BACKEND_DIAGNOSTIC=1 only when you need the retired-backend /health proof.");
  process.exit(1);
}

const app = express();

app.use(helmet());
app.use(express.json({ limit: "256kb" }));

app.get("/health", (_req: Request, res: Response<HealthResponse>) => {
  res.status(200).json({
    status: "retired",
    service: "star-paper-backend",
    timestamp: new Date().toISOString(),
    message: "This diagnostics stub is retired as an application backend. Star Paper authenticates through Supabase Auth only."
  });
});

app.all("/auth/*", (_req: Request, res: Response<ApiError>) => {
  res.status(410).json({
    error: "Local auth backend retired",
    message: "Use Supabase Auth. Star Paper does not support local backend login."
  });
});

app.use((_req: Request, res: Response<ApiError>) => {
  res.status(404).json({ error: "Route not found" });
});

app.use((error: unknown, _req: Request, res: Response<ApiError>, _next: () => void) => {
  console.error("Unhandled backend error:", error);
  res.status(500).json({ error: "Internal server error" });
});

app.listen(PORT, () => {
  console.log(`Retired Star Paper backend diagnostics stub available at http://localhost:${PORT}/health`);
  console.log("Do not point the frontend at this process; Star Paper uses Supabase directly.");
});
