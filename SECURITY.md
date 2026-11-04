# Security Policy

## Supported Versions

We actively support and provide security patches for the following versions:

| Version | Supported |
| ------- | --------- |
| 1.0.x   | Yes       |
| 0.3.x   | Yes       |
| 0.2.x   | Yes       |
| 0.1.x   | Yes       |
| < 0.1.0 | No        |

## Reporting a Vulnerability

The `react-native-fetch-client` team takes supply chain and application security seriously. If you discover a security vulnerability, please **DO NOT** open a public issue.

Instead, please report it securely through **GitHub Private Vulnerability Reporting**:

**[Submit a Private Security Advisory](https://github.com/arunkumarArjun/react-native-fetch-client/security/advisories/new)**

This keeps the report private, encrypted, and accessible only to the project maintainers until a fix is released.

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
- **Cross-Origin Credential Isolation (SSRF & Token Leak Guard)**: Outgoing credentials (`bearerToken`, `auth`) are automatically restricted to the configured `baseURL` origin. Calls to external domains do not receive ambient credentials unless explicitly enabled via `allowCrossOrigin: true`.
- **Sensitive Header Redaction in Errors & Logs (CWE-532)**: `Authorization`, `Cookie`, `Set-Cookie`, `Proxy-Authorization`, `X-Api-Key`, and `X-Auth-Token` are automatically sanitized to `'[REDACTED]'` in all debug logs and `FetchNativeError.config` objects.
- **Cache & Disk Storage Sanitization (CWE-312)**: Response headers stored in persistent cache adapters (`MMKV`, `AsyncStorage`) automatically strip `Set-Cookie`, `Set-Cookie2`, and `Authorization` to prevent cleartext session token leakage to local device storage.
- **Offline Mutation Queue Protection**: Queued offline requests strip static `Authorization` headers before persisting to disk; fresh tokens are evaluated and attached dynamically by the client at replay time.
- **Safe Authentication Mutex**: Prevents race conditions and duplicate refresh tokens during concurrent 401 recovery.
- **Strict Method Checks**: Safe cache storage (RFC 7234) is strictly enforced only on safe HTTP methods (`GET`, `HEAD`).

---

## Supply Chain & Scanner Policy (Socket.dev)

### Network Access Capability (`networkAccess`)

Static security scanners such as [Socket.dev](https://socket.dev/npm/package/react-native-fetch-client) flag the `networkAccess` capability for `react-native-fetch-client` because the library resolves and executes `globalThis.fetch`.

- **Intended Capability**: As an HTTP client library, network communication via the WHATWG `fetch` API is the core purpose of `react-native-fetch-client`.
- **Zero Background Telemetry**: The library contains **zero telemetry, tracking pings, metrics collection, or covert network requests**. Outbound requests are only dispatched when the consuming application explicitly calls client methods (`.get()`, `.post()`, `.request()`, etc.).
- **Zero Supply Chain Dependencies**: The library maintains strictly zero production dependencies (`"dependencies": {}`), eliminating third-party transitive supply chain risks.
- **Zero Install Scripts**: The package contains no `postinstall`, `preinstall`, or arbitrary lifecycle scripts.

If your CI/CD pipeline enforces Socket.dev checks, configure `.socket.yml` to acknowledge `networkAccess: false` for this repository.

---

## Network Security & VAPT Guidance

### Sensitive Data Protection & Proxy Defenses

1. **OWASP Mobile M1 (Sensitive Data Exposure in Logs):**
   - Automatically redacts authorization headers in internal logs and error objects.
2. **Defense against Network Proxy Sniffing (Charles, Proxyman, Burp Suite):**
   - In production builds (`__DEV__ = false`), React Native automatically disables Chrome DevTools / Hermes debugging.
   - To defend against external Man-in-the-Middle network proxies where a tester or attacker installs a custom root CA certificate on the test device, configure **SSL Pinning** (e.g. `react-native-ssl-pinning` or native TLS certificate pinning via TrustKit / Network Security Config).
