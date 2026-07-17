# Mesh Comms

## Role
Tool / Research

## Goal
Build decentralized communication during blackout conditions while preserving a second research track for long-wave / Tesla-style earth-friendly communication and, later, possible power transmission without dirty chemical dependence.

## Why it matters
When normal infrastructure fails, people still need ways to signal distress, coordinate safely, and preserve connection. This project also protects the longer-range research path into alternative communication and energy ideas that may reduce dependency on harmful centralized systems.

## Structure
This folder contains two separate but related tracks:

### Track A — Bitchat / Mesh Comms Upgrade
A practical blackout-ready communication path based on improving Bitchat Android.

### Track B — Tesla Power / Long-Wave Research
A longer-horizon research path exploring tower-based communication first, and later earth-friendly power transfer concepts.

## Current next step
Identify the exact Bitchat Android upstream repository, target revision or fork, and the backlog that owns the intended upgrades. Do not infer or invent those dependencies.

After those references are identified, fork or mirror the agreed path and lock the first practical upgrades:
- Persian localization
- SOS / Need / Health Check alerts
- visible Secret Map entry
- rapid alert flow
- local passcode + panic action

In parallel, begin a clean research notebook for Tesla-style tower communication concepts, starting with communication before power.

## Status
Draft — blocked only on identifying the exact Bitchat upstream and backlog

## Implementation boundary

No Mesh Comms implementation exists in this repository. The requirements below preserve intended work, but implementation must not begin against an assumed Bitchat source or an unverified backlog.

## Track A — Bitchat / Mesh Comms Upgrade

### Immediate scope
The preserved intended upgrades are:

1. **Persian (fa) localization + RTL**
   - full Persian locale
   - no English fallback
   - validated RTL layout for chat and settings

2. **Alert message types**
   - `ALERT_SOS`
   - `ALERT_NEED`
   - `ALERT_HC`
   - payload should include:
     - type
     - text
     - timestamp
     - coordinates (required or optional by user setting)

3. **Secret Map entry + rapid alert flow**
   - visible labeled Secret Map entry on home screen
   - first-run guidance for creating or joining
   - 2-tap alert composition from within chat
   - manual-first latitude / longitude input
   - no background GPS fetch in MVP

4. **Show on Map**
   - external map intent
   - provider-neutral handoff to installed map apps

5. **Local passcode lock + panic action**
   - 4–6 digit PIN
   - lock on exit
   - persistent across restart
   - panic action = send SOS + wipe local data
   - hold-to-confirm to avoid accidental wipe

6. **Emergency signaling (parked phase)**
   - audio-coded alert ideas
   - large-icon trigger UI later

### Bitchat next steps
- capture current app screenshots and flows
- draw rough wireframes for Secret Map, alert composer, and passcode / panic
- finalize ticket details and edge cases
- create GitHub issues
- prepare onboarding video assets
- publish contributor outreach for Persian i18n and Android UI/UX

## Track B — Tesla Power / Long-Wave Research

### Purpose
Preserve and investigate the second path:
- communication via tower / telluric / long-wave concepts first
- later, possible power transmission in a way that aims to avoid polluting chemical transformations

### Research boundary
This track is not yet an MVP product.
It is a structured research direction.

### First research questions
- what communication-only prototype could be studied without pretending full power transfer is solved
- which historical Tesla tower claims belong to physics, which belong to myth, and which remain testable
- what earth-friendly communication methods deserve literature review before any build claims
- what safety, regulatory, and environmental boundaries must be respected from the start

### Suggested next step
Create a first research brief covering:
- communication-first scope
- known historical references
- open technical questions
- reasons for separating communication research from later power claims

## Working distinction
- **Mesh Comms** = practical near-term blackout communication tool
- **Tesla Track** = long-horizon research into alternative communication and later power concepts

Do not confuse:
- immediate survival communication MVPs
with
- unresolved long-range physics research

## Links
- ../../HIGH_LEVEL_QA.md
- ../../PROJECTS_SONG_SEED_TOOL.md
