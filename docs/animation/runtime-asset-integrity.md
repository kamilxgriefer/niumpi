# Runtime sprite asset integrity

Niumpi schema-v3 manifests carry a full lowercase SHA-256 for every WebP page,
and the content-hash prefix is part of that page's filename. The manifest
validator rejects a missing hash, a malformed hash, or a URL whose hash prefix
does not match the declared digest.

The complete downloaded files are verified at build/test time by
`tests/public-assets-hygiene.test.mts`. That gate reads every declared WebP,
recomputes SHA-256 from all file bytes, checks the manifest digest, parses its
real dimensions, and verifies decoded-byte accounting. This is the canonical
full-byte integrity check and fails before deployment.

The browser intentionally does not fetch every WebP a second time through
`crypto.subtle.digest`: the production player decodes pages lazily through the
Image pipeline, and a parallel byte fetch would duplicate network and memory
pressure on mobile. At runtime it instead validates schema, full hash metadata,
content-hashed URLs, dimensions after decode, and the declared decoded-byte
budget. A stale manifest/page failure receives one cache-bypassing manifest
reload; a second failure is terminal for that mounted player and falls back to
the approved still rather than retrying indefinitely.
