# State Schema

## localStorage Keys
- `starPaperUsers`: array of manager records.
- `starPaperArtists`: array of artist records.
- `starPaperManagerData`: object keyed by managerId for financial records.
- `starPaperCredentials`: object keyed by username for local auth credentials.
- `starPaperMessages`: array of message records.
- `starPaperTheme`: `"light"` or `"dark"`.
- `starPaperRemember`: boolean remember-me flag.
- `starPaperRememberedUser`: remembered username.
- `starPaperCurrentUser`: active session username.
- `starPaperSeedDemo`: `"true"` enables first-run demo seed.
- `starPaperApiBaseUrl`: backend API base URL (enables server auth path).
- `starPaperSchemaVersion`: numeric data schema version for migrations.

## User Record (Manager)
```json
{
  "id": "string",
  "username": "string",
  "email": "string",
  "avatar": "string",
  "createdAt": "ISO-8601"
}
```

## Artist Record
```json
{
  "id": "string",
  "name": "string",
  "managerId": "string",
  "createdAt": "ISO-8601",
  "email": "string (optional)",
  "phone": "string (optional)",
  "specialty": "string (optional)",
  "bio": "string (optional)"
}
```

## Credentials Record
```json
{
  "password": "string",
  "createdAt": "ISO-8601"
}
```

## Manager Data Record
```json
{
  "bookings": [],
  "expenses": [],
  "otherIncome": []
}
```

## Booking Record
```json
{
  "id": 0,
  "event": "string",
  "artist": "string",
  "artistId": "string|null",
  "date": "YYYY-MM-DD",
  "fee": 0,
  "deposit": 0,
  "balance": 0,
  "contact": "string",
  "status": "string",
  "notes": "string",
  "locationType": "uganda|abroad",
  "location": "string",
  "createdAt": 0
}
```

## Expense Record
```json
{
  "id": 0,
  "description": "string",
  "amount": 0,
  "date": "YYYY-MM-DD",
  "category": "string",
  "receipt": "data-url|null",
  "createdAt": 0
}
```

## Other Income Record
```json
{
  "id": 0,
  "source": "string",
  "amount": 0,
  "date": "YYYY-MM-DD",
  "type": "string",
  "payer": "string",
  "method": "string",
  "status": "string",
  "notes": "string",
  "proof": "data-url|null",
  "createdAt": 0
}
```

## Message Record
```json
{
  "id": 0,
  "from": "string",
  "to": "string|ALL",
  "subject": "string",
  "body": "string",
  "attachments": [],
  "timestamp": "ISO-8601",
  "archivedBy": [],
  "starredBy": []
}
```
