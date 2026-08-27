# Aqshy War Room — General's Handbook 2026–27

A dependency-free browser planner for Warhammer Age of Sigmar 4th edition battleplans.

## Run locally

```bash
python3 -m http.server 8000
```

Open `http://localhost:8000/`.

Or access the current version of this project online here: https://norbyyt1300.github.io/justiceofsigmar/

## Source of battleplan geometry

The battleplan geometry in `data/battleplans.json` was rebuilt from the supplied General's Handbook 2026–27 PDF, especially the Battleplan Maps section and the individual battleplan map pages. The app does **not** use the PDF artwork as a background image.

The Handbook states that the battleplan maps show player territories and the locations of terrain and objectives, that the objective icon marks the centre of the corresponding objective, and that the terrain icons distinguish area terrain/obstacles, obscuring terrain, and Places of Power in medium/small sizes. It also specifies a 40mm objective marker with a control zone extending 3 inches from the objective, and recommends a 44 x 60 inch battlefield with 8 terrain features.

## Data model

`data/battleplans.json` is the editable source of truth for battleplan geometry and plan metadata.

Each map contains:

- `territories.attacker[]` / `territories.defender[]`: rectangles in battlefield inches
- `objectives[]`: objective type plus exact centre coordinates
- `terrain[]`: terrain type, size, anchor coordinates, planning footprint, and rotation
- `layoutNotes`: human-readable notes

Fixed battlefield features use a **0.5-inch coordinate lattice**. Unit bases are deliberately **not snapped** and can be positioned anywhere while remaining within the 60 x 44 inch battlefield.

## Measurement circles

The Tools panel lets you enter a circle **diameter in inches** and add it to the board. Measurement circles are nearly transparent, freely draggable, selectable, and deletable with Delete/Backspace or the Delete Selected button. They are included in saved planner files and undo/redo history.

## Future seasons

To update the app for another season, copy `data/battleplans.json`, update its `source`, `schemaVersion`, `plans`, and `maps`, and keep the renderer/application code unchanged where possible.
