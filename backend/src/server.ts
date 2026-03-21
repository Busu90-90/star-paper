import express, { type Request, type Response } from "express";
import helmet from "helmet";
import { authenticate, validateLoginPayload } from "./auth.js";
import type { ApiError, HealthResponse } from "./types.js";

const app = express();
const PORT = Number(process.env.PORT ?? 3000);

app.use(helmet());
app.use(express.json({ limit: "256kb" }));

app.get("/health", (_req: Request, res: Response<HealthResponse>) => {
  res.status(200).json({
    status: "ok",
    service: "star-paper-backend",
    timestamp: new Date().toISOString()
  });
});

app.post("/auth/login", (req: Request, res: Response) => {
  if (!validateLoginPayload(req.body)) {
    const body: ApiError = { error: "Invalid login payload" };
    res.status(400).json(body);
    return;
  }

  const result = authenticate(req.body);
  if (!result) {
    const body: ApiError = { error: "Invalid username or password" };
    res.status(401).json(body);
    return;
  }

  res.status(200).json(result);
});

app.use((_req: Request, res: Response<ApiError>) => {
  res.status(404).json({ error: "Route not found" });
});

app.use((error: unknown, _req: Request, res: Response<ApiError>, _next: () => void) => {
  console.error("Unhandled backend error:", error);
  res.status(500).json({ error: "Internal server error" });
});

app.listen(PORT, () => {
  console.log(`Star Paper backend listening on http://localhost:${PORT}`);
});
