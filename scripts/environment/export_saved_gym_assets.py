#!/usr/bin/env python3
"""Export artists' edits from the saved Blender source, without regenerating it.

blender -b scripts/environment/source/courtiq-gym-equipment.blend \
  --python scripts/environment/export_saved_gym_assets.py
"""
from pathlib import Path
import sys

import bpy

sys.path.insert(0, str(Path(__file__).resolve().parent))
from build_gym_assets import export_collection, write_manifest, EXPORTS

for prefix, filename in [('01 —', 'courtiq-hoop.glb'),
                         ('02 —', 'courtiq-bench.glb'),
                         ('03 —', 'courtiq-wall-pad.glb')]:
    coll = next(c for c in bpy.data.collections if c.name.startswith(prefix))
    export_collection(coll, filename)
write_manifest()
print('Exported edited source with original runtime coordinates:', EXPORTS)
