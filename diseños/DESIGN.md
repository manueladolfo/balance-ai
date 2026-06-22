---
name: Precision Ledger
colors:
  surface: '#f8f9ff'
  surface-dim: '#cbdbf5'
  surface-bright: '#f8f9ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#eff4ff'
  surface-container: '#e5eeff'
  surface-container-high: '#dce9ff'
  surface-container-highest: '#d3e4fe'
  on-surface: '#0b1c30'
  on-surface-variant: '#44474c'
  inverse-surface: '#213145'
  inverse-on-surface: '#eaf1ff'
  outline: '#74777d'
  outline-variant: '#c4c6cd'
  surface-tint: '#4f6073'
  primary: '#041627'
  on-primary: '#ffffff'
  primary-container: '#1a2b3c'
  on-primary-container: '#8192a7'
  inverse-primary: '#b7c8de'
  secondary: '#006d37'
  on-secondary: '#ffffff'
  secondary-container: '#6bfe9c'
  on-secondary-container: '#00743a'
  tertiary: '#121617'
  on-tertiary: '#ffffff'
  tertiary-container: '#272a2c'
  on-tertiary-container: '#8e9193'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#d2e4fb'
  primary-fixed-dim: '#b7c8de'
  on-primary-fixed: '#0b1d2d'
  on-primary-fixed-variant: '#38485a'
  secondary-fixed: '#6bfe9c'
  secondary-fixed-dim: '#4ae183'
  on-secondary-fixed: '#00210c'
  on-secondary-fixed-variant: '#005228'
  tertiary-fixed: '#e0e3e5'
  tertiary-fixed-dim: '#c4c7c9'
  on-tertiary-fixed: '#191c1e'
  on-tertiary-fixed-variant: '#444749'
  background: '#f8f9ff'
  on-background: '#0b1c30'
  surface-variant: '#d3e4fe'
typography:
  headline-lg:
    fontFamily: Inter
    fontSize: 32px
    fontWeight: '600'
    lineHeight: 40px
    letterSpacing: -0.02em
  headline-lg-mobile:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
    letterSpacing: -0.01em
  headline-md:
    fontFamily: Inter
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
  body-lg:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  body-sm:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: '400'
    lineHeight: 18px
  label-bold:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '600'
    lineHeight: 16px
    letterSpacing: 0.05em
  mono-data:
    fontFamily: JetBrains Mono
    fontSize: 14px
    fontWeight: '500'
    lineHeight: 20px
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  base: 4px
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 32px
  container-margin: 40px
  gutter: 20px
---

## Brand & Style
The design system is engineered for a high-end accounting automation platform, prioritizing **trust, accuracy, and professional efficiency**. The brand personality is authoritative yet modern, positioning itself as a reliable partner in financial management.

The visual style follows a **Modern Corporate** aesthetic. It moves away from generic SaaS trends by utilizing a high-density information architecture balanced by generous white space and a sophisticated, limited color palette. The UI should feel like a precision instrument—stable, fast, and meticulously organized—evoking an emotional response of "controlled growth" and "data confidence" for financial professionals and enterprise users.

## Colors
The palette is anchored by **Deep Navy (#1A2B3C)**, used for primary navigation, headers, and core brand elements to establish immediate credibility. **Mint Green (#2ECC71)** acts as the functional accent, representing financial growth, successful transactions, and positive reconciliation status.

A sophisticated grayscale range (using a Slate/Zinc base) provides the necessary contrast for complex data tables. 
- **Surface Primary:** #FFFFFF (Workspaces and modals)
- **Surface Secondary:** #F8FAFC (Sidebar and background)
- **Border:** #E2E8F0 (Subtle dividers)
- **Text Primary:** #0F172A (Headlines and active data)
- **Text Secondary:** #64748B (Labels and metadata)

## Typography
This design system utilizes **Inter** for all UI elements to ensure maximum legibility at small sizes, which is critical for financial reporting. The type hierarchy is strictly defined to distinguish between "Actionable UI" and "Reporting Data."

For numerical figures in balance sheets or audit logs, consider a tabular lining property to ensure vertical alignment of digits. A secondary monospaced font (JetBrains Mono) is reserved specifically for transaction IDs, API keys, or raw ledger entries to provide a technical, high-precision feel.

## Layout & Spacing
The layout uses a **12-column fixed-width grid** for desktop dashboards to ensure that financial data tables maintain consistent column widths. 

- **Desktop (1440px+):** 12 columns, 80px column width, 20px gutters.
- **Tablet (768px - 1024px):** Fluid grid with 24px side margins.
- **Mobile (Below 768px):** Single column with 16px side margins.

A tight 4px base unit is used for component-level spacing (e.g., input heights, button padding) to allow for high data density without feeling cluttered.

## Elevation & Depth
Depth is communicated through **Tonal Layering** and **Subtle Shadows**. We avoid heavy blurs to maintain the "precision" brand attribute.

- **Level 0 (Background):** #F8FAFC. 
- **Level 1 (Cards/Workspaces):** #FFFFFF with a 1px solid border (#E2E8F0).
- **Level 2 (Popovers/Dropdowns):** #FFFFFF with a crisp, low-opacity shadow: `0px 4px 6px -1px rgba(0, 0, 0, 0.1), 0px 2px 4px -1px rgba(0, 0, 0, 0.06)`.
- **Level 3 (Modals):** Focused elevation with a dimming backdrop (40% Navy opacity).

Borders are the primary method of separation, ensuring the interface remains legible even on lower-quality office monitors.

## Shapes
The design system uses **Soft (0.25rem)** roundedness. This subtle rounding softens the professional edges just enough to feel modern without losing the "structured" financial feel. 

Buttons, input fields, and tags use the base 4px radius. Cards and containers use the `rounded-lg` (8px) value to create a clear container hierarchy. Pill shapes are reserved exclusively for status indicators (e.g., "Paid," "Pending") to differentiate them from interactive buttons.

## Components
- **Buttons:** Primary buttons use the Deep Navy background. Success actions use Mint Green. All buttons use semi-bold labels.
- **Data Tables:** The core of the platform. Use alternating row stripes (Zebra striping) in #F8FAFC. Headers should be sticky, using `label-bold` typography and a #E2E8F0 bottom border.
- **Input Fields:** Use a 1px border. On focus, the border shifts to Deep Navy with a 2px Mint Green outer glow (low opacity).
- **Status Chips:** Use a light tint of the status color for the background and a dark shade for the text (e.g., Light Green bg with Dark Green text for "Success").
- **Cards:** White background, 1px border, no shadow unless hovered. Use cards to group logical financial sections (e.g., "Cash Flow Summary").
- **KPI Metrics:** Large, bold Mint Green figures for positive growth, with a small descriptive label in Text Secondary below.