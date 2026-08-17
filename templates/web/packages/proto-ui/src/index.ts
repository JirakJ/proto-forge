// @adr 020 - owned component library public surface
// Public surface of @jj/proto-ui. Features import primitives from here only.
export { Button, type ButtonProps } from "./Button";
export { Field, type FieldProps } from "./Field";
export { Select, type SelectProps, type SelectOption } from "./Select";
export { Checkbox, type CheckboxProps } from "./Checkbox";
export { Dialog, type DialogProps } from "./Dialog";
export { Menu, type MenuProps, type MenuItem } from "./Menu";
export { Table, type TableProps, type Column } from "./Table";
export { Tabs, type TabsProps, type TabItem } from "./Tabs";
export { Tooltip, type TooltipProps } from "./Tooltip";
export { Tooltip, type TooltipProps } from "./Tooltip";
export { ToastProvider, useToast, type ToastProviderProps } from "./Toast";
export { Portal, OVERLAY_ROOT_ID } from "./Portal";
export { tokens, tokensCssEntries, type Tokens, type Layer } from "../tokens";
export { ProtoUIProvider, type ProtoUIProviderProps } from "../providers/index";
// The overlay contract, for a prototype that composes a surface of its own. The hooks
// behind it are deliberately NOT re-exported here: a feature that reaches for
// useDismiss or promote is hand-rolling an overlay, which BR-10 and layer:scan reject.
export { OVERLAY_KINDS, type OverlayKind, type OverlaySurface, type Capabilities } from "./overlay/index";
