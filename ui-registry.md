# ENNOIA UI Registry

## Baseline — Established 2026-09-24

This baseline was established via an imprint audit and confirmed by the project owner.

| Property | Web pattern | Mobile pattern |
| --- | --- | --- |
| App background | `bg-night` | `color.night` |
| Card background | `bg-surface1` | `color.surface1` |
| Elevated panel | `bg-surface2` | `color.surface2` |
| Card border | `border border-border` | `borderWidth: 1`, `borderColor: color.border` |
| Structural radius | square, no rounded class | `radius.md`/`radius.lg` (both `0`) |
| Primary action | `bg-brand text-white` | `color.brand` with white label |
| Accent | `text-leaf`, `bg-lime` | `color.lime` |
| Primary text | `text-text` | `color.text` |
| Secondary text | `text-text-secondary` | `color.textSecondary` |
| Muted text | `text-text-muted` | `color.textMuted` |
| Action/meta type | monospace uppercase with letter spacing | `eyebrow()` / `MONO` uppercase |
| Inputs | `bg-surface2 border-border` | `color.surface2` with `color.border` |

Avatars, camera/reaction controls, and over-video overlays may be round. Raw black, white,
and translucent black are allowed only for video surfaces and legible overlays. New cards,
lists, and control panels should remain square. Prefer existing semantic tokens over new hex
values. Do not replace the existing React Navigation structure solely to follow a generic
Expo Router recipe.

### Mobile avatar

File: `apps/mobile/src/components/ui.tsx`
Last updated: 2026-09-24

| Property | Value |
| --- | --- |
| Background fallback | name-derived `hsl()` swatch |
| Border | none |
| Border radius | full circle (`size / 2`) |
| Image | `expo-image`, `contentFit="cover"` |
| Fallback text | `color.night`, bold initials |
| Spacing | centered; no internal inset |
| Shadow | none |

**Pattern notes:** A real profile URL fills the existing circular avatar. Missing or
failed images fall back to the same deterministic initials design used before.

## Existing deviations to revisit

- `apps/web/src/screens/Live.tsx` and `apps/mobile/src/screens/Live.tsx` contain round
  controls and translucent black overlays. Those are video-surface exceptions, not card styles.
- `apps/mobile/src/screens/Home.tsx` and `apps/mobile/src/screens/MomentDetail.tsx` contain
  literal black video placeholders; retain only where they represent an actual video surface.
- A few live-screen white labels bypass the theme token; use token equivalents when those
  components are edited, while preserving contrast over video.

### Web broadcast stage and controls

File: `apps/web/src/components/LiveKitStage.tsx`
Last updated: 2026-09-24

| Property | Class |
| --- | --- |
| Video background | `bg-black` |
| Control panel | `bg-surface1` |
| Panel and control border | `border border-border` / `border-t border-border` |
| Border radius | none (square) |
| Primary text | `text-text` |
| Supporting text | `text-text-secondary`, `text-text-muted` |
| Metadata label | `font-mono text-micro uppercase tracking-[0.14em]` |
| Panel spacing | `p-4`, `gap-2`, `space-y-4` |
| Hover state | `hover:border-borderStrong` |
| Shadow | none |
| Accent usage | `text-lime` for role and invite state |

**Pattern notes:** Host studio and viewer controls use the same square panel language but
expose different actions. Black and translucent black belong only to the video surface.

### Mobile broadcast stage and controls

File: `apps/mobile/src/components/livekit-stage.tsx`
Last updated: 2026-09-24

| Property | Value |
| --- | --- |
| Video background | `color.night` |
| Control panel | `color.surface1` |
| Panel and control border | `borderWidth: 1`, `borderColor: color.border` |
| Border radius | none (square) |
| Primary text | `color.text` |
| Supporting text | `color.textSecondary`, `color.textMuted` |
| Metadata label | `eyebrow(10)` / `eyebrow(11)` |
| Panel spacing | `padding: 12`, `gap: 8` / `gap: 10` |
| Pressed state | opacity `0.8`; disabled opacity `0.4` |
| Shadow | none |
| Accent usage | `color.lime` for role and invite state |

**Pattern notes:** The native studio has the same square, bordered hierarchy as web.
Viewer and speaker actions are intentionally separated from host moderation controls.
On iOS, the screen-share control opens the system broadcast picker while preserving
the existing square control styling; Android keeps its foreground-service path.

### Web social post card

File: `apps/web/src/components/PostCard.tsx`
Last updated: 2026-09-24

| Property | Class |
| --- | --- |
| Card background | `bg-surface1` |
| Nested reference/input | `bg-surface2` |
| Border | `border border-border` |
| Border radius | none |
| Primary text | `text-text` |
| Supporting text | `text-text-secondary`, `text-text-muted` |
| Actions and metadata | `font-mono text-micro uppercase tracking-[0.1em]` |
| Spacing | `p-4`, `gap-3`, `mt-3` |
| Hover state | `hover:text-leaf` |
| Shadow | none |
| Accent usage | `text-leaf` for links and active like |

**Pattern notes:** Feed cards use a restrained, square document-like surface. Media may
use `bg-black`; nested quoted/reposted content uses the elevated surface token.

### Web post composer

File: `apps/web/src/components/PostComposer.tsx`
Last updated: 2026-09-24

| Property | Class |
| --- | --- |
| Background | `bg-surface1` |
| Input background | `bg-surface2` (text draft transparent) |
| Border | `border border-border` |
| Border radius | none |
| Primary text | `text-text` |
| Secondary text | `text-text-secondary` |
| Labels/actions | `font-mono text-micro uppercase` |
| Spacing | `p-4`, `mt-3`, `gap-3` |
| Hover state | `hover:text-text` |
| Shadow | none |
| Accent usage | `bg-brand` for Publish |

**Pattern notes:** File and embed choices sit below the draft, preserving a text-first
composition flow. Failed publication keeps the draft and already-uploaded IDs.

### Web unified feed

File: `apps/web/src/screens/Home.tsx`
Last updated: 2026-09-24

| Property | Class |
| --- | --- |
| Feed panel | `bg-surface1` |
| Selected tab | `bg-surface2 text-leaf` |
| Border | `border border-border` |
| Border radius | none |
| Main text | `text-text` |
| Secondary text | `text-text-secondary` |
| Tab/meta type | `font-mono text-micro uppercase tracking-[0.1em]` |
| Spacing | `space-y-5`, `p-4`, `gap-3` |
| Hover state | `hover:bg-surface2`, `hover:text-text` |
| Shadow | none |
| Accent usage | `border-lime` / `text-leaf` for selection |

**Pattern notes:** For You, Following, and Communities share one feed surface; tabs,
community chips, and live cards stay square. Video thumbnails alone use `bg-black`.

### Web public profile

File: `apps/web/src/screens/UserProfile.tsx`
Last updated: 2026-09-24

| Property | Class |
| --- | --- |
| Profile panel | `bg-surface1` |
| Border | `border border-border` |
| Border radius | none; avatar round |
| Primary text | `text-text` |
| Secondary text | `text-text-secondary`, `text-text-muted` |
| Stats/action type | `font-mono text-micro uppercase` |
| Spacing | `p-5`, `gap-4`, `space-y-5` |
| Hover state | inherited from post cards |
| Shadow | none |
| Accent usage | `bg-brand` for Follow |

**Pattern notes:** Public profiles reuse post cards directly and keep counts in a compact
metadata line instead of introducing a different card treatment.

### Mobile social post card

File: `apps/mobile/src/components/post-card.tsx`
Last updated: 2026-09-24

| Property | Value |
| --- | --- |
| Card background | `color.surface1` |
| Nested reference | `color.surface2` |
| Border | `borderWidth: 1`, `borderColor: color.border` |
| Border radius | none |
| Primary text | `color.text` |
| Supporting text | `color.textSecondary`, `color.textMuted` |
| Action/meta type | `eyebrow(10)` |
| Spacing | `padding: 14`, `gap: 10` |
| Press state | inherited `Pressable` semantics |
| Shadow | none |
| Accent usage | `color.lime` for links and active like |

**Pattern notes:** Native posts mirror the web card's square hierarchy. Video and image
media stay inside the card; link and referenced-post areas use the elevated surface.
Author identity uses the shared photo avatar with initials fallback.

### Mobile post composer

File: `apps/mobile/src/screens/CreatePost.tsx`
Last updated: 2026-09-24

| Property | Value |
| --- | --- |
| Screen background | `color.night` |
| Draft background | `color.surface1` |
| Secondary controls | `color.surface2` |
| Border | `borderWidth: 1`, `borderColor: color.border` |
| Border radius | none |
| Primary text | `color.text` |
| Supporting text | `color.textSecondary` |
| Labels/actions | `eyebrow(10–12)` |
| Spacing | `padding: 16`, `gap: 16` |
| Disabled state | opacity `0.5` |
| Shadow | none |
| Accent usage | `color.brand` for Publish, `color.lime` for selected embed |

**Pattern notes:** The native composer is a stack modal with a scrollable, keyboard-aware
form. Upload failures keep the text, selected media, and successful upload IDs.

### Mobile unified feed

File: `apps/mobile/src/screens/Home.tsx`
Last updated: 2026-09-24

| Property | Value |
| --- | --- |
| Screen background | `color.night` |
| Feed surfaces | `color.surface1`; selected tabs `color.surface2` |
| Borders | `borderWidth: 1`, `borderColor: color.border` |
| Border radius | none for feed controls and cards |
| Primary text | `color.text` |
| Supporting text | `color.textSecondary`, `color.textMuted` |
| Tab/action type | `eyebrow(10)` |
| Spacing | 16px screen gutter, 12–14px vertical gaps |
| Accent usage | `color.lime` for selection, `color.brand` for creation |

**Pattern notes:** One virtualized feed mixes posts, live rooms, and Moments. For You,
Following, and Communities use the same surface hierarchy; pull-to-refresh and a
visible load-more action handle freshness and pagination.
Stream and Moment creator photos use the shared circular avatar.

### Mobile post conversation

File: `apps/mobile/src/screens/PostDetail.tsx`
Last updated: 2026-09-24

| Property | Value |
| --- | --- |
| Screen background | `color.night` |
| Post/reply cards | shared `PostCard` on `color.surface1` |
| Navigation actions | `color.brand` reply; bordered secondary report |
| Border radius | none |
| Supporting text | `color.textSecondary`, `color.textMuted` |
| Action type | `eyebrow(11)` |
| Spacing | 16px gutter, 12px gaps |
| Shadow | none |
| Accent usage | `color.lime` for linked content |

**Pattern notes:** The thread reuses the same cards as the feed and refreshes on
focus so a newly published reply appears when returning from the composer.

### Mobile public profile

File: `apps/mobile/src/screens/PublicProfile.tsx`
Last updated: 2026-09-24

| Property | Value |
| --- | --- |
| Screen background | `color.night` |
| Profile panel | `color.surface1` |
| Border | `borderWidth: 1`, `borderColor: color.border` |
| Border radius | none; avatar round |
| Primary text | `color.text` |
| Supporting text | `color.textSecondary`, `color.textMuted` |
| Stats/action type | `eyebrow(10–11)` |
| Spacing | 16px panel/gutter, 12–14px gaps |
| Shadow | none |
| Accent usage | `color.brand` for Follow |

**Pattern notes:** Profile metadata mirrors the web panel; posts reuse the feed's
virtualized card and refresh when returning to the screen.
The real profile image now occupies the established circular avatar position.

### Mobile account and Moment identity

Files: `apps/mobile/src/screens/Profile.tsx`, `apps/mobile/src/screens/MomentDetail.tsx`,
`apps/mobile/src/screens/Live.tsx`
Last updated: 2026-09-24

| Property | Value |
| --- | --- |
| Identity image | shared circular `Avatar` using `avatarUrl` |
| Fallback | deterministic initials and name-derived swatch |
| Surrounding surfaces | existing `color.night` / `color.surface1` hierarchy |
| Border and radius | unchanged screen styles; avatar fully round |
| Text | existing `color.text`, `color.textSecondary`, `color.textMuted` |
| Spacing and shadow | unchanged; no new shadow |

**Pattern notes:** Identity photos are now consistent across account, creator, and
founding-curator areas without changing the surrounding screen layout.
