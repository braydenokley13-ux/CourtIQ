# Generated pack — do not edit by hand

Files in this directory are produced by `scripts/materialize-templates.ts` from
`packages/db/seed/scenarios/templates/`.

To change a scenario, edit its template or variant under `templates/`, then run:

```sh
pnpm exec tsx scripts/materialize-templates.ts
```

CI runs the same script with `--check` and fails if regenerated output drifts.
