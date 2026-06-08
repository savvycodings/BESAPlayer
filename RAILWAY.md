# Railway deploy (`server/` only)

Railway should use **`server`** as the service root directory. Only this folder is deployed.

## Railpack (default)

Railpack reads `package.json` in this directory:

| Step  | Command            |
|-------|--------------------|
| Install | `pnpm install --frozen-lockfile` |
| Build | `pnpm run build`   |
| Start | `pnpm run start`   |

No custom config required if those scripts exist (they do).

## Important

- **Do not** add `pnpm-workspace.yaml` here. A workspace file without a `packages:` list breaks `pnpm install` on Railway (pnpm 9.x).
- Commit `pnpm-lock.yaml` in this folder whenever dependencies change.
- Set env vars in Railway (e.g. `DATABASE_URL`, `BETTER_AUTH_SECRET`, `POKEDATA_API_KEY`, etc.) — see `SETUP.md`.

## Optional: Dockerfile

`Dockerfile` in this folder is an alternative if you switch the Railway builder from Railpack to Dockerfile.
