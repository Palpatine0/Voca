# Design System Inspired by Airbnb

## 1. Visual Theme & Atmosphere

Airbnb's website is a warm, photography-forward marketplace that feels like flipping through a travel magazine where every page invites you to book. The design operates on a foundation of pure white (`#ffffff`) with the iconic Rausch Red (`#ff385c`) — named after Airbnb's first street address — serving as the singular brand accent. The result is a clean, airy canvas where listing photography, category icons, and the red CTA button are the only sources of color.

The typography uses Airbnb Cereal VF — a custom variable font that's warm and approachable, with rounded terminals that echo the brand's "belong anywhere" philosophy. The font operates in a tight weight range: 500 (medium) for most UI, 600 (semibold) for emphasis, and 700 (bold) for primary headings. Slight negative letter-spacing (-0.18px to -0.44px) on headings creates a cozy, intimate reading experience rather than the compressed efficiency of tech companies.

What distinguishes Airbnb is its palette-based token system (`--palette-*`) and multi-layered shadow approach. The primary card shadow uses a three-layer stack (`rgba(0,0,0,0.02) 0px 0px 0px 1px, rgba(0,0,0,0.04) 0px 2px 6px, rgba(0,0,0,0.1) 0px 4px 8px`) that creates a subtle, warm lift. Combined with generous border-radius (8px–32px), circular navigation controls (50%), and a category pill bar with horizontal scrolling, the interface feels tactile and inviting — designed for browsing, not commanding.

**Key Characteristics:**
- Pure white canvas with Rausch Red (`#ff385c`) as singular brand accent
- Near-black text (`#222222`) — warm, not cold
- Three-layer card shadows: border ring + soft blur + stronger blur
- Generous border-radius: 8px buttons, 14px badges, 20px cards, 32px large elements
- Circular navigation controls (50% radius)

## 2. Color Palette

| Token | Light | Dark |
|-------|-------|------|
| Background | `#ffffff` | `#121212` |
| Surface | `#f2f2f2` | `#2a2a2a` |
| Text | `#222222` | `#f2f2f2` |
| Text Muted | `#6a6a6a` | `#a3a3a3` |
| Accent | `#ff385c` | `#ff385c` |
| Accent Pressed | `#e00b41` | `#e00b41` |
| Border | `#c1c1c1` | `#3a3a3a` |
| Danger | `#c13515` | `#ff6b5c` |
| Success | `#2b8a3e` | `#4caf77` |

## 3. Typography Scale

| Role | Size | Weight | Letter Spacing |
|------|------|--------|----------------|
| Section Heading | 28px | 700 | normal |
| Nav Title | 20px | 600 | -0.18px |
| Card Heading | 22px | 600 | -0.44px |
| UI | 16px | 500 | normal |
| Body | 14px | 400 | normal |
| Caption | 13px | 400 | normal |

## 4. Border Radius Scale

- Standard (8px): Buttons, tabs, search elements
- Badge (14px): Status badges, labels
- Card (20px): Feature cards, large buttons
- Large (32px): Large containers, hero elements
- Circle (50%): Nav controls, avatars, icons

## 5. Elevation

| Level | iOS | Android |
|-------|-----|---------|
| Card | shadowOpacity 0.1, radius 8 | elevation 4 |
| Elevated (dark) | shadowOpacity 0.32, radius 8 | elevation 6 |
