# Local security fork

Upstream: sprintf-js 1.1.3, https://registry.npmjs.org/sprintf-js/-/sprintf-js-1.1.3.tgz
Upstream npm integrity: sha512-Oo+0REFV59/rz3gfJNKQiBlwfHaSESl1pcGyABQsnnIfWOFt6JNj5gCog2U6MLZ//IGYD+nA8nI+mTShREReaA==
Advisory: https://github.com/advisories/GHSA-hp3w-g68c-fv3c

This is a local derivative, not an upstream 1.1.4 release. The version 1.1.4-security.1 identifies this patch. Requests with field width or precision above 65536 are rejected before argument evaluation, conversion or allocation. Ordinary formats retain upstream behaviour. The browser distribution includes the same patch. The original BSD-3-Clause licence and attribution are preserved.

Regression command: node test/security.cjs
