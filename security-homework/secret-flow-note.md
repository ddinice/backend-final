# Secret delivery and rotation

## Where secrets live

| Environment | Storage | Committed to git |
|-------------|---------|------------------|
| Local dev | `app/.env.dev` (from `.env.example`) | No — `.env*` is gitignored |
| CI (if added) | Encrypted variables / OIDC to cloud secret manager | No plaintext in logs |
| Production (target) | Kubernetes `Secret` resources, AWS Secrets Manager, or similar | Never in repo |

## How secrets reach runtime

1. **Current (dev / small deploy):** `ConfigModule.forRoot` loads `app/.env.${NODE_ENV}` at process start. Variables are read by `ConfigService` and injected into `JwtModule`, `TypeOrmModule`, etc. No secrets are embedded in source code.
2. **Target production:** Build produces an image **without** `.env`. At deploy time, the orchestrator mounts secrets as env vars or files (e.g. `envFrom` → Secret). The same variable names (`JWT_SECRET`, `DB_PASSWORD`, …) are used.

## What must never be logged

- Raw JWT access tokens and refresh tokens  
- `JWT_SECRET`, API keys, DB passwords, connection URIs with credentials  
- Request bodies containing passwords (`LoginDto.password`)  
- Full payment or card data (not applicable to this service yet)

Audit and application logs must use structured fields only (ids, outcomes, masked identifiers).

## Rotation strategy

| Secret | Rotation approach |
|--------|-------------------|
| **JWT signing secret** | Generate a new strong secret in the secret store; deploy with dual validation only if using key rotation middleware (not implemented). Short term: deploy new secret → all old tokens invalid after restart. Prefer short `JWT_EXPIRES_IN` to limit exposure. |
| **Database credentials** | Rotate in DB (new user/password), update secret in manager, rolling restart pods; verify connection before revoking old user. |
| **Integration API key** (future payment/provider) | Create new key in provider dashboard; update secret; deploy; revoke old key after traffic confirms new key. |

## Current vs target

- **Current:** File-based `.env.dev` / `.env.prod` on the host (not in git). Suitable for coursework and local/stage.  
- **Target:** Secrets only from a managed store + injection at runtime; `.env` files absent from production images.

## Optional local schema sync (`SYNC_DB`)

If the database has no migrations applied yet, you can set `SYNC_DB=1` **only in local development** so TypeORM creates tables from entities. **Never set `SYNC_DB=1` in production** — use explicit migrations instead.
