import express, { type Request, type Response } from "express";
import helmet from "helmet";
import type { ApiError, HealthResponse } from "./types.js";

const app = express();
const PORT = Number(process.env.PORT ?? 3000);

app.use(helmet());
app.use(express.json({ limit: "256kb" }));

app.get("/health", (_req: Request, res: Response<HealthResponse>) => {
  res.status(200).json({
    status: "retired",
    service: "star-paper-backend",
    timestamp: new Date().toISOString(),
    message: "This local backend is retired. Star Paper authenticates through Supabase Auth only."
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
  console.log(`Retired Star Paper local backend listening on http://localhost:${PORT}`);
});
