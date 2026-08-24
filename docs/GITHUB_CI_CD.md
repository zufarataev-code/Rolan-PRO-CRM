# GitHub CI/CD

The repository uses two workflows:

- `CI` runs tests, TypeScript checks, and a production build for every pull request and every push to `main`.
- `Deploy production` runs only after `CI` succeeds on `main`.

Production deployment fast-forwards `/home/runcloud/webapps/rolanpro-crm` to the exact commit verified by CI. The existing `deploy/watch-production.sh` process detects the new commit, builds an isolated release, applies Prisma migrations, checks application health, and keeps the previous release available for rollback.

## Required GitHub configuration

Create a GitHub environment named `production` and add these environment secrets:

- `PRODUCTION_SSH_KEY`: the private key used only by GitHub Actions for the `runcloud` account.
- `PRODUCTION_SSH_KNOWN_HOSTS`: the pinned `known_hosts` line for `143.110.136.211`.

The matching public key must be present in `/home/runcloud/.ssh/authorized_keys` on the production server.

The verified ED25519 host-key fingerprint is:

```text
SHA256:5OlGma094KFLcNnutqzIsWcnrJstWgjIXDYxUsCHbUo
```

Do not store the private key or production environment file in Git.

## Production prerequisites

- `main` is checked out in `/home/runcloud/webapps/rolanpro-crm`.
- The worktree is clean before deployment.
- `deploy/watch-production.sh` runs continuously under the server process manager.
- `/home/runcloud/.rolanpro-crm.env.production.local` exists with mode `600` and contains a strong `AUTH_SECRET`.
- PostgreSQL is available on `127.0.0.1:5433` with the production database configured in `DATABASE_URL`.
