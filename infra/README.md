# infra

Everything needed to reproduce a release belongs here and is scripted. P0 ships
the CI workflows and the EAS profiles; containerised build and self-hosted API
deployment arrive in P6.

Secrets policy: no secret is committed. The workflows read `EXPO_TOKEN` and
signing material from GitHub environments, and the EAS project owns the signing
keys.
