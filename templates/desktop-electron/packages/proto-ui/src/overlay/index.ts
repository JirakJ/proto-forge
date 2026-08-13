// @adr 008 - the overlay subsystem's public surface
// Importing this module is what brings overlay.css into the bundle, so a consumer
// cannot get the hooks without the stylesheet the top-layer path needs.
import "./overlay.css";

export { OverlayStackProvider, useOverlaySlot, STEP, type OverlaySlot } from "./OverlayStack";
export { detectCapabilities, type Capabilities, type CapabilityView } from "./capabilities";
export { promote, demote, isPromoted, type PromoteMode } from "./topLayer";
export { useDismiss, type UseDismissOptions } from "./useDismiss";
export { usePromotion } from "./usePromotion";
export { useScrollLock } from "./useScrollLock";
export { useInertBackground } from "./useInertBackground";
export { useFocusScope, type UseFocusScopeOptions } from "./useFocusScope";
export { useAnchor, type Placement, type Position, type UseAnchorOptions } from "./useAnchor";
export { OVERLAY_KINDS, type OverlayKind, type OverlaySurface } from "./types";
