// @adr 008 - the shared contract normalizer (BR-22, §14)
//
// A raw OpenAPI document carries volatile and cosmetic members the contract
// must not depend on: the `servers` block (host-of-the-moment), per-operation
// `tags` (handler-name noise) and the top-level tag list. Normalization strips
// them and sorts every key recursively, so the committed artefact is canonical
// JSON — the same registry always yields the same bytes, byte-comparable with
// no YAML serializer and no diff library in the dependency budget.

export function sortKeysDeep(value) {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => (a < b ? -1 : 1))
        .map(([key, entry]) => [key, sortKeysDeep(entry)]),
    );
  }
  return value;
}

/** Raw spec object → canonical spec object. */
export function normalizeSpec(raw) {
  const spec = structuredClone(raw);
  delete spec.servers;
  delete spec.tags;
  for (const item of Object.values(spec.paths ?? {})) {
    for (const operation of Object.values(item)) {
      if (operation !== null && typeof operation === "object") delete operation.tags;
    }
  }
  return sortKeysDeep(spec);
}

/** Raw spec text → the canonical bytes contract:verify locks. */
export function normalizeText(text) {
  return `${JSON.stringify(normalizeSpec(JSON.parse(text)), null, 2)}\n`;
}
