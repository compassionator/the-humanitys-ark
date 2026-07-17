# Browser Addon

## Role
Tool

## Goal
Build the first practical Dorr bridge: a browser extension that captures visible page or post content, applies local filtering reflexes, and optionally sends selected items to the council path.

## Why it matters
The Book of 14 defines this as the first Dorr interface proof: the Chrome Extension bridge that tracks and filters user content via local logic, n8n, and AI. The first next step is to build the extension MVP that scrapes the current tab’s text and sends it to the webhook as the Witness Proof.

## Status
Historical design lineage

## Implementation notice

[ARK Lens Job Search](../ARK_Lens/README.md) now implements local capture, scoring, reporting, Lens configuration, and repair workflows. The feed blur/reveal and optional Layer 2/n8n sections below remain future roadmap material. This file is preserved as the historical engineering specification.

## MVP boundary
- choose one site first
- choose one stable selector set
- local reflex first
- no forced n8n dependency in phase 1
- Layer 2 stays optional

## Layer 1 / Layer 2 Engineering Spec

# A. Rules & State

## A1. Rules cache
**Purpose:** keep local rules in memory for fast matching  
**Input:** stored mute lists  
**Output:** in-memory sets/lists  
**Notes:** hashtags/accounts as `Set`, keywords/phrases as array

## A2. Initialize rules
**Purpose:** load rules before any feed processing  
**Input:** `browser.storage.local`  
**Output:** populated cache  
**Notes:** must finish before first scan

## A3. Live rule sync
**Purpose:** update cache when popup/settings change rules  
**Input:** storage change event  
**Output:** refreshed local cache  
**Notes:** no page reload needed

# B. Feed Detection

## B1. Initial scan
**Purpose:** process posts already on screen  
**Input:** current DOM  
**Output:** checked posts enter State A or C  
**Notes:** run once after A2

## B2. Feed observer
**Purpose:** detect lazy-loaded posts  
**Input:** DOM mutations  
**Output:** queued post elements  
**Notes:** use `MutationObserver`

## B3. Queue / debounce
**Purpose:** avoid thrashing on rapid DOM updates  
**Input:** batch of new nodes  
**Output:** stable processing loop  
**Notes:** tiny delay is fine

## B4. Route refresh
**Purpose:** handle SPA navigation changes  
**Input:** URL/feed changes  
**Output:** rescan and observer reconnect  
**Notes:** important on X/LinkedIn style apps

# C. Extraction

## C1. Duplicate guard
**Purpose:** avoid reprocessing same post  
**Input:** post element  
**Output:** skip/process decision  
**Notes:** dataset flag, WeakSet, or stable post id

## C2. Extract body text
**Purpose:** get visible post content  
**Input:** post element  
**Output:** normalized text  
**Notes:** avoid whole-card `innerText` if possible

## C3. Extract author
**Purpose:** get `@handle` or account id  
**Input:** post element  
**Output:** account string

## C4. Extract hashtags
**Purpose:** get visible hashtags  
**Input:** post element  
**Output:** array of tags

## C5. Extract local similar candidates
**Purpose:** build “Mute similar” options locally  
**Input:** visible post text/metadata  
**Output:** candidate hashtags, handles, simple keywords  
**Notes:** no n8n in MVP

## C6. Get content container
**Purpose:** know what exact DOM block to blur/unblur  
**Input:** post element  
**Output:** content node  
**Notes:** site-specific

## C7. Get injection anchor
**Purpose:** know where to insert overlay/buttons  
**Input:** post element  
**Output:** anchor node  
**Notes:** site-specific

# D. Matching

## D1. Match account
**Purpose:** fastest local block  
**Input:** author handle  
**Output:** matched rule or null

## D2. Match hashtag
**Purpose:** tag-based local block  
**Input:** hashtag list  
**Output:** matched rule or null

## D3. Match keyword/phrase
**Purpose:** catch common local noise terms  
**Input:** normalized text  
**Output:** matched rule or null  
**Notes:** slowest, do last

## D4. Resolve final match
**Purpose:** choose one rule to display  
**Input:** results from D1–D3  
**Output:** single matched rule or null

# E. UI States

## E1. State A — Blurred
**Purpose:** intercept matched post  
**Input:** matched rule  
**Output UI:**
- `Blurred by: [rule]`
- `Show anyway`

## E2. State B — Revealed
**Purpose:** let user inspect and react  
**Input:** revealed post  
**Output UI:**
- `Good catch`
- `Wrong blur`
- `🔍 Analyze`
- `Mute similar`

## E3. State C — Native visible
**Purpose:** allow Layer 2 and local learning even when Layer 1 misses  
**Input:** unmatched post  
**Output UI:**
- `🔍 Analyze`
- `Mute similar`

## E4. State D — Analyze result
**Purpose:** show Layer 2 verdict  
**Input:** n8n response  
**Output UI:**
- summary
- suggested tags/accounts
- `Save to local mute`

# F. Actions

## F1. Blur post
**Purpose:** apply State A  
**Input:** content container + rule  
**Output:** blurred/collapsed card  
**Notes:** disable internal clicks while blurred

## F2. Reveal post
**Purpose:** undo blur for one item  
**Input:** post element  
**Output:** visible card + State B controls

## F3. Good catch
**Purpose:** explicit positive signal  
**Input:** user click  
**Output:** local feedback log only  
**Notes:** no heavy learning in MVP

## F4. Wrong blur
**Purpose:** explicit negative signal  
**Input:** user click  
**Output:** local feedback log only  
**Notes:** neutral by default unless user clicks

## F5. Mute similar
**Purpose:** locally add related filters  
**Input:** visible post  
**Output:** saved local rules  
**Notes:** uses C5 only

## F6. Hide fully
**Purpose:** optional later stronger reflex  
**Input:** user click or future rule  
**Output:** removed/collapsed post  
**Notes:** not needed in first MVP

# G. Analyze / Layer 2

## G1. Analyze trigger
**Purpose:** send selected post to council  
**Input:** user click on State B or C  
**Output:** loading state on that item only

## G2. Build payload
**Purpose:** prepare request  
**Input:** text, author, hashtags, url  
**Output:** JSON payload

## G3. Send to n8n
**Purpose:** request analysis/fact-check  
**Input:** payload  
**Output:** verdict JSON  
**Notes:** async, no page-blocking spinner

## G4. Parse verdict
**Purpose:** normalize council response  
**Input:** n8n JSON  
**Output:** summary + suggested tags/accounts

## G5. Render result
**Purpose:** show State D  
**Input:** parsed verdict  
**Output:** visible verdict UI

## G6. Save suggested mute rules
**Purpose:** feed Layer 2 learning back into Layer 1  
**Input:** suggested tags/accounts  
**Output:** updated local mute list  
**Notes:** affects future posts only

# H. Safety / Reliability

## H1. Duplicate UI guard
**Purpose:** prevent double overlays/buttons  
**Input:** post element  
**Output:** inject once only

## H2. Safe text injection
**Purpose:** avoid unsafe HTML interpolation  
**Input:** matched rule / verdict text  
**Output:** safe rendered text  
**Notes:** use text nodes or escaping

## H3. Fail-soft extraction
**Purpose:** don’t break feed on bad selectors  
**Input:** missing nodes  
**Output:** skip gracefully

## H4. Analyze timeout/error
**Purpose:** avoid stuck loading state  
**Input:** failed n8n request  
**Output:** reset or small error message

## H5. Neutral default
**Purpose:** avoid accidental learning from passive scrolling  
**Input:** no user action  
**Output:** no score change, no rule change

## MVP Build Order

### Phase 1 — Pure local reflex
- A1
- A2
- B1
- B2
- C1–C7
- D1–D4
- E1
- E2
- E3
- F1
- F2
- F5
- H1
- H2
- H3
- H5

### Phase 2 — Local refinement
- A3
- B3
- B4
- F3
- F4
- H4

### Phase 3 — Layer 2 bridge
- G1
- G2
- G3
- G4
- G5
- G6

## Smallest possible first coding slice

1. A2 initialize rules  
2. B1 initial scan  
3. B2 observer  
4. C2/C3/C4 extract text/author/tags  
5. D1/D2/D3 local match  
6. E1 + F1 blur + Show anyway  
7. F2 + E2 reveal + post-reveal buttons  
8. E3 + F5 native post buttons + local mute similar
