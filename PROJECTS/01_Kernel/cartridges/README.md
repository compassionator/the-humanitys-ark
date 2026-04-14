# cartridges

This folder is the Fuel Depot for strict mode.

The Kernel does not invent knowledge.
It routes and cites what is stored here.

This folder may contain:
- active cartridge batches
- supporting source text files
- `_templates/` for cartridge creation
- future cartridge expansions

Each operational cartridge should contain:
- `MANIFEST.jsonl`
- `CHUNKS.jsonl`

Current purpose:
- store citeable reference chunks
- preserve source-to-chunk traceability
- support strict routing, citation, refusal, and testing

Rule:
If a claim is not grounded in a cartridge here, strict mode should not treat it as supported.

Build order:
Start with one clean batch, verify structure and citations, then scale to more nodes.