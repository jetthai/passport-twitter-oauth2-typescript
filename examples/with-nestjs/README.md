# NestJS Twitter OAuth2 Example

This example demonstrates how to use `@superfaceai/passport-twitter-oauth2` with NestJS and Redis for PKCE state management (without express-session).

## Prerequisites

- Node.js 18+
- Redis server running
- Twitter Developer Account with OAuth 2.0 credentials

## Setup

1. Install dependencies:

```bash
npm install
```

2. Copy `.env.example` to `.env` and fill in your credentials:

```bash
cp .env.example .env
```

3. Configure your Twitter app callback URL to: `http://localhost:3000/auth/twitter/callback`

4. Start Redis server

5. Run the application:

```bash
npm run start:dev
```

6. Visit `http://localhost:3000/auth/twitter` to start the login flow

## Project Structure

```
src/
├── auth/
│   ├── auth.controller.ts       # Login endpoints
│   ├── auth.module.ts           # Auth module
│   ├── twitter.strategy.ts      # Passport strategy
│   └── twitter-pkce-store.service.ts  # PKCE store using Redis
├── redis/
│   ├── redis.module.ts          # Redis module
│   └── redis.service.ts         # Redis service
├── app.module.ts                # Root module
└── main.ts                      # Entry point
```

## How it works

1. User visits `/auth/twitter`
2. Controller generates a custom `state` and stores payload in Redis
3. `TwitterPKCEStoreService.store()` is called - adds `code_verifier` to Redis
4. User is redirected to Twitter for authorization
5. Twitter redirects back to `/auth/twitter/callback` with `state` and `code`
6. `TwitterPKCEStoreService.verify()` retrieves `code_verifier` from Redis
7. Token exchange happens with `code_verifier`
8. `TwitterStrategy.validate()` is called with user profile

## Key Points

- **No session required**: Uses Redis instead of express-session
- **PKCE support**: Required by Twitter OAuth 2.0
- **Custom state**: Store additional payload (redirect URL, user info, etc.)
