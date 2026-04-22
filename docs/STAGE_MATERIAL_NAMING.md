# Stage Material Naming

Use these material or mesh names in the GLB so the web viewer can auto-assign stage-friendly materials.

## LED

- `LED_MASTER_MAT`
  - Solid LED wall.
- `LED_TRANSPARENT_MAT`
  - Transparent / mesh LED.
- `LED_GRID_*`
  - Transparent / mesh LED variants such as `LED_GRID_STAR`.

## Stage Floor

Recommended names:

- `MAT_STAGE_FLOOR_BLACK`
- `MAT_FLOOR_BLACK`
- `MAT_STAGE_DECK`
- `MAT_RUNWAY`
- `MAT_CATWALK`
- `MAT_STAGE_STEP`

Result:

- Very dark near-black base
- High roughness
- Minimal metalness
- Suited for black carpet, matte stage paint, rubberized floor

## LED Covers / Fascia / Format

Recommended names:

- `MAT_FORMAT_BLACK`
- `MAT_FASCIA_BLACK`
- `MAT_MASK_BLACK`
- `MAT_CLADDING_BLACK`
- `MAT_COVER_BLACK`
- `MAT_SHROUD_BLACK`

Result:

- Dark matte plastic / format look
- Low reflectivity
- Suited for LED trim, covers, fascia, black PVC/foamboard

## Truss / Pipe / Rigging

Recommended names:

- `MAT_TRUSS_ALUMINUM`
- `MAT_TRUSS_ALU`
- `MAT_ALUMINUM_PIPE`
- `MAT_RIGGING_ALU`

Result:

- Brighter metal
- Lower roughness
- High metalness
- Suited for polished or used aluminum truss

## Weathered Steel / Rusted Truss

Recommended names:

- `MAT_TRUSS_RUST`
- `MAT_RUST_TRUSS`
- `MAT_TRUSS_STEEL`
- `MAT_TRUSS_IRON`

Result:

- Darker weathered metal
- Higher roughness
- Lower metalness than clean aluminum
- Suited for aged steel / iron structures

## Frame / Structural Black Metal

Recommended names:

- `MAT_FRAME_BLACK`
- `MAT_SUPPORT_BLACK`
- `MAT_BRACKET_BLACK`
- `MAT_BEAM_BLACK`
- `MAT_RAIL_BLACK`

Result:

- Dark coated metal
- Mid roughness
- Medium-high metalness

## Notes

- Matching works on both material name and mesh name.
- If a mesh has one of the LED names above, LED logic wins over generic stage material presets.
- If a material is not recognized, the viewer falls back to a neutral PBR preset instead of forcing everything into shiny metal.
