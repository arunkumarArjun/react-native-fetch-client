# Security Policy

## Supported Versions

We actively support and provide security patches for the following versions:

| Version | Supported          |
| ------- | ------------------ |
| 0.1.x   | :white_check_mark: |
| < 0.1.0 | :x:                |

## Reporting a Vulnerability

The `react-native-fetch-client` team takes supply chain and application security seriously. If you discover a security vulnerability, please **DO NOT** open a public issue.

Instead, please report it securely through **GitHub Private Vulnerability Reporting**:

👉 **[Submit a Private Security Advisory](https://github.com/arunkumarArjun/react-native-fetch-client/security/advisories/new)**

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
- **Header Redaction**: `Authorization`, `Cookie`, and sensitive headers are automatically redacted in debug logs and error objects.
- **Universal DevTools Stealth Mode**: Built-in `hideFromDevTools` option suppresses private routes and PII from appearing in Chrome Inspect (`chrome://inspect`) and mobile debuggers during security audits.
- **Safe Authentication Mutex**: Prevents race conditions and duplicate refresh tokens during concurrent 401 recovery.
- **Strict Method Checks**: Safe cache storage (RFC 7234) is strictly enforced only on safe HTTP methods (`GET`, `HEAD`).

---

## Universal DevTools Stealth Mode & VAPT Guidance

### Threat Model & Purpose
When mobile applications undergo **Vulnerability Assessment and Penetration Testing (VAPT)** or when attackers attempt dynamic analysis, their initial vector is attaching runtime developer tools (Hermes Inspector, Chrome Inspect via `chrome://inspect`, or Flipper) to map internal APIs, discover hidden parameters, and intercept Bearer tokens.

`hideFromDevTools` provides client-side runtime event suppression to mitigate these vectors.

### Platform Security Matrix

| Environment | Inspection Suppression Status | Threat Mitigation |
| :--- | :--- | :--- |
| **React Native (iOS & Android)** | ✅ **Full Stealth** | Drops events in `XHRInterceptor`. Invisible in Chrome Inspect, Hermes Debugger, and Flipper Network plugin. Prevents runtime API reconnaissance (OWASP M9). |
| **Web (Browsers)** | ⚠️ **Console Stealth Only** | Requests **remain visible in the browser's C++ Network tab** due to W3C sandboxing rules. Suppresses `console.log`, debug traces, and telemetry error leaks (OWASP M1). |
| **Node.js (SSR / Edge)** | ✅ **Full Stealth** | Suppresses Node inspector network events and console dumps. |

### VAPT Audit Test Cases Addressed

1. **OWASP Mobile M1 (Sensitive Data Exposure in Logs):**
   - Automatically silences all internal debuggers and prevents URL, header, or payload logging for stealth endpoints.
2. **OWASP Mobile M9 (Reverse Engineering / Debugger Inspection):**
   - Eliminates CDP (`Chrome DevTools Protocol`) network telemetry packets on React Native mobile runtimes.
3. **Defense-in-Depth vs. Network Proxy Sniffers:**
   - DevTools stealth addresses **in-app debugger inspection**.
   - To protect against external network proxy sniffing (Burp Suite, Charles Proxy, Proxyman) where a tester installs a custom root CA certificate on the operating system, combine `hideFromDevTools` with **SSL Pinning** (e.g. `react-native-ssl-pinning` or native certificate pinning).

