# Security Policy

## Supported Versions

We actively support and provide security patches for the following versions:

| Version | Supported          |
| ------- | ------------------ |
| 0.1.x   | :white_check_mark: |
| < 0.1.0 | :x:                |

## Reporting a Vulnerability

The `react-native-fetch-client` team takes supply chain and application security seriously. If you discover a security vulnerability, please **DO NOT** open a public issue.

Instead, please report it through one of the following channels:

1. **GitHub Private Vulnerability Reporting**: Submit a private advisory directly through [GitHub Security Advisories](https://github.com/arunkumarArjun/react-native-fetch-client/security/advisories/new).
2. **Email**: Send a direct report to the project maintainer at `arunkumar.arjunan@gmail.com` with the subject `[SECURITY] react-native-fetch-client vulnerability`.

### Please include:
- A detailed description of the vulnerability.
- Steps to reproduce or a minimal proof of concept (PoC).
- The affected package version(s) and environment (React Native, Node.js, Browser).
- Any potential impact on users.

### Response Timeline
- **Initial Acknowledgement**: Within 24–48 hours.
- **Triage & Assessment**: Within 5 business days.
- **Fix & Advisory Release**: Coordinated disclosure with CVE assignment (if applicable).

## Security Best Practices in react-native-fetch-client

- **Zero Runtime Dependencies**: Completely eliminates third-party transitive supply chain vulnerabilities (`node_modules` pollution).
- **Header Redaction**: `Authorization`, `Cookie`, and sensitive headers are automatically redacted in debug logs and error objects.
- **Safe Authentication Mutex**: Prevents race conditions and duplicate refresh tokens during concurrent 401 recovery.
- **Strict Method Checks**: Safe cache storage (RFC 7234) is strictly enforced only on safe HTTP methods (`GET`, `HEAD`).
