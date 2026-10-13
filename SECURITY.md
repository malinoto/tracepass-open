# Security Policy

## Reporting a vulnerability

Please report security issues privately to **support@tracepass.eu** rather than
opening a public issue. Include enough detail to reproduce: a minimal input or script
is ideal.

You should get an acknowledgement within **3 working days**. Please allow reasonable
time for a fix before public disclosure; we will tell you when a fix ships and credit
you unless you would rather stay anonymous.

## Supported versions

Only the **latest published version** of the `@tracepass/*` packages in this repository receives security fixes. Upgrades are
free; older versions are not patched.

## Scope

**In scope:** anything in these packages: validation logic that accepts what it should reject, identifier parsing or check-digit errors, unsafe handling of untrusted input, dependency vulnerabilities.

**Out of scope:** the hosted TracePass platform and API. Report issues there to the
same address; they are not fixed by a release of this repository.
