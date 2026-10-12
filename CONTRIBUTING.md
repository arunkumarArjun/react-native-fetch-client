# Contributing to react-native-fetch-client

Thank you for your interest in contributing!

## Development setup

```bash
git clone https://github.com/arunkumarArjun/react-native-fetch-client.git
cd react-native-fetch-client
npm install
npm run build
npm run test
```

## Workflow

1. Fork the repository and create a feature branch.
2. Make your changes in `src/`.
3. Add or update tests in `test/`.
4. Run `npm run typecheck && npm run lint && npm run test` and fix any failures.
5. Open a pull request with a clear description of the change and why it is needed.

## Commit style

Use conventional commits: `feat:`, `fix:`, `docs:`, `test:`, `refactor:`, `chore:`.

## Code standards

- **No `any`** — use `unknown` and narrow with type guards.
- **No silent errors** — every error path must be observable.
- **No token logging** — never log authorization headers or credentials.
- **Test what you change** — PRs without tests for new behavior will be asked to add them.

## Security

If you discover a security vulnerability, please open a private security advisory on GitHub rather than a public issue.

