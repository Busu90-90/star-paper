export interface ApiError {
  error: string;
}

export interface LoginRequest {
  username: string;
  password: string;
}

export interface LoginResponse {
  accessToken: string;
  tokenType: "Bearer";
  expiresInSeconds: number;
  username: string;
}

export interface HealthResponse {
  status: "ok";
  service: string;
  timestamp: string;
}
