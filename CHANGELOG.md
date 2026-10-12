# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Project foundation: TypeScript, tsup, Vitest, ESLint, Prettier configuration
- Complete public type definitions (`types.ts`)
- Error class hierarchy: `FetchNativeError`, `HttpError`, `NetworkError`, `TimeoutError`, `CancelError`, `ParseError`, `ConfigError`, `RetryExhaustedError`
- Type guard helpers: `isFetchNativeError`, `isHttpError`, `isNetworkError`, `isTimeoutError`, `isCancelError`
- ESM + CJS dual output via tsup
- TypeScript declaration files (`.d.ts`, `.d.mts`, `.d.cts`)

