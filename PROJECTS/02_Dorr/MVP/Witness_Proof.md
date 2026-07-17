# Witness Proof

## Role
Tool

## Goal
Prove that the first Dorr bridge can witness live content, route it safely, and return a visible result without breaking the page.

## Why it matters
The Book of 14 makes this the concrete proof condition for the extension MVP: scrape current tab text and send it to the n8n webhook as the first witness path.

## Status
Prototype

## Implementation notice

The current implementation is documented in [ARK Lens](../ARK_Lens/README.md), with automated coverage defined by the [ARK Lens test plan](../ARK_Lens/tests/TEST_PLAN.md). The original Analyze/n8n proof below has not yet been implemented and must not be represented as passed.

## Success condition
A single supported site can complete this path:

1. page/post text is captured
2. author and hashtags are extracted when available
3. Layer 1 local rule matching can blur or reveal correctly
4. user can click Analyze
5. payload is sent to n8n
6. verdict returns without freezing the page
7. result is rendered on that item only

## Minimum payload
- page URL
- extracted text
- author handle if found
- hashtags if found
- timestamp

## Minimum visible return
- short summary
- suggested tags or accounts
- option to save suggested mute rules locally

## Pass / fail checklist

### Pass
- one site works end-to-end
- no duplicate overlays
- no broken scrolling
- no unsafe HTML injection
- no forced dependence on Layer 2 for basic blur/reveal

### Fail
- page breaks
- repeated injection on same post
- loading hangs permanently
- rules mutate without explicit user action
- extension depends on n8n just to do local reflex

## Notes
Browser Addon is the implementation file.  
Witness Proof is the acceptance file.
