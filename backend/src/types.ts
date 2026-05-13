export interface ApiError {
  error: string;
  message?: string;
}

export interface HealthResponse {
  status: "retired";
  service: "star-paper-backend";
  timestamp: string;
  message: string;
}
