# Security baseline — backend-final

## Local database (migrations + seed)

From `app/` with PostgreSQL running and `app/.env.dev` configured (`SYNC_DB=0` recommended):

```bash
npm run db:setup
```

This runs TypeORM migrations (`db:migrate`) then loads demo users/products/orders (`db:seed`). Seeding is disabled when `NODE_ENV=production`. For a one-off schema sync without migrations, see [secret-flow-note.md](secret-flow-note.md) (`SYNC_DB` — dev only).

## Service overview

NestJS REST API: JWT bearer authentication, role-based access on orders (`admin`, `support`, `user`), TypeORM + PostgreSQL, Swagger UI at `/api`, public product catalog at `GET /products`.

## OWASP-style mapping (ASVS-inspired)

| Surface area | Risk | Control before homework | Added in homework | Evidence | Residual risk |
|--------------|------|-------------------------|-------------------|----------|---------------|
| `POST /auth/login` | Brute force / credential stuffing | JWT issuance; validation | Named **strict** throttler (8 req/min) + **default** (120/min); structured **audit** on success/failure | [rate-limit.txt](security-evidence/rate-limit.txt), [audit-log-example.txt](security-evidence/audit-log-example.txt) | No CAPTCHA; no IP reputation |
| `POST /auth/register` | Spam / enumeration | Email uniqueness | Same throttling as login (no `SkipThrottle` on auth controller) | [rate-limit.txt](security-evidence/rate-limit.txt) | Email verification not implemented |
| `DELETE /orders/:id` (admin) | Abuse / mistaken deletes | `RolesGuard` admin only | Stricter `@Throttle` on delete (5/min on `strict`); **audit** `orders.delete` | [audit-log-example.txt](security-evidence/audit-log-example.txt) | No soft-delete / approval workflow |
| `GET /api` (Swagger) | XSS / clickjacking | — | **helmet** baseline; CSP disabled for Swagger inline assets | [headers.txt](security-evidence/headers.txt) | Interactive docs remain a larger browser surface |
| Global API | Overload | — | Default throttler + products/orders skip **strict** only | [rate-limit.txt](security-evidence/rate-limit.txt) | In-memory store — use Redis in multi-instance prod |

### Authentication / session / JWT

- **Have:** HS256 JWT (`JWT_SECRET` from env), payload `sub`, `email`, `roles`; bcrypt password hashes.  
- **Risk:** No refresh-token rotation or revocation list.  
- **Homework:** Stronger config validation (Joi `JWT_SECRET` min 32 chars); audit on login outcomes.  
- **Backlog:** Refresh tokens, token versioning, optional denylist on logout.

### Access control / roles / scopes

- **Have:** `JwtAuthGuard` + `RolesGuard` + `@Roles()` on orders.  
- **Risk:** Coarse role strings only; no OAuth scopes.  
- **Homework:** Documented in table above; admin delete audited.  
- **Backlog:** Fine-grained permissions per resource.

### Secrets management

- **Have:** `ConfigModule` + Joi; secrets from `.env.${NODE_ENV}` (ignored by git).  
- **Homework:** All required keys validated at bootstrap; `.env.example` documents variables without real values.  
- **Details:** [secret-flow-note.md](secret-flow-note.md) (rotation, prod target, `SYNC_DB` warning).

### Transport / TLS

- **Edge TLS** and internal HTTP described in [tls-note.md](tls-note.md). App listens HTTP; TLS at load balancer/ingress.  
- **Homework:** `trust proxy` when `TRUST_PROXY=1` or `NODE_ENV=prod` for correct client IP behind proxy.

### Input surface / abuse protection

- **Have:** `ValidationPipe` (whitelist, forbid non-whitelisted).  
- **Homework:** Dual-layer rate limits (default + strict); helmet response headers.

### Logging / auditability

- **Have:** Basic timing interceptor.  
- **Homework:** `CorrelationIdMiddleware`; `AuditService` JSON lines with `action`, `actorId`, `actorRoles`, `targetType`, `targetId`, `outcome`, `correlationId`, `timestamp`, optional `ip`/`userAgent`/`reason`. No passwords or JWTs in audit payload.

## Evidence index

| File | Content |
|------|---------|
| [security-evidence/headers.txt](security-evidence/headers.txt) | Response headers from `/api` (helmet) |
| [security-evidence/rate-limit.txt](security-evidence/rate-limit.txt) | HTTP 429 after repeated login attempts |
| [security-evidence/audit-log-example.txt](security-evidence/audit-log-example.txt) | Sample `[AUDIT]` JSON lines |
| [secret-flow-note.md](secret-flow-note.md) | Secret lifecycle and rotation |
| [tls-note.md](tls-note.md) | TLS termination and traffic classes |

## Reflection (homework note)

- **Weakest area before hardening:** Rate limits and security headers were absent; correlation id was only partially referenced in the exception filter; secrets were not fully validated at startup.  
- **What we fixed:** `helmet`, two-tier throttling, correlation middleware, structured audit for auth and admin delete, Joi for secrets, trust proxy hook, documentation + evidence.  
- **Intentional backlog:** CAPTCHA, refresh tokens, Redis-backed throttler, cloud secret manager integration, payment provider keys, automated security smoke tests in CI.
