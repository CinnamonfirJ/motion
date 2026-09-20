# Product Requirements Document

## Working title

**Moment**  
Final product name TBD.

## Product category

Social / Attention / Creator Economy

## Hackathon

Monad Metropolis, Track 3: Social, Attention & Culture

## Platforms

Moment launches simultaneously as:

- Responsive web application
- iOS application
- Android application

All three clients use the same accounts, embedded wallet identities, backend, live-stream state, reaction system, Moment feed, and earnings ledger.

## Target submission

13 October 2026

## PRD status

Hackathon MVP

---

# 1. Product Summary

Moment turns real-time audience reactions into a new form of **paid curation**.

Viewers watch live streams and react normally. When reactions suddenly spike around a particular part of a stream, Moment identifies that section as potentially interesting.

The system captures:

- 15 seconds before the spike
- 20 seconds after the spike

This produces a **35-second Moment**.

The earliest viewers whose reactions helped surface the Moment become its **Founding Curators**.

If the Moment receives enough independent reactions to cross its confirmation threshold:

1. the Moment is confirmed;
2. the clip becomes a Moment Card;
3. the creator receives a reward;
4. the Founding Curators receive a share of the reward;
5. settlement is executed on Monad.

The result is a system where audiences are not merely consuming content or reacting to it.

They are helping discover valuable content early and can be rewarded for being right early.

---

# 2. Product Thesis

Existing livestream platforms treat reactions as disposable engagement.

Moment treats reactions as **curation signals**.

The central product hypothesis is:

> If viewers can receive recognition and rewards for spotting great livestream moments before the wider audience, they will become active scouts rather than passive viewers.

This creates a loop:

**Watch → Notice → React → Surface → Confirm → Reward → Discover**

One primitive, the reaction, powers three sides of the product:

- scouts identify interesting moments;
- creators receive short-form discovery content;
- cold viewers use those moments to decide which live streams deserve their attention.

The blockchain is not the product.

It provides verifiable attribution and settlement behind the product.

---

# 3. Problem

Livestreams generate large amounts of potentially valuable content, but most of that content disappears inside hours-long broadcasts.

Three problems result.

## 3.1 For viewers

A viewer opening a livestream platform has little information about whether a stream is currently worth joining.

Thumbnails and titles say what the stream is about, but not whether something interesting is actually happening.

## 3.2 For small creators

A creator may have one exceptional 30-second moment inside a three-hour stream.

Unless the creator or a fan manually clips it, that moment disappears.

Small creators therefore lose a potential discovery surface.

## 3.3 For highly engaged fans

Fans frequently notice great moments before algorithms, editors, or the wider audience.

Their reactions help establish that something is interesting, but they receive neither attribution nor economic participation in the value they helped identify.

---

# 4. Product Opportunity

Moment creates a marketplace around **attention discovery** rather than attention ownership.

The important behavior is not:

> "I liked this."

It is:

> "I noticed this before most people did."

Traditional engagement rewards popularity after it exists.

Moment rewards users who contribute to identifying popularity while it is forming.

---

# 5. Target Users

## 5.1 Primary Persona: The Scout

A viewer who spends time watching livestreams and reacts naturally while watching.

### Motivation

The Scout enjoys:

- discovering interesting creators;
- finding funny, shocking, impressive, or memorable moments;
- being early;
- participating in live communities;
- receiving recognition for good taste;
- potentially earning from their ability to notice good content.

### Current frustration

The Scout already creates value through attention and reactions but captures none of it.

### Desired outcome

> "I found that moment before everyone else, and the app proves it."

The entire hackathon demo should primarily be experienced through this persona.

---

# 5.2 Secondary Persona: Small Creator

A creator streaming to a relatively small audience.

### Motivation

The creator wants:

- discovery;
- more viewers;
- useful clips without manual editing;
- proof that an audience is reacting;
- rewards from moments their content generates.

### Desired outcome

> "My best moments become distribution automatically."

For the MVP, creators need enough functionality to:

- create or enter a stream;
- generate Moments;
- view Moments;
- see earnings.

A full creator studio is unnecessary.

---

# 5.3 Tertiary Persona: Cold-Open Viewer

A person opening Moment without already knowing which creator they want to watch.

### Motivation

They want to answer one question quickly:

> "What's worth watching right now?"

Moment Cards provide this answer without requiring a separate discovery system.

A viewer watches a short Moment and can immediately enter the associated live stream.

---

# 6. Primary Product Goal

Demonstrate one complete and understandable loop:

> **Scout reacts → reaction activity spikes → Moment detected → 35-second clip generated → Moment confirmed → creator and Founding Curators rewarded on Monad.**

A judge should understand this loop within approximately 30 seconds of seeing the demo.

The same core experience must work across:

- web;
- iOS;
- Android.

---

# 7. MVP Principles

## 7.1 One protagonist

Demo primarily through the Scout's perspective.

Do not alternate repeatedly between creator, curator, administrator and viewer dashboards.

## 7.2 One magical moment

The strongest part of the demo should be:

**Moment detected**

followed by:

**You were one of the first people to spot it.**

The reward is the consequence of that event.

## 7.3 Invisible crypto

The product should feel like a consumer social application.

Users should not need to understand:

- gas;
- seed phrases;
- RPCs;
- block confirmations;
- smart contracts.

Blockchain complexity belongs underneath the interface.

## 7.4 Cross-platform from day one

Moment is not a web prototype with mobile postponed.

Web, iOS and Android are all first-class launch clients.

They must share the same:

- identity;
- wallet;
- streams;
- reactions;
- Moments;
- rewards;
- earnings.

## 7.5 One real onchain loop beats ten simulated features

The reward settlement shown during the demo must be a real Monad transaction.

Fake-live video and seeded engagement may be used to make the demo reliable, but the core settlement flow must be real.

---

# 8. Platform Strategy

Moment launches on three surfaces simultaneously.

## 8.1 Web

The web app should support:

- responsive desktop layout;
- responsive mobile browser layout;
- Scout flow;
- creator flow;
- Moment feed;
- live stream playback;
- reactions;
- earnings.

## 8.2 iOS

The iOS app should support the same core MVP functionality as web:

- authentication;
- live stream browsing;
- live playback;
- reactions;
- Moment detection;
- Moment viewing;
- Founding Curator status;
- earnings.

## 8.3 Android

The Android app should support the same core MVP functionality as iOS.

## 8.4 Shared product state

A user who reacts on one platform must see the resulting state everywhere else.

Example:

A Scout reacts on Android.

The Moment is detected.

The Scout later opens web.

Their Founding Curator status and reward must already appear there.

---

# 9. Cross-Platform Architecture Principle

The product should avoid implementing business logic separately on each client.

Clients are responsible primarily for:

- rendering;
- playback;
- reaction input;
- notifications;
- presenting state.

The backend owns:

- authoritative stream time;
- reactions;
- spike calculation;
- Moment state;
- Founding Curator selection;
- reward eligibility;
- settlement requests;
- earnings records.

The blockchain owns:

- settlement;
- payout integrity;
- settlement events.

This reduces platform drift and makes simultaneous launch feasible.

---

# 10. Core User Journey

## Scout Journey

### Step 1: Sign in

The Scout signs in using a familiar method such as:

- email;
- Google;
- social login.

An embedded wallet is created behind the scenes.

The same account must resolve to the same wallet across web, iOS and Android.

No wallet extension is required.

No wallet creation flow should interrupt onboarding.

No gas prompt should appear during normal use.

### Step 2: Open Home

The user sees approximately 2–3 currently active streams.

Each stream card shows:

- creator;
- title;
- current viewers;
- live state.

For the hackathon, prerecorded video may behave as a synchronized live stream.

### Step 3: Enter a stream

The Scout begins watching.

Three simple reactions are available.

For example:

- Fire
- Laugh
- Wow

Reaction events are timestamped against the shared stream timeline.

### Step 4: Reactions begin accelerating

The system compares recent reaction activity against that stream's existing baseline.

### Step 5: Spike detected

When activity significantly exceeds baseline:

**Moment detected**

appears.

The system records the detection timestamp `T`.

### Step 6: Capture the Moment

The video pipeline creates a clip covering:

`T - 15 seconds → T + 20 seconds`

Total:

**35 seconds**

### Step 7: Confirmation window

Reaction activity continues during the candidate Moment.

If the candidate passes the confirmation threshold, it becomes a confirmed Moment.

### Step 8: Identify Founding Curators

The first qualifying unique Scouts who reacted before confirmation become Founding Curators.

### Step 9: Settle reward

A transaction is executed on Monad.

The pool is divided between:

- the creator;
- Founding Curators.

### Step 10: Publish Moment Card

The Moment appears in the feed across web, iOS and Android.

The card contains:

- 35-second clip;
- creator;
- stream title;
- reaction timeline;
- spike visualization;
- reaction totals;
- number of Founding Curators;
- live indicator if original stream is still active;
- CTA to join stream.

### Step 11: Scout receives confirmation

Example:

**You found this early.**

**Founding Curator #2**

Reward information appears beneath it.

### Step 12: Earnings

The Scout can open Earnings on any platform and see:

- Moments curated;
- rewards earned;
- pending rewards;
- settled rewards.

---

# 11. Moment State Machine

Each Moment moves through the following deterministic states.

### 1. Normal

Stream is active.

Reactions are collected.

### 2. Candidate

Reaction velocity crosses the spike-detection threshold.

`spikeTimestamp` is recorded.

### 3. Detecting

The UI displays:

**Moment detected**

The server continues observing reactions during the confirmation window.

### 4. Confirmed

The candidate crosses the independent-user confirmation threshold.

Founding Curators are finalized.

### 5. Clipping

The rolling buffer produces:

`spikeTimestamp - 15s`

through

`spikeTimestamp + 20s`.

### 6. Settling

Reward settlement transaction is submitted to Monad.

### 7. Published

Moment Card becomes available on all three platforms.

### 8. Settled

Monad transaction confirms and earnings update.

Publishing does not need to wait for blockchain confirmation.

The UI can show:

**Reward settling...**

---

# 12. Reaction System

Reactions are the fundamental product primitive.

Each reaction requires:

- user ID;
- embedded wallet address;
- stream ID;
- stream timestamp;
- server timestamp;
- reaction type;
- event ID;
- source platform.

Source platform may be:

- web;
- iOS;
- Android.

Optional fields:

- batch ID;
- transaction/hash reference;
- client version.

For MVP, use approximately three reaction types.

---

# 13. Spike Detection

AI is unnecessary for the MVP.

Moment detection should be deterministic and easy to debug.

## Proposed approach

Maintain:

### Recent reaction rate

Reaction activity during approximately the previous 10 seconds.

### Baseline reaction rate

An exponentially weighted or rolling average of activity during approximately the previous 60 seconds.

Compare:

`Recent Rate / Baseline Rate`

A candidate spike may be triggered when:

1. recent reaction velocity exceeds a configurable multiple of baseline;
2. minimum absolute reaction activity exists;
3. reactions come from a minimum number of unique viewers.

Example configuration:

- recent window: 10 seconds;
- baseline: 60 seconds;
- spike multiplier: 3×;
- minimum reactions: configurable;
- minimum unique Scouts: configurable.

---

# 14. Why Relative Spike Detection Matters

A raw threshold disadvantages small creators.

Twenty reactions might be insignificant for a giant streamer and extraordinary for someone with seven viewers.

Moment should therefore measure unusual attention relative to the stream's own normal activity.

This makes the system useful for discovering emerging creators rather than merely rediscovering already-popular creators.

---

# 15. Cold-Start Detection

New streams may not have enough history to establish a baseline.

For the MVP:

- apply a minimum baseline floor;
- require a minimum number of unique Scouts;
- use seeded defaults during the stream's first minute.

---

# 16. Moment Confirmation

Detection and confirmation remain separate.

## Candidate

A spike indicates:

> "Something may be happening."

## Confirmed Moment

Independent continued reactions indicate:

> "Multiple viewers agree that something happened."

A candidate is confirmed if it crosses configurable thresholds before the confirmation window ends.

Potential requirements:

- minimum total reactions;
- minimum unique reacting Scouts;
- minimum sustained spike score.

---

# 17. Founding Curators

A Founding Curator is a unique authenticated Scout whose qualifying reaction occurred sufficiently early in a confirmed Moment.

Founding Curator status must be:

- deterministic;
- limited;
- attributable;
- immutable after confirmation;
- synchronized across platforms.

Example:

> First 5 unique qualifying Scouts before the Moment confirmation timestamp.

One account/address can occupy at most one founding slot per Moment.

---

# 18. Reward Model

The MVP is proving the settlement mechanism, not final token economics.

## Reward source

Use a pre-funded test reward pool contract on Monad.

Each confirmed Moment has a configured reward amount.

## Proposed demo split

Example:

- **Creator pool:** 70%
- **Curator pool:** 30%

These are configurable demo values.

## Founding Curator distribution

### Option A: Equal split

Divide the curator pool equally.

### Option B: Early-rank weighting

Example:

- #1 → 5 points
- #2 → 4 points
- #3 → 3 points
- #4 → 2 points
- #5 → 1 point

For the hackathon, equal splitting is acceptable if implementation time becomes tight.

---

# 19. Monad Requirements

The economically meaningful actions must be verifiable on Monad.

## Reaction provenance

Reaction activity must be represented onchain either:

- individually; or
- through periodic batches.

## Moment settlement

The reward transaction must be real.

It must show:

- Moment identifier;
- creator;
- Founding Curators;
- reward amount;
- distribution;
- transaction status.

## Settlement event

The smart contract emits an event the application can index and display.

---

# 20. Recommended MVP Chain Architecture

A single focused contract should support the demo.

## `MomentRewards`

### `commitReactionBatch()`

Stores or emits:

- stream ID;
- batch ID;
- reaction count;
- time range;
- commitment/Merkle root.

### `settleMoment()`

Receives:

- Moment ID;
- creator;
- Founding Curators;
- reward amount;
- distribution information.

Transfers rewards.

### Events

`ReactionBatchCommitted`

`MomentSettled`

Settlement must be idempotent.

The same Moment ID cannot be rewarded twice.

---

# 21. Why Batch Reactions

Writing every reaction as a separate transaction is unnecessary.

The important proof is that:

- reactions happened;
- they belonged to a time range;
- they contributed to Moment creation;
- settlement happened transparently.

Batching reduces:

- transaction spam;
- latency;
- complexity;
- unnecessary chain interactions.

Live UI should update immediately from application state.

---

# 22. Authentication and Wallet UX

Use one embedded wallet provider across all three platforms.

The user experience should be:

**Sign in → watch**

not:

**Sign in → create wallet → switch network → approve → sign → watch**

Requirements:

- no seed phrase;
- no browser extension;
- no network switching;
- no gas balance requirement;
- no transaction confirmation modal for reactions;
- wallet created automatically;
- wallet persists across future logins;
- wallet identity remains consistent across web, iOS and Android.

---

# 23. MVP Screens

All major screens should exist on:

- web;
- iOS;
- Android.

Layout can adapt by device, but feature availability should remain consistent.

## 23.1 Authentication

Elements:

- product name/logo;
- one-sentence value proposition;
- authentication;
- continue button.

Do not explain blockchain here.

---

## 23.2 Home

Purpose:

> "What's worth watching?"

Contains:

- 2–3 live stream cards;
- Moment feed;
- live status;
- creator information.

Primary actions:

- watch Moment;
- join live stream.

---

## 23.3 Live Stream

Contains:

- video player;
- creator identity;
- live state;
- viewer count;
- reactions;
- lightweight reaction activity feedback.

Primary action:

**React.**

---

## 23.4 Moment Detected State

Temporary overlay or banner.

Example:

**Moment detected**

Secondary copy:

**Reactions are spiking.**

---

## 23.5 Founding Curator Confirmation

If the user qualifies:

**You found this early.**

**Founding Curator #2**

Then:

**Reward settling...**

followed by:

**Reward received**

---

## 23.6 Moment Card

Contains:

- clip;
- creator;
- Moment timestamp;
- reaction graph;
- reaction distribution;
- Founding Curator count;
- reward status;
- live CTA.

---

## 23.7 Earnings

### Scout

- total earned;
- Moments curated;
- latest rewards;
- settlement status.

### Creator

- total Moment earnings;
- number of Moments;
- individual Moment payouts.

---

## 23.8 Profile / Account

Minimal MVP profile containing:

- display name;
- avatar;
- wallet identity;
- role context;
- logout.

No full social profile system required.

---

# 24. MVP Features

## P0: Required for launch and submission

### Cross-Platform Clients

- responsive web application;
- iOS application;
- Android application;
- shared backend;
- shared user identity;
- shared wallet;
- shared live state;
- shared Moment state;
- shared earnings.

### Authentication

- email/social sign-in;
- embedded Monad wallet;
- persistent cross-platform identity.

### Home

- 2–3 streams;
- responsive layouts;
- Moment feed;
- entry into streams.

### Simulated Live Video

- prerecorded content synchronized to behave as live;
- server-authoritative stream timeline.

### Rolling Video Buffer

- access to at least 15 seconds before spike;
- continue recording at least 20 seconds after.

### Reactions

- three reaction types;
- timestamped reactions;
- unique user attribution;
- immediate client feedback;
- cross-platform propagation.

### Reaction Batch Recording

- batch reaction evidence;
- commit batch to Monad.

### Spike Detection

- stream-relative reaction baseline;
- configurable threshold;
- minimum unique-reactor requirement.

### Moment Detection

- immediate Moment detected state;
- timestamp saved.

### Clip Generation

- 35-second clip;
- 15 seconds before;
- 20 seconds after.

### Moment Confirmation

- confirmation window;
- unique Scout threshold;
- deterministic Founding Curators.

### Moment Card

- clip;
- reaction graph;
- creator;
- Founding Curators;
- live CTA.

### Reward Contract

- funded reward pool;
- creator distribution;
- curator distribution;
- duplicate settlement protection.

### Real Monad Settlement

- real transaction;
- visible status;
- transaction identifier/explorer access.

### Earnings

- creator earnings;
- Scout earnings;
- Moment-level transaction status;
- same totals on every client.

---

# 25. P1: Build After Core Loop Works

## Push Notifications

Mobile users receive notifications for:

- Founding Curator confirmation;
- reward settlement;
- creator Moment creation.

Web may use browser notifications where supported.

---

## Deep Linking

A Moment URL should open:

- the relevant screen on web;
- the iOS app when installed;
- the Android app when installed.

---

## Reaction-Type Interpretation

Rule-based labels such as:

- Funny Moment
- Wild Moment
- Hype Moment

No AI required.

---

## Better Moment Feed

- ranking;
- recency;
- trending state;
- creator filters.

---

## Shareable Moment URLs

Moment Cards should be shareable outside Moment.

---

## Improved Curator Rewards

Potential weighting based on:

- reaction timing;
- curator rank;
- later Moment performance.

---

# 26. P2 / Post-Hackathon

## Creator Keys

## Bonding Curves

## Curator Reputation

## Clap Battles

## Opening Calls

## Backstage Rooms

## Advanced Moment Economics

## Full Production Livestream Ingestion

## OBS Integration

## External Streaming Platform Integration

## AI-Based Semantic Moment Classification

## Advanced Creator Analytics

## Production-Grade Anti-Sybil Infrastructure

---

# 27. User Stories

## Scout

### US-S1

As a Scout, I want to sign in on any supported device without understanding wallets so I can immediately start watching.

### US-S2

As a Scout, I want the same account and earnings to follow me between web, iOS and Android.

### US-S3

As a Scout, I want to react during streams so I can express what I am feeling without leaving the video.

### US-S4

As a Scout, I want the system to recognize when I reacted early so I receive credit for discovering a Moment.

### US-S5

As a Scout, I want to see my Founding Curator position so being early feels meaningful.

### US-S6

As a Scout, I want to see the reward I earned so I understand that my curation had value.

### US-S7

As a Scout, I want to see my previous curated Moments across all my devices.

---

# Creator User Stories

### US-C1

As a creator, I want my best live moments captured automatically so I do not need to manually review hours of footage.

### US-C2

As a creator, I want confirmed Moments to become discovery content so new viewers can find my stream.

### US-C3

As a creator, I want to see when a Moment earns a reward.

### US-C4

As a creator, I want viewers to enter my live stream from Moment Cards.

### US-C5

As a creator, I want my earnings and Moments to remain consistent whether I use web or mobile.

---

# Cold Viewer User Stories

### US-V1

As a new viewer, I want to see recent interesting Moments so I can quickly decide what to watch.

### US-V2

As a new viewer, I want to know whether the original stream is still live.

### US-V3

As a new viewer, I want shared Moment links to open naturally on whichever device I am using.

---

# 28. Functional Acceptance Criteria

## Cross-platform account

Pass when:

- user signs in on web;
- user signs into the same account on mobile;
- both resolve to the same application user and wallet;
- earnings match;
- Moment history matches.

---

## Authentication

Pass when:

- wallet is silently provisioned;
- user reaches Home without wallet modal;
- identity persists across sessions and devices.

---

## Reaction

Pass when:

- reaction appears instantly;
- event includes user and stream timestamp;
- other connected clients receive updated reaction activity;
- one user cannot create multiple Founding Curator identities.

---

## Spike Detection

Pass when:

- concentrated reactions trigger detection;
- normal background activity does not;
- low-viewer streams still work;
- detection behaves consistently regardless of reaction source platform.

---

## Clip Creation

Pass when:

- final clip duration is approximately 35 seconds;
- correct pre-roll and post-roll are included;
- audio remains synchronized;
- playback works on web, iOS and Android.

---

## Founding Curator Attribution

Pass when:

- qualifying users are ordered deterministically;
- curator list is frozen after confirmation;
- same state appears on all platforms.

---

## Settlement

Pass when:

- one confirmed Moment generates one settlement;
- creator receives configured share;
- qualifying Scouts receive configured shares;
- duplicate settlement fails safely;
- transaction can be inspected on Monad;
- earnings update across all clients.

---

# 29. Success Metrics

## North-Star Demo Metric

At least one Moment successfully completes:

**reaction → detection → clip → confirmation → settlement**

on Monad.

Target:

**100% success during final demo.**

---

# 30. Product Comprehension Metric

Ask testers:

> "What does this product let viewers do?"

Target:

**≥70% unaided comprehension**

with an answer resembling:

> "People who notice good livestream moments early can get credit or rewards."

---

# 31. External Validation

Before submission:

- 20–30 testers;
- several sessions;
- mix of web and mobile users where possible;
- at least one naturally occurring unscripted spike;
- multiple Scouts participating simultaneously.

---

# 32. Reliability Metrics

### Reaction delivery success

Target:

**≥99% application-level event capture**

### Moment detection

All seeded spike scenarios correctly detected.

### Clip generation

Target:

**≥95%**

### Settlement

Target:

**≥95% first-attempt or automatic-retry success**

### Duplicate payout

Target:

**0**

### Cross-platform state mismatch

Target:

**0 known blocking synchronization issues during demo.**

---

# 33. UX Metrics

Track:

- stream opens;
- reactions per viewer;
- reactions by platform;
- unique reactors;
- Moment detections;
- confirmed Moments;
- Moment Card views;
- Moment → Live click-through;
- first curator reward;
- creator rewards;
- settlement failures;
- cross-device logins.

---

# 34. Demo Success Criteria

A successful demo should show:

1. user signs in;
2. wallet is provisioned invisibly;
3. user opens a stream;
4. user reacts;
5. other viewers react;
6. reaction spike forms;
7. **Moment detected** appears;
8. Founding Curator attribution happens;
9. 35-second Moment is generated;
10. reaction graph explains the spike;
11. Monad settlement executes;
12. Scout earnings update;
13. creator earnings update;
14. state can be seen on another client;
15. transaction can be verified.

---

# 35. Edge Cases

## Reaction spam

Repeated tapping must not create multiple unique curator identities.

## Sybil accounts

Use basic authenticated-account protections for MVP.

## Very small streams

Require minimum unique reactors and absolute reaction activity.

## Stream just started

Use baseline floor and cold-start defaults.

## Two spikes close together

Use cooldown and merge overlapping Moments.

## Spike within first 15 seconds

Clip begins at stream start.

## Spike near stream end

Clip ends when stream ends.

## Clip generation fails

Retry clipping without repeating settlement.

## Settlement fails

Mark reward pending and retry idempotently.

## RPC unavailable

Queue blockchain work while normal application state continues.

## User disconnects before confirmation

Their valid earlier reaction remains eligible.

## User switches devices mid-stream

Reaction identity remains tied to the same user and wallet.

## User reacts from multiple devices simultaneously

All devices map to the same user.

The user may generate multiple reaction events, but only one Founding Curator identity.

## Client clock drift

Use server-authoritative stream timestamps.

## Duplicate reaction batches

Reject duplicate batch IDs.

## Duplicate Moment settlement

Reject at contract level.

## Reward rounding

Use deterministic remainder handling.

## Fake-live drift between platforms

All clients derive playback position from shared server time.

## Mobile app backgrounding

When returning to foreground, the app must resynchronize the stream timeline before allowing reaction input.

## Poor mobile connectivity

Reaction events should retry safely where appropriate without creating duplicate events.

---

# 36. Abuse Considerations

Potential abuse includes:

- reaction farming;
- coordinated spike manipulation;
- fake accounts;
- multiple devices;
- payout farming.

MVP mitigations:

- authenticated users;
- unique Scout threshold;
- rate limits;
- reaction cooldowns;
- one curator slot per account;
- minimum activity;
- fixed Moment rewards;
- deterministic server-side qualification.

---

# 37. Content Safety

For hackathon MVP:

- use team-owned, licensed or consented video;
- avoid building full moderation infrastructure.

Future production version requires:

- creator controls;
- reporting;
- content removal;
- copyright workflows;
- moderation.

---

# 38. Technical Constraints

## Required

- Monad integration;
- real settlement;
- responsive web application;
- functional iOS application;
- functional Android application;
- shared authentication;
- shared embedded wallet;
- shared backend;
- synchronized stream timestamps;
- working video clipping;
- consistent Moment state across platforms.

## Preferred

- one shared mobile codebase where practical;
- maximum shared business logic;
- one auth/wallet provider;
- one primary backend;
- one focused smart contract;
- configurable thresholds;
- configurable reward parameters.

## Avoid

- separate business logic per platform;
- platform-specific reward calculations;
- multiple chains;
- complex tokenomics;
- custom video infrastructure beyond requirements;
- unnecessary AI;
- multiple wallet providers.

---

# 39. Primary Technical Risk

## Video pipeline

The hardest problem remains reliably capturing content before a spike occurs.

The platform requires a rolling video buffer.

This must work independently of whether the Scout is using:

- web;
- iOS;
- Android.

The clipping system belongs on shared infrastructure rather than inside an individual client.

---

# 40. Secondary Technical Risk

## Synchronization

The following must agree on time:

- web playback;
- mobile playback;
- reactions;
- spike detector;
- clipper.

There must be one authoritative stream timeline.

---

# 41. Third Technical Risk

## Cross-platform delivery

A simultaneous launch creates a risk of building the same feature three times.

The solution is to keep product intelligence server-side.

Platform clients should remain thin wherever possible.

A shared mobile framework is strongly preferred for iOS and Android.

---

# 42. Fourth Technical Risk

## Settlement reliability

Settlement must remain:

- deterministic;
- retryable;
- idempotent;
- inspectable.

The contract should remain simple.

---

# 43. Out of Scope for MVP

Explicitly do not build:

- Creator Keys;
- bonding curves;
- tradable creator assets;
- advanced token economics;
- reputation scoring;
- curator leaderboards;
- Opening Calls;
- Backstage rooms;
- decentralized video hosting;
- full creator studio;
- OBS integration;
- Twitch ingestion;
- YouTube Live ingestion;
- TikTok Live ingestion;
- Kick ingestion;
- AI clip understanding;
- AI content classification;
- AI moderation;
- production anti-Sybil infrastructure;
- fiat withdrawals;
- fiat on-ramp;
- cross-chain support;
- creator subscription systems;
- direct messaging;
- comments;
- full follow graph;
- long-term recommendation engine;
- production-scale analytics infrastructure.

**Web, iOS and Android applications are explicitly in scope for the MVP and launch.**

---

# 44. Stretch Feature

## Clap Battles

Clap Battles may be added only after the core Moment loop works reliably on all supported platforms.

Battles reuse:

- streams;
- reactions;
- real-time counts;
- wallet identities;
- rewards.

If the core cross-platform Moment experience slips, Clap Battles are cut.

---

# 45. Recommended Build Order

## Phase 1: Shared Foundation

Build:

- backend;
- database;
- authentication;
- embedded wallet;
- stream entity;
- user identity;
- Moment entity;
- shared APIs/realtime transport.

Success:

One account works across web and mobile clients.

---

## Phase 2: Prove Stream Clock

Build:

- fake-live video;
- server-authoritative stream time;
- timestamped reactions;
- rolling buffer.

Success:

Given timestamp `T`, backend can reproduce video surrounding `T`.

---

## Phase 3: Prove Moment Creation

Build:

- reaction aggregation;
- baseline;
- spike detector;
- clipping;
- Moment persistence.

Success:

Seeded spike reliably creates correct clip.

---

## Phase 4: Prove Attribution

Build:

- authenticated Scouts;
- unique identities;
- Founding Curator ranking.

Success:

System reliably identifies who was early regardless of platform.

---

## Phase 5: Prove Settlement

Build:

- reward contract;
- Monad integration;
- settlement event;
- indexing;
- earnings.

Success:

One Moment pays one creator and qualifying Scouts exactly once.

---

## Phase 6: Build Web Experience

Complete:

- authentication;
- Home;
- live stream;
- Moment state;
- Moment feed;
- earnings.

---

## Phase 7: Build Mobile Experience

Using the shared mobile codebase, complete:

- iOS;
- Android;
- authentication;
- Home;
- live stream;
- reactions;
- Moment state;
- Moment feed;
- earnings;
- deep links where possible.

---

## Phase 8: Cross-Platform QA

Test:

- same account across devices;
- stream synchronization;
- reactions from mixed devices;
- Moment publication;
- reward updates;
- background/foreground recovery;
- reconnect behavior.

---

## Phase 9: Pilot

Run sessions with participants using a mix of:

- browser;
- iPhone;
- Android.

Observe:

- natural reaction behavior;
- spike formation;
- cross-platform consistency;
- Founding Curator comprehension;
- Moment feed usefulness.

---

# 46. Recommended Demo Script

## Scene 1

Scout signs in on mobile.

No crypto interface appears.

---

## Scene 2

Scout opens a small creator's live stream.

Other users participate from a mixture of web and mobile.

---

## Scene 3

Something interesting happens.

Scout reacts.

Others react.

The graph rises.

---

## Scene 4

Banner:

**Moment detected**

Scout sees:

**You found this early.**

**Founding Curator #2**

---

## Scene 5

Moment Card appears.

Judge sees:

- clip;
- reaction spike;
- Founding Curators;
- creator;
- live CTA.

---

## Scene 6

Reward settlement executes.

Scout and creator earnings increase.

---

## Scene 7

Open the same Scout account on web.

Show:

- same Moment;
- same curator status;
- same earnings.

This proves the product is a real cross-platform system rather than three isolated demos.

---

## Scene 8

Show the Monad transaction briefly.

Then return to Moment.

---

# 47. One-Sentence Pitch

> Moment rewards the fans who discover a livestream's best moments before everyone else does.

---

# 48. Shorter Pitch

> Get paid for spotting the moment first.

---

# 49. Product Moat Hypothesis

The strongest long-term asset is the graph of:

**who consistently notices valuable attention early.**

Over time, Moment could identify:

- strong curators;
- niche tastemakers;
- emerging creators;
- attention before it becomes obvious.

This should remain post-MVP.

---

# 50. Product Decision Rule

Before adding any feature, ask:

> Does this make the Scout → Moment → Reward loop clearer, more reliable, or more accessible across our three launch platforms?

If yes, consider it.

If no, move it to roadmap.

Examples:

Creator Keys fail.

Bonding curves fail.

A synchronized reaction system passes.

Reliable mobile playback passes.

Cross-platform account consistency passes.

Faster clipping passes.

Reliable Monad settlement passes.

---

# 51. MVP Definition of Done

Moment is ready for submission and launch when a fresh user can:

1. download the iOS app, download the Android app, or open the web app;
2. sign in without seeing crypto complexity;
3. receive the same identity and wallet across platforms;
4. open a live stream;
5. react normally;
6. contribute to a genuine reaction spike;
7. see Moment detection happen;
8. become a Founding Curator when eligible;
9. watch the generated 35-second Moment;
10. understand the reaction graph;
11. receive an onchain reward;
12. see the reward in Earnings;
13. access the same earnings and Moment history from another supported platform;
14. verify settlement;
15. join another live stream from the Moment feed.

Anything beyond this is optional.

---

# 52. Final MVP Scope

The launch product consists of six connected layers:

**Web + iOS + Android**

↓

**Live**

Watch streams from any supported device.

↓

**React**

Audience creates timestamped attention signals.

↓

**Detect**

Relative reaction acceleration identifies noteworthy sections.

↓

**Moment**

35-second clips transform ephemeral live activity into discovery media.

↓

**Reward**

Creators and the earliest qualifying curators share the value generated by confirmed Moments.

The client can change.

The identity, stream, Moment and reward do not.

That cross-platform loop is the product.