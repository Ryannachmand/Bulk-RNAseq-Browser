# Frontend validation runs

Playwright scripts that drive the real dashboard against the real backend and
assert behaviour that only exists once the panels are wired together. They are
not part of the build and nothing imports them.

## Running one

`playwright-core` is not a dependency of the app — install it out of tree so
the app's install footprint is unchanged, and point Playwright at the system
Chrome rather than downloading a browser:

```sh
mkdir -p /tmp/pwval && cd /tmp/pwval
npm i playwright-core@1.40.1        # newer releases refuse Node 18
PLAYWRIGHT_CORE=/tmp/pwval/node_modules/playwright-core/index.mjs \
  node <repo>/frontend/validation/<script>.mjs
```

Both dev servers must already be up (`howtorun.txt`): Vite on :5173, uvicorn on
:8000. Each script names the project id it drives at the top; that project has
to exist in `data/projects/` with the data sources the script needs.
