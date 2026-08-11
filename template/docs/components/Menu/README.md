# Menu

A menu button whose surface escapes the app tree. The list renders in the body-level portal and is anchored to the trigger in **viewport** coordinates, because a portalled element has no offset parent to be `position: absolute` against.

![An open menu, anchored to its trigger](open.png)

## API

| Prop | Type | Notes |
| --- | --- | --- |
| `label` | `string` | **Required**, already translated. Used for the trigger text and the menu's accessible name. |
| `items` | `{ id: string; label: string; onSelect: () => void }[]` | `label` is translated by the caller. An empty array is valid and renders an empty surface. |
| `data-testid` | `string` | **Required.** Trigger `<testid>-trigger`, surface `<testid>-surface`, item `<testid>-item-<id>`. |

## Layering

`tokens.layer.popover` (1100) — deliberately **above** `modal` (1010), so a menu opened from inside a dialog is usable rather than painted underneath it. That case is photographed in [Dialog](../Dialog/README.md).

## Behaviour

- Opens on trigger click; clicking the trigger again closes it.
- Escape closes; a pointer press anywhere outside the trigger and surface closes.
- Closing returns focus to the trigger.
- Opening moves focus to the first item — necessary once portalled, since the surface sits at the end of the document and would otherwise be at the end of the tab order.
- The anchor is recomputed on `resize` and on `scroll` (captured, so an ancestor scroll counts), rather than drifting away from the trigger.

## Accessibility

`aria-haspopup="menu"` and `aria-expanded` on the trigger; `role="menu"` with `role="menuitem"` children and an accessible name from `label`.

## i18n

```tsx
<Menu
  data-testid="notes-actions"
  label={t("notes.actions.label")}
  items={[{ id: "edit", label: t("notes.actions.edit"), onSelect: edit }]}
/>
```
