# ULSA EVO App Design System

## 1. Product character

ULSA EVO is a professional ultrasonic anemometer and device-control app. The interface must feel precise, calm, and trustworthy. It should prioritize live measurement comprehension over decoration.

The visual direction combines:

- A compact, Linear-like information hierarchy as a product goal, not as a copied token set.
- Sentry's dark-canvas polarity and hairline separation, without its violet/lime brand palette or illustration system.
- Apple's native typography, 44 px touch sizing, safe-area handling, and reduced visual chrome.
- Vercel's compact technical labels, restrained radius scale, hairlines, and stacked subtle elevation.

This is an original ULSA EVO design system. Do not reproduce another brand's identity, logo treatment, or proprietary assets.

## 1.1 Reference audit

- `awesome-design-md/design-md/sentry/DESIGN.md` was read directly. Its actual source is a marketing-oriented violet/lime system with stickers and large display typography. ULSA adopts only the dark/light surface separation, scarce accent principle, compact status labels, and minimum mobile touch guidance.
- `awesome-design-md/design-md/apple/DESIGN.md` was read directly. ULSA adopts the native SF/system stack, quiet chrome, tight type, 44 px icon controls, and restrained interaction hierarchy. Photography-led layouts and Apple Action Blue are not adopted.
- `awesome-design-md/design-md/vercel/DESIGN.md` was read directly. ULSA adopts hairline borders, compact technical labels, small-radius utility controls, and stacked low-opacity shadows. Vercel's brand mesh gradient and marketing CTA grammar are not adopted.
- A Linear entry is mentioned by the collection README but no `design-md/linear/DESIGN.md` exists in the current repository or its path history. Linear is therefore treated only as a descriptive information-architecture reference, not a directly imported design source.

## 2. Visual theme

- Default to ULSA Slate, a medium blue-gray instrument environment that remains comfortable in ordinary indoor light.
- Offer three curated settings variants: ULSA Slate (standard), ULSA Graphite (dark-room/high contrast), and ULSA Light (bright environments).
- Persist the selected variant locally and apply it consistently to the dashboard, connection modal, and settings drawer.
- Use opaque or lightly translucent instrument surfaces. Avoid washed-out glass-on-glass contrast.
- Use a restrained cyan-mint accent for selected controls and primary live states.
- Keep gradients subtle and environmental. Never place vivid gradients behind measurement text.
- Prefer thin cool-gray borders and soft elevation over large glow effects.

## 3. Color roles

| Role | Value | Usage |
| --- | --- | --- |
| App background | `#071019` to `#101D29` | Main instrument environment |
| Surface strong | `rgba(8, 20, 29, 0.92)` | Drawers, modals, important cards |
| Surface | `rgba(15, 31, 42, 0.82)` | Gauge, chart, metric cards |
| Surface raised | `rgba(24, 43, 56, 0.9)` | Selected controls, hover states |
| Border | `rgba(151, 190, 204, 0.16)` | Default separation |
| Text primary | `#F3F8FA` | Measurements and titles |
| Text secondary | `#9FB2BD` | Labels and explanatory copy |
| Accent | `#5EEAD4` | Selection, live emphasis, focus |
| Connected/live | `#65E6A7` | Healthy BLE and live data |
| Waiting | `#F2C66D` | Scanning, connecting, pending |
| Error/stale | `#FF7B7B` | Stale data, failures, destructive actions |
| Wind speed | `#67E8F9` | Wind speed visualization |
| Wind direction | `#F6C76A` | Direction visualization |
| Temperature | `#FB8A7A` | Temperature visualization |
| Sound speed | `#78D8A0` | Sound-speed visualization |

The table above defines Graphite and shared semantic roles. Slate raises background and border luminance without changing status semantics; Light uses dark text on cool off-white surfaces. Theme variants must not change the meaning of green, amber, red, or the measurement-series colors.

Status colors must never be the only signal. Pair color with text, icon, or shape.

The background and accent colors are ULSA-specific choices rather than borrowed brand colors. Midnight graphite preserves contrast with the white STRVSN mark and behaves like an instrument enclosure. Cyan-mint remains legible on that surface while leaving green, amber, and red available for operational state semantics.

## 4. Typography

- Use the native system stack: `-apple-system`, `BlinkMacSystemFont`, `SF Pro Text`, `Segoe UI`, sans-serif.
- Use tabular numerals for every measurement and progress value.
- Measurement values: high contrast, weight 700-800, compact line height.
- Labels: 11-14 px, medium weight, secondary color.
- Section kickers: uppercase, 10-11 px, 0.10-0.14 em tracking.
- Avoid decorative display fonts and long uppercase Japanese text.

## 5. Layout hierarchy

1. Compact brand and action header.
2. BLE connection status directly below the header.
3. Primary gauge/chart workspace.
4. Live measurement grid.
5. Diagnostics only when operationally relevant.

Use a maximum working width of 1180 px on large screens. Mobile uses a two-column metric grid and 16 px outer gutters. Desktop may use five compact metric columns.

## 6. Components

### Header

- Keep the STRVSN mark centered and legible.
- Menu, orientation, and recording controls use at least 44 x 44 px touch targets.
- Controls use quiet circular or rounded-square surfaces with clear active states.
- Development diagnostics and theme experiments must not overlay the product UI by default.
- Use the white transparent STRVSN asset on Slate/Graphite and the dark transparent asset on Light.

### Iconography

- Use Lucide React for primary navigation, connection state, and frequently used actions.
- Keep icons on a 24 px grid with 1.8-1.9 px rounded strokes; size them at 18-22 px inside 44 px touch targets.
- Use one outline icon per meaning. Do not mix filled, cartoon-like, and unrelated icon families in the same navigation surface.
- Color icons only for selection or semantic state; labels remain present where meaning could be ambiguous.

### Connection status

- Present BLE state as a compact actionable instrument bar near the top.
- Show device name or a concise next action.
- Connected, waiting, stale, and disconnected states must remain distinguishable without relying only on color.

### Gauge and chart

- Use one strong instrument surface with a restrained border.
- Segment controls sit inside a darker rail; selected items use a light or accent-filled indicator.
- Keep unit and display-range controls in one labeled control bar below the gauge; never float them over the arc or scale labels.
- Preserve existing gestures, chart controls, scale controls, and measurement semantics.

### Metric cards

- Favor text and numbers over icons.
- Keep labels quiet and values dominant.
- Use consistent vertical rhythm and tabular numerals.
- Wind speed and direction may receive slightly stronger emphasis, but all values remain readable at a glance.

### BLE modal

- Only connection, discovery, selection, disconnect, errors, and connection-environment information belong here.
- Use a centered dialog on desktop and a near-full-width sheet on mobile.
- Make the primary connect action visually dominant.

### Settings drawer

- Navigation and detail panels must be clearly separated.
- The active category uses the accent color and a stronger surface.
- Dense diagnostics belong in collapsible detail sections.
- Preserve horizontal category navigation on narrow screens.

## 7. Motion and interaction

- Keep transitions between 120 and 240 ms.
- Use ease-out motion for drawers and pressed-state scale only for direct touch feedback.
- Respect the existing native-feeling drawer swipe and upside-down orientation behavior.
- Do not add continuous decorative animation.

## 8. Accessibility and device rules

- Minimum touch target: 44 px.
- Maintain visible focus rings using the accent color.
- Maintain iOS safe areas and the existing manual upside-down transform contract.
- Keep Web Bluetooth and Capacitor/iOS UI semantics identical except for platform-required device selection differences.
- Never show simulated sensor values in production UI.

## 9. Do and do not

Do:

- Make current state and the next safe action obvious.
- Use whitespace to group related controls.
- Keep charts and measurements readable in bright and dark environments.
- Preserve all BLE, logging, OTA, and device-control behavior during visual refactors.

Do not:

- Use bright full-screen gradients, neon cyberpunk styling, or photo-led marketing layouts.
- Stack many equally strong translucent cards.
- Display developer diagnostics over the primary dashboard by default.
- Hide errors or stale states behind subtle color changes.
- hand-edit generated Capacitor assets under `ios/App/App/public`.
