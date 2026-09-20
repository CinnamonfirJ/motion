# Moment
## Product Design Brief

**Platform:** Web, iOS, Android  
**Primary persona:** Scout  
**Secondary persona:** Creator  
**Tertiary persona:** Cold-open viewer

---

# 1. Design Objective

Moment should feel like a **live entertainment product first**, a **curation product second**, and a blockchain product almost never.

The interface must make one idea immediately understandable:

> **Spot the moment before everyone else.**

Users should experience a continuous loop:

**Watch → React → Spike → Moment → Recognition → Reward**

The product should not visually resemble:

- a crypto wallet
- a trading terminal
- a betting product
- a generic Web3 dashboard
- a dense livestreaming clone

Instead, it should feel like a modern social video application with a hidden economic layer.

---

# 2. Visual Direction

## Design personality

Moment should feel:

**Dark, electric, youthful, confident, live, polished, slightly playful.**

Not childish.

Not hyper-gamified.

Not finance-heavy.

The visual hierarchy should have two modes.

### Calm mode

Used during:

- browsing
- watching
- profiles
- earnings history
- settings

Inspired mostly by Talise:

- near-black backgrounds
- subtle elevated charcoal cards
- generous negative space
- crisp white type
- rounded geometry
- restrained accent color
- minimal chrome

Talise's current app uses black surfaces with soft charcoal cards and bright green as a controlled accent rather than flooding every screen with color.

### Pulse mode

Used when something meaningful happens:

- reactions accelerate
- a Moment is detected
- Founding Curator status is awarded
- settlement completes
- rewards arrive

Inspired by Clapmi and Vaya:

- brighter accents
- short gradients
- motion
- glowing graph activity
- celebratory visual feedback
- stronger typography

Clapmi uses energetic overlays directly on live video, while Vaya uses colorful reward imagery against a dark base.

The contrast between calm and pulse states makes a detected Moment feel genuinely special.

---

# 3. Core Design Principle

## The interface should become more alive as attention rises.

When nothing important is happening, Moment is quiet.

When reactions increase:

- reaction icons become slightly more active
- the pulse graph rises
- the reaction rail gains energy
- subtle accent lighting appears

When the threshold is crossed:

**Moment detected**

The UI briefly transforms.

This turns the spike detector into something users can feel, not merely something a backend calculates.

---

# 4. Information Architecture

## Primary navigation

### Mobile

Bottom navigation:

1. **Home**
2. **Moments**
3. **Earnings**
4. **Profile**

When inside a live stream, navigation disappears to prioritize video.

### Web

Left navigation rail:

- Logo
- Home
- Moments
- Earnings
- Profile

Bottom section:

- User avatar
- Settings

Desktop live-stream pages can expand the content area while leaving the rail collapsed.

---

# 5. Primary User Flows

# Flow A: Scout discovers and curates a Moment

**Open app**

↓

**Sign in**

↓

**Home**

↓

Choose live stream

↓

**Live Stream**

↓

React normally

↓

Reaction velocity increases

↓

**Moment detected**

↓

System enters confirmation state

↓

Moment confirmed

↓

Scout qualifies as Founding Curator

↓

**Founding Curator Celebration**

↓

Reward settles

↓

**Earnings updated**

↓

Moment appears in feed

This is the most important product flow and should receive the majority of design polish.

---

# Flow B: Cold-open viewer discovers a live stream

**Open app**

↓

**Home**

↓

Browse Moment feed

↓

Watch 35-second Moment

↓

See reaction spike

↓

See:

**LIVE NOW**

↓

Tap:

**Join live**

↓

Enter associated stream

The Moment Card acts as a trailer for the live stream.

---

# Flow C: Creator receives value from a Moment

**Creator streams**

↓

Audience reacts

↓

Moment detected

↓

Moment confirmed

↓

Clip generated

↓

Moment published

↓

Creator receives reward

↓

**Creator Earnings**

↓

See:

- Moment clip
- reward
- viewers generated
- timestamp
- settlement status

No complex creator dashboard is required for the MVP.

---

# Flow D: Returning Scout checks earnings

**Open Moment**

↓

**Earnings**

↓

See:

**Total earned**

↓

Recent Moment rewards

↓

Tap Moment

↓

View:

- clip
- curator position
- reward
- transaction status

Blockchain verification lives one level deeper.

---

# Flow E: Cross-device continuity

**React on mobile**

↓

Moment confirmed

↓

Open web later

↓

Same account

↓

Same Moment history

↓

Same Founding Curator rank

↓

Same earnings

There should never be a separate “mobile wallet” and “web wallet” concept in the interface.

---

# 6. Screen Inventory

## Authentication

1. Splash
2. Welcome / Sign in
3. Authentication loading
4. Authentication error

## Discovery

5. Home
6. All Moments
7. Moment Detail

## Live

8. Live Stream
9. Moment Detected state
10. Moment Confirming state
11. Founding Curator celebration
12. Moment confirmed state

## Earnings

13. Earnings Overview
14. Reward Detail
15. Creator Earnings mode

## Profile

16. Profile
17. Settings
18. Account / Wallet details

## System

19. Empty state
20. Offline state
21. Generic error state
22. Processing state

---

# 7. Screen Layouts

# 7.1 Splash

## Mobile

Full-screen near-black background.

Center:

**Moment logo**

Optional tiny animated pulse underneath.

Bottom:

**Spot it first.**

Duration:

500–900 ms maximum.

Do not show blockchain or sponsor branding here.

---

# 7.2 Welcome / Sign In

## Mobile layout

Top 15%:

Moment logo.

Middle:

Large headline:

**Spot the moment first.**

Supporting text:

**Watch live. Catch what matters. Earn when you're early.**

Below:

Primary button:

**Continue with Google**

Secondary:

**Continue with email**

Bottom:

Tiny legal text.

### Visual

Very dark canvas.

Behind the title, use a faint abstract reaction spike curve.

Do not use crypto imagery.

---

## Web layout

Two-column layout.

### Left

Product statement.

Large Moment logo.

Headline.

Short value proposition.

Optional looping preview of reaction activity.

### Right

Contained authentication card.

Maximum width:

420 px.

---

# 7.3 Home

Home must answer two questions immediately:

**What is worth watching?**

and

**What is happening right now?**

## Mobile structure

### Top bar

Left:

Moment logo.

Right:

Small earnings balance pill.

Example:

**$12.80 earned**

Then:

### Section A

**Live now**

Horizontal stream carousel.

2.2 cards visible to suggest scroll.

### Section B

**Moments happening now**

Vertical Moment feed.

No giant section separators.

---

## Desktop

Left navigation rail.

Main content column:

max width around 760 px.

Right secondary rail:

- live now
- recent earnings
- top reactions

Avoid turning this into a dashboard.

The Moment feed remains visually dominant.

---

# 7.4 Live Stream Card

Each card contains:

- thumbnail
- LIVE pill
- creator avatar
- creator name
- stream title
- viewer count
- subtle activity indicator

Optional:

**Heating up**

when current reaction velocity is above normal but below Moment threshold.

Do not expose numeric detector values.

---

# 7.5 Live Stream Screen

This is the hero product screen.

## Mobile

Video occupies approximately the upper 65–72% of screen depending on aspect ratio.

### Video overlays

Top left:

Back button.

Creator avatar + name.

Top right:

LIVE pill.

Viewer count.

### Bottom video region

Minimal real-time activity overlays.

Do not recreate a dense TikTok chat wall.

Below or overlapping lower edge:

Reaction rail.

Three large buttons:

🔥

😂

😮

Labels are unnecessary after onboarding.

Below:

Small live pulse indicator.

Example:

**Activity rising**

or no text during normal state.

---

# Desktop Live Layout

Three zones:

### Left

Collapsed navigation.

### Center

Large 16:9 live video.

Maximum width around 1100 px.

### Right panel

Width around 300–340 px.

Contains:

- creator info
- live activity
- recent reactions
- Moment state

Reaction controls remain directly beneath the video.

Do not place primary reactions in the sidebar.

---

# 7.6 Reaction Interaction

Reaction controls should feel physical without becoming noisy.

Tap:

1. button compresses to ~92%
2. icon springs upward
3. reaction briefly enters the video
4. button returns

Duration:

250–450 ms.

Repeated taps should never create screen-filling clutter.

Use a maximum visible reaction particle count.

---

# 7.7 Pre-Spike State

As reaction velocity begins rising:

The live activity graph gently increases.

Accent glow strengthens.

A small pill may appear:

**Heating up**

This is optional for MVP but useful for creating anticipation.

Never reveal:

“2.7× baseline”

to ordinary users.

That belongs in internal debugging tools.

---

# 7.8 Moment Detected

This is the signature interaction.

The goal is not confetti.

It should feel like the application itself noticed something.

## Animation

Graph spike rises.

Reaction controls briefly dim.

A thin luminous line sweeps across the video timeline.

Center overlay:

### MOMENT DETECTED

Below:

**People are reacting fast.**

Small animated pulse icon.

The overlay stays visible approximately:

1.5–2.5 seconds.

Then it collapses into a top status pill:

**Moment forming…**

---

# 7.9 Moment Confirming

Small floating card:

**Moment forming**

Animated three-point pulse.

Supporting text:

**Checking the crowd.**

Do not show technical terminology.

Do not mention:

- confirmation window
- blockchain
- threshold
- contracts

---

# 7.10 Founding Curator Celebration

This is the emotional payoff.

Full-screen modal sheet on mobile.

Centered:

Small animated circular pulse.

Large:

## You found it early.

Then:

### Founding Curator #2

Below:

**Your reaction helped surface this Moment.**

Reward card:

**+$0.84**

Status:

**Settling**

Buttons:

**Watch Moment**

Secondary:

**Done**

### Visual treatment

This is where the Vaya-inspired gradient is appropriate.

A soft orange → pink → electric violet bloom may appear behind the rank.

Do not turn the entire app gradient.

Reward moments earn the color.

---

# 7.11 Reward Settled

Do not show another full celebration.

Use a toast/banner:

**Reward received · +$0.84**

Optional small check animation.

---

# 7.12 Moment Feed Card

This is the second most important component after the live player.

## Mobile

Full-width card.

Aspect ratio:

approximately 4:5 or 9:12 depending on content source.

### Content

Video preview.

Top:

Creator avatar + name.

Top right:

**LIVE NOW**

when applicable.

Bottom overlay:

Moment title or context.

Below video:

Reaction graph.

Below graph:

Meta row:

**847 reactions**

**5 founding curators**

CTA:

**Join live →**

---

# 7.13 Reaction Graph

The reaction spike graph is central to the product identity.

It should not look like financial trading software.

Use:

- softly rounded line
- no visible axes by default
- no candlesticks
- minimal labels
- transparent fill under line
- one obvious peak marker

Example peak annotation:

**Moment**

Graph color begins muted.

Near spike:

gradient intensifies.

Reaction icons may appear subtly above the peak.

---

# 7.14 Moment Detail

## Mobile

Top:

Video.

Below:

Creator information.

Then:

### Why this became a Moment

Reaction graph.

Peak timestamp.

Reaction mix:

🔥 52%

😂 32%

😮 16%

Then:

### Founding Curators

Small overlapping avatars.

Example:

**5 people found it first**

Then:

Reward summary.

If stream still active:

Sticky bottom button:

**Join live**

---

## Desktop

Two columns.

Left:

Large clip.

Right:

Moment information.

Reaction graph spans full right panel width.

---

# 7.15 Moments Screen

Top:

**Moments**

Filter chips:

- For you
- Live now
- Recent

MVP can initially default to:

**Recent**

Use two-column cards on tablet/desktop.

Single-column on mobile.

Avoid masonry for MVP.

---

# 7.16 Earnings Overview

The screen should borrow Talise's financial clarity but not become a wallet.

Talise currently uses simple dark cards with large amounts and secondary supporting labels, which is a good structural reference.

## Mobile

Header:

**Earnings**

Large hero balance:

### $18.42

Label:

**Total earned**

Below:

Two small stat cards:

**7 Moments**

**5 first finds**

Then:

### Recent rewards

List.

Each row:

- Moment thumbnail
- creator
- curator position
- reward
- status

Example:

**Gaming chaos**

Founding Curator #2

**+$0.84**

---

# 7.17 Creator Earnings

Same information architecture as Scout earnings.

Switch contextual content instead of creating a completely separate visual system.

Hero:

**$24.60**

**Creator earnings**

Stats:

- Moments generated
- Moment views

Reward row:

Thumbnail.

Moment title.

**Creator share**

**+$4.20**

---

# 7.18 Reward Detail

Top:

Moment thumbnail.

Then:

### +$0.84

**Founding Curator #2**

Information:

- Moment
- creator
- date/time
- settlement status

Secondary technical area:

**Onchain receipt**

Collapsed by default.

Tap reveals:

- transaction status
- abbreviated transaction hash
- network: Monad
- explorer link

Crypto lives here, not on the Earnings homepage.

---

# 7.19 Profile

Top:

Avatar.

Display name.

@handle.

Stats:

- Moments found
- Creator Moments
- Total earned

Then settings rows:

- Account
- Notifications
- Appearance
- Help
- Sign out

Wallet details should be under:

**Account → Onchain account**

not presented as a main product feature.

---

# 8. Component Library

## Navigation

- Mobile Bottom Navigation
- Web Navigation Rail
- Top App Bar
- Back Button
- Tab Bar

## Video

- Live Player
- Moment Player
- Video Progress Bar
- LIVE Badge
- Viewer Count
- Mute Button
- Fullscreen Button

## Stream

- Stream Card
- Creator Chip
- Live Status
- Activity Status Pill
- Join Live CTA

## Reactions

- Reaction Button
- Reaction Rail
- Floating Reaction Particle
- Reaction Counter
- Reaction Mix
- Live Pulse Indicator

## Moments

- Moment Card
- Moment Detection Overlay
- Moment Status Pill
- Moment Graph
- Peak Marker
- Moment Metadata
- Founding Curator Stack
- Curator Rank Badge

## Rewards

- Earnings Balance
- Reward Card
- Reward Row
- Settlement Badge
- Reward Toast
- Founding Curator Celebration
- Creator Share Card

## Identity

- Avatar
- Avatar Stack
- Username
- Creator Badge

## Feedback

- Toast
- Bottom Sheet
- Modal
- Skeleton
- Progress Spinner
- Empty State
- Error Banner
- Offline Banner

## Form

- Text Field
- Email Field
- Primary Button
- Secondary Button
- Icon Button
- Switch
- Chip

---

# 9. Design Tokens

# 9.1 Core Palette

The visual system should be primarily dark.

## Background

**Night 950**

`#070708`

Primary application background.

---

## Surface 1

`#111113`

Navigation, basic cards.

---

## Surface 2

`#18181B`

Elevated cards, overlays.

---

## Surface 3

`#212126`

Selected or hover surfaces.

---

## Border

`#2A2A30`

Normal border.

---

## Strong Border

`#3B3B43`

Focused border.

---

# 9.2 Text

## Primary

`#F7F7F5`

Headlines and primary content.

## Secondary

`#B6B6BC`

Descriptions and metadata.

## Muted

`#77777F`

Low-priority labels.

## Disabled

`#525259`

---

# 9.3 Brand Accent

## Moment Lime

`#A7F46A`

Inspired by Talise's use of bright green against black surfaces.

Use for:

- primary CTAs
- positive progress
- live activity accents
- active navigation
- successful Moment detection

Do not use lime for every icon.

---

# 9.4 Live Accent

## Electric Blue

`#258BFF`

Inspired partly by Clapmi's live-action blue controls.

Use for:

- live links
- interactive video states
- information
- reaction graph secondary states

---

# 9.5 Celebration Gradient

Use only in high-emotion reward states.

### Start

`#FF7A21`

### Middle

`#FF3F91`

### End

`#695CFF`

This takes cues from Vaya's orange/pink/purple gradient language without making it the everyday interface.

---

# 9.6 Reaction Colors

## Fire

`#FF6A3D`

## Laugh

`#FFD84D`

## Wow

`#4DA3FF`

Reaction color should never be the only way a reaction type is communicated.

Icons remain distinct.

---

# 9.7 Semantic Colors

## Success

`#63D88C`

## Warning

`#F4C95D`

## Error

`#FF626B`

## Info

`#5A9FFF`

Semantic colors should not overlap unnecessarily with primary brand actions.

---

# 10. Typography

Use a clean contemporary grotesk.

Recommended:

**Inter**

or

**Geist**

Both work well across:

- React Native
- web
- dense metadata
- large display type

Avoid highly stylized display fonts in the product UI.

---

# Type Scale

## Display XL

48 / 52  
Weight 700

Web marketing or major reward states only.

---

## Display

40 / 44  
Weight 700

Large desktop page hero.

---

## H1

32 / 38  
Weight 700

Main screen heading.

---

## H2

24 / 30  
Weight 650–700

Section heading.

---

## H3

20 / 26  
Weight 600

Card title.

---

## Body Large

17 / 25  
Weight 400–500

Important descriptive content.

---

## Body

15 / 22  
Weight 400

Default product text.

---

## Body Small

13 / 18  
Weight 400–500

Metadata.

---

## Label

12 / 16  
Weight 600

Tabs and controls.

---

## Micro

11 / 14  
Weight 500

Timestamps and secondary information.

Never use less than 11 px equivalent for functional text.

---

# 11. Spacing System

Base unit:

**4 px**

Tokens:

- 4
- 8
- 12
- 16
- 20
- 24
- 32
- 40
- 48
- 64
- 80

Most screen padding:

### Mobile

16–20 px.

### Tablet

24 px.

### Desktop main content

32–40 px.

---

# 12. Border Radius

The references rely heavily on rounded containers, particularly Talise and Clapmi's mobile surfaces.

## XS

8 px

Chips.

## Small

12 px

Buttons.

## Medium

16 px

Cards.

## Large

20 px

Major cards.

## XL

24 px

Bottom sheets.

## Full

999 px

Pills and avatar circles.

Avoid overly bulbous 30–40 px cards everywhere.

---

# 13. Elevation

Dark interfaces need subtle surface separation.

Do not rely heavily on shadows.

Use:

1. background luminance
2. borders
3. slight blur
4. restrained shadow

### Modal shadow

`0 16px 48px rgba(0,0,0,0.45)`

### Card shadow

Mostly none.

Cards should separate through background value.

---

# 14. Iconography

Style:

- rounded line icons
- 1.75–2 px stroke
- simple silhouettes
- no complex Web3 iconography

Recommended base:

Lucide.

Custom icons needed for:

- Moment
- Founding Curator
- Reaction Pulse

The Moment icon could combine:

**spark / pulse / play**

without resembling a crypto token.

---

# 15. Motion Tokens

Motion matters because Moment is about something happening **now**.

## Quick

120 ms

Button states.

## Standard

220 ms

Navigation and component state changes.

## Expressive

380 ms

Reaction animation.

## Celebration

600–900 ms

Founding Curator animation.

Use spring movement sparingly.

---

# 16. Reaction Motion

Reaction tap:

Scale:

`1 → .92 → 1.05 → 1`

Particle:

moves upward 32–72 px.

Fade:

100% → 0%.

Rotation:

maximum ±8°.

No endless emoji fountain.

---

# 17. Moment Detection Motion

Detection sequence:

### 0 ms

Spike line brightens.

### 150 ms

Video edge receives subtle glow.

### 300 ms

Moment symbol expands from graph peak.

### 450 ms

**MOMENT DETECTED**

appears.

### 1500 ms

Overlay reduces.

### 2000 ms

Changes to:

**Moment forming…**

The entire sequence should complete in roughly two seconds.

---

# 18. Responsive Breakpoints

## Mobile

`< 768 px`

One column.

Bottom navigation.

Full-width cards.

---

## Tablet

`768–1199 px`

Two-column Moment grid where appropriate.

Larger live player.

---

## Desktop

`1200–1599 px`

Navigation rail + primary content + contextual rail.

---

## Wide Desktop

`1600 px+`

Do not endlessly stretch content.

Maximum content area approximately:

1440 px.

---

# 19. Loading States

Every major screen should have a deliberate loading experience.

## Home

Skeleton:

- three stream cards
- two Moment cards

Avoid full-page spinner.

---

## Live Stream

Black video placeholder.

Center:

small spinner.

Text:

**Joining live…**

---

## Moment Processing

Moment card remains visible.

Video area:

animated placeholder.

Label:

**Building your Moment…**

Do not say:

“FFmpeg processing.”

---

## Earnings

Balance skeleton.

Reward rows.

---

# 20. Empty States

## No live streams

Headline:

**Quiet right now.**

Body:

**Fresh Moments are still waiting below.**

CTA:

**Browse Moments**

---

## No Moments

Headline:

**Nothing has spiked yet.**

Body:

**When the crowd catches something, it’ll appear here.**

---

## No earnings

Headline:

**Your first find is still out there.**

Body:

**React when something feels worth catching.**

CTA:

**Find a live stream**

---

## Creator has no Moments

Headline:

**Your next stream could change that.**

Body:

**When your audience reacts together, Moment starts watching too.**

---

# 21. Error States

Errors should be plain-language and recoverable.

## Failed stream

**Stream slipped away.**

**Try joining again.**

Button:

**Retry**

---

## Clip failure

**We caught the Moment, but the clip needs another try.**

Button:

**Retry clip**

Reward state remains intact.

---

## Settlement pending

This is not an error.

Use:

**Reward settling**

Supporting:

**Your reward is safe. We’ll update this when it lands.**

---

## Settlement failure

**Reward delayed**

**We’re retrying the transfer automatically.**

Do not frighten the user with raw RPC errors.

---

## Authentication error

**Couldn’t sign you in.**

**Try again in a moment.**

---

# 22. Success States

Success should be proportional.

## Reaction

Tiny physical feedback only.

## Moment detected

Medium celebration.

## Founding Curator

Largest celebration.

## Settlement

Small positive toast.

## Login

No success screen.

Go directly to Home.

---

# 23. Offline State

Persistent top banner:

**You’re offline**

If watching buffered video:

**Reactions will send when you reconnect.**

Reaction controls may remain active only if the system can safely queue them within product rules.

If timing accuracy cannot be trusted, disable reaction submission and explain why.

---

# 24. Live State Language

Keep status copy human.

Use:

**Live**

**Heating up**

**Moment detected**

**Moment forming**

**Moment confirmed**

**Reward settling**

**Reward received**

Avoid:

**Threshold exceeded**

**Transaction pending**

**Batch committed**

**Spike index**

**Onchain event emitted**

Technical truth should exist without becoming product vocabulary.

---

# 25. Accessibility

Accessibility must be built into the component system rather than patched later.

## Contrast

Body text:

minimum WCAG AA 4.5:1.

Large text:

minimum 3:1.

Primary controls should meet AA contrast in:

- default
- hover
- pressed
- disabled
- focus states

Moment Lime should not be used with white text unless contrast is verified.

Use dark text on lime buttons if necessary.

---

# 26. Color Independence

Never communicate state through color alone.

Example:

Do not use merely:

green = settled  
yellow = pending

Use:

✓ **Settled**

○ **Pending**

! **Delayed**

Reaction types already have distinct icons in addition to color.

---

# 27. Touch Targets

Minimum:

**44 × 44 px**

Preferred reaction buttons:

**56–64 px**

This is especially important during video playback where users react quickly.

---

# 28. Focus States

Web keyboard focus:

2 px visible focus ring.

Recommended:

`Moment Lime`

with dark outer offset.

Focus ring must be visible on all dark surfaces.

---

# 29. Keyboard Navigation

Users must be able to:

- move through navigation
- enter a stream
- operate video controls
- activate reactions
- open Moment Cards
- access Earnings
- dismiss dialogs

Reaction shortcuts may optionally be:

1 = Fire  
2 = Laugh  
3 = Wow

Only after visible documentation.

---

# 30. Screen Readers

Reaction buttons should announce:

**React fire**

not just:

**Fire emoji**

Moment state change should announce through a polite live region:

**Moment detected. Reaction activity is rising.**

Founding Curator:

**You are Founding Curator number two.**

Do not announce every incoming reaction.

That would be unusable.

---

# 31. Reduced Motion

Respect:

`prefers-reduced-motion`

and OS accessibility settings.

Reduced motion alternatives:

Reaction particles → quick opacity feedback.

Moment detection → fade rather than zoom/sweep.

Celebration → static gradient halo.

No essential information may depend on animation.

---

# 32. Captions

Moment clips and streams should reserve room for:

- captions
- subtitles
- transcript support

Even if automatic captioning is not part of hackathon MVP, layouts should not block future support.

---

# 33. Video Accessibility

Controls require:

- play/pause
- mute
- volume where applicable
- fullscreen
- captions when available

Never hide essential controls solely behind hover.

---

# 34. Data Visualization Accessibility

Reaction graph must communicate the spike without color alone.

Use:

- line height
- peak marker
- Moment label
- optional accessible text summary

Screen reader summary:

**Reaction activity peaked 18 seconds into this Moment.**

---

# 35. Mobile Safe Areas

Respect:

- iPhone Dynamic Island
- display notches
- Android cutouts
- home indicators
- gesture navigation

Reaction controls must never sit under system gesture areas.

---

# 36. Design System Naming

Suggested component namespace:

`Moment / Navigation / BottomNav`

`Moment / Live / Player`

`Moment / Live / ReactionButton`

`Moment / Live / PulseGraph`

`Moment / Moment / Card`

`Moment / Moment / DetectedOverlay`

`Moment / Curator / RankBadge`

`Moment / Reward / Balance`

`Moment / Reward / TransactionRow`

`Moment / Feedback / Toast`

This keeps Figma and implementation naming aligned.

---

# 37. Figma Structure

## 00 Cover

Design brief and principles.

## 01 Foundations

- Colors
- Type
- Spacing
- Radius
- Motion
- Icons

## 02 Components

Navigation.

Buttons.

Cards.

Video controls.

Reactions.

Graphs.

Rewards.

Feedback.

## 03 Mobile

iOS/Android screen flows.

## 04 Web

Desktop and responsive states.

## 05 Prototype

Scout demo flow.

## 06 States

Loading.

Empty.

Errors.

Success.

Offline.

## 07 Handoff

Annotations.

Tokens.

Responsive rules.

Interaction specifications.

---

# 38. MVP Design Priority

## P0

Design first:

1. Home
2. Live Stream
3. Reaction interaction
4. Moment Detected
5. Moment Confirming
6. Founding Curator celebration
7. Moment Card
8. Moment Detail
9. Earnings
10. Sign In
11. Reward Detail
12. Cross-platform responsive variants

These screens create the complete product story.

---

## P1

After the core loop is polished:

- Profile
- Settings
- notifications
- richer creator statistics
- sharing flows
- more advanced filtering

---

# 39. UX Rule for Blockchain

The user should encounter blockchain terminology only when they deliberately inspect proof.

Normal flow:

**Reward received**

Technical detail:

**View onchain receipt**

Then:

**Monad**

**0x9A…41C**

**Confirmed**

This matches the broader invisible-infrastructure approach visible in Talise, where its product messaging explicitly focuses on removing seed phrases, gas, addresses, and other crypto friction from the primary experience.

---

# 40. UX Rule for Earnings

Avoid turning Moment into a financial casino.

Do not:

- flash dollar values constantly
- make every reaction show estimated earnings
- add green/red P&L graphics
- use trading vocabulary
- make users feel they are wagering money

The Scout reacts because something is interesting.

The reward proves that noticing early had value.

That order matters.

---

# 41. UX Rule for Founding Curators

The status is more important than the payout.

Visual hierarchy should be:

### You found it early.

### Founding Curator #2

Then:

**+$0.84**

Not:

### +$0.84!!!

and the curator status buried below.

The product's distinctive emotional reward is **being early**, not merely receiving money.

---

# 42. UX Rule for Moment Cards

Every Moment Card must answer three questions almost instantly:

### What happened?

The clip.

### Why is this a Moment?

The reaction spike.

### Can I join?

LIVE NOW button.

Everything else is secondary.

---

# 43. Visual Synthesis of the Three References

## Take from Talise

- dark minimal foundations
- bright accent used sparingly
- sophisticated rounded cards
- strong typography
- financial clarity
- invisible blockchain
- quiet confidence

## Take from Clapmi

- video-first UI
- live overlays
- active audience participation
- prominent reaction affordances
- dark live analytics
- blue energy
- real-time earning feedback

## Take from Vaya

- playful reward personality
- bright moments against dark surfaces
- approachable rather than financial reward framing
- saturated gradient reserved for emotionally positive states

## Do not copy

- logos
- mascots
- proprietary illustrations
- exact card compositions
- exact gradient forms
- exact screen layouts

Moment needs its own recognizable system.

---

# 44. The Resulting Moment Identity

The visual formula should be:

**Talise calm**

+

**Clapmi live energy**

+

**Vaya reward delight**

=

### Moment

Dark most of the time.

Electric when something matters.

The interface itself should behave the way a livestream behaves:

quiet,

quiet,

quiet,

then suddenly:

## MOMENT DETECTED.

And that contrast becomes the brand.