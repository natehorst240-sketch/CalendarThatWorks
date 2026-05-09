# Contributing

Thanks for contributing to WorksCalendar.

## Local development

```bash
npm install
npm run dev      # start the interactive demo at localhost:5173
npm run examples # run the example suite
npm test         # run the unit test suite
```

`npm run dev` serves `demo/main.tsx` via Vite — a minimal React app that
mounts `WorksCalendar` with drag enabled and seeded events so you can test
UI changes without publishing the package.

The `demo/` directory is **never published to npm**. Only `dist/`,
`README.md`, and `LICENSE` are included in the npm package (controlled by
the `files` field in `package.json`).

## Recommended workflow

1. Create a feature branch.
2. Add/update tests for behavior changes.
3. Run lint/tests before submitting.
4. Update docs/examples for user-facing changes.

## Documentation expectations

When adding new user-facing features, include:
- README updates (feature + usage)
- at least one runnable example in `examples/`
- any focused deep-dive in `docs/`

## PR quality checklist

- [ ] Behavior verified locally
- [ ] Tests added/updated
- [ ] No sensitive credentials in code
- [ ] Docs and examples updated
