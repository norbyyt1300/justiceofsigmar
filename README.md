# Aqshy War Room — 2026–27 Geometry Rebuild

This version rebuilds the battlefield geometry from the user-provided **GHB 2026-27 Aqshy Reference Cards v1(2).pdf**.

## Source of truth

- Battle-plan diagrams / deployment layouts / fixed map object placement: the supplied PDF reference cards.
- The PDF artwork is **not rendered in the application**.
- `data/battleplans.json` is the editable source-of-truth for the map geometry and plan data.

## Editing battle plans

Open `data/battleplans.json` in any text editor. It contains no JavaScript and is intended to be edited directly.

For each map you can change:
- `territories.attacker`
- `territories.defender`
- `objectives[]` — id, x, y, icon, token/control dimensions
- `terrain[]` — Place of Power, obscuring terrain, area terrain/obstacle, coordinates and planning footprint

Coordinates are inches from the top-left corner of a 60 x 44 inch board.

Map objects are authored on a 0.5 inch lattice. Objectives are normalized to the section grid / half-section points visible in the reference cards.

## Unit placement

Unit bases are **free placement**. They do not snap to the 1 inch grid.

## Measurement circles

Use the Range / measurement circles panel to add a transparent circle by diameter or radius. Measurement circles are freely draggable and can be selected and deleted.

## Run

Serve the folder over HTTP so `battleplans.json` can be fetched:

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000/`.

## Scale

The renderer uses one inch as one drawing unit on both axes. The board is always 60 x 44 drawing units, so circles remain circular and base dimensions remain proportional.

## Sons of Behemat base updates and movement trails

`data/bases.json` is the plain JSON copy of the searchable base index; `data/bases.js` exposes the same entries to the browser. The new Sons of Behemat entries are Boss-stompers (90mm), Rock-hurlers (90mm), Ma Maegran (90mm), and Ancient Ghyrochs (105 x 70mm oval for each model).

Enable **Movement arrow trails** in Map layers before dragging a unit to record its path. Trails are semi-transparent, army-coloured arrows and persist in saved plan JSON. Disable the mode to move units without recording new trails; use **Clear movement trails** to erase all existing trails. Trails render beneath unit bases and can be saved/loaded with a plan.


## Unit rotation, labels, and renaming
- Select an oval base and drag its yellow rotation handle to rotate it. The `R` key still rotates the selected unit by 15 degrees. Circular bases do not show a rotation handle because their orientation is not visually meaningful.
- Unit labels show initials from the unit's displayed name; multiple units with the same displayed name in one army receive numbered labels (for example `L1`, `L2`).
- Use **Rename selected unit** to give an individual base a custom name. Hover over a base to see its full displayed name in a tooltip. Renames and rotations are included in undo/redo and plan snapshots.
