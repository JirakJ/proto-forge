# Deterministic testid derivation (D2)

Discovery allocates `data-testid` values before any code exists, and the main
pipeline honors them as reservations (BR-31). The allocation is a pure function of
the pinned sources, so two runs over the same sources reserve the same names.

## Grammar

```
^[a-z0-9]+(-[a-z0-9]+)*$
```

Byte-identical to the web template's `testid:scan` (BR-02): lowercase kebab-case,
no leading/trailing hyphen, no double hyphen. A reserved name that later fails the
generated repo's scan would be a contradiction between the two skills, so the
grammar is checked at allocation time by `.discovery/lint.mjs`.

## The algorithm

1. **Slug.** `slug(name)`: Unicode-normalize (NFKD), drop combining marks, lowercase,
   replace every run of non-`[a-z0-9]` with a single `-`, trim hyphens. `slug("Přidat
   položku")` → `pridat-polozku`; `slug("Add Item!")` → `add-item`.
2. **Screen / feature elements.** `testid = <unit-id>-<slug(layer name)>`, where the
   layer name is the Figma layer's name (screen units) or the noun the brief names
   (feature units, brief-only runs). When the slug is empty (a layer named `***` or
   an unnamed frame), fall back to the element's role: `<unit-id>-<role>` (`button`,
   `list`, `heading`, …).
3. **Collision.** Within a run, the first element to claim a name (Figma node order,
   then brief statement order) keeps it bare; later claimants append `-2`, `-3`, … in
   that same order. The suffix is part of the reservation — a re-run over the same
   sources reproduces it.
4. **api-area operations.** `testid = api-<unit-id>-<verb>-<resource>` with
   `verb ∈ {list, get, create, update, delete}` and `resource` the kebab entity
   name. The `<verb>-<resource>` half deliberately transposes BR-25's
   `<resource>-<verb>` operationId, so a reservation maps 1:1 onto the backend's
   addressability surface without colliding with it textually.

## Worked examples

| Source                                             | Unit        | Derived testid                  |
| -------------------------------------------------- | ----------- | ------------------------------- |
| Figma layer "Order list" in frame "Orders"         | orders      | `orders-order-list`             |
| Figma layer "Přidat objednávku" in frame "Orders"  | orders      | `orders-pridat-objednavku`      |
| Second layer also named "Order list" (node order)  | orders      | `orders-order-list-2`           |
| Unnamed button layer (slug empty, role fallback)   | orders      | `orders-button`                 |
| Brief noun "checkout button" (no Figma)            | checkout    | `checkout-checkout-button`      |
| Operation "list orders" on the orders api-area     | orders-api  | `api-orders-api-list-orders`    |

## What is gated and what is reviewed

`.discovery/lint.mjs` gates the grammar and the cross-document uniqueness of every
reservation. That the reserved name equals the derivation of its layer name cannot
be gated offline — replaying the derivation needs the Figma tree, which verify never
has — so that half of BR-31 is review-verified, and the rule says so.
