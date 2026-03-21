# Star Paper Backend

## Endpoints
- `GET /health`
- `POST /auth/login`

## Run
```bash
cd backend
npm install
npm run dev
```

## Configure Frontend
Set API base URL in browser console:
```js
localStorage.setItem("starPaperApiBaseUrl", "http://localhost:3000");
```

Clear to use local auth fallback:
```js
localStorage.removeItem("starPaperApiBaseUrl");
```
