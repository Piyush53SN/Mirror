# services/api

Encrypted sync backend — **P6**. Design constraints fixed now, so the client can
be built against them:

- zero-knowledge: the server stores ciphertext and cannot read it;
- the app works fully with this service switched off;
- no analytics, no release-health reporting, no request logging of bodies;
- remote configuration may only narrow a feature (see `applyOverrides` in
  `packages/shared-types`), never enable collection.

No code in P0. Endpoints arrive in P6 with the client that uses them.
