#!/usr/bin/env python3
"""Author and export CourtIQ's original, metre-scale gym equipment in Blender.

Run: blender --background --factory-startup --python scripts/environment/build_gym_assets.py -- --render
No third-party models, images, add-ons or texture decoders are required.
Editable source objects are retained; export copies have applied bevels and are
joined by material. The rim coordinate is a visual contract, not a physics source.
"""
from __future__ import annotations

import argparse
import json
import math
from pathlib import Path
import struct
import sys

import bpy
from mathutils import Vector

REPO = Path(__file__).resolve().parents[2]
PUBLIC = REPO / 'apps/web/public/environment'
SOURCE = REPO / 'scripts/environment/source'
RIM_HEIGHT = 3.048
RIM_Z = 1.575
BOARD_Z = 1.18
BOARD_BOTTOM = 2.8956  # 9 ft 6 in; rim is 6 in above the board's lower edge.
BOARD_CENTER = BOARD_BOTTOM + 1.0668 / 2
RIM_INNER_RADIUS = .2286
RIM_TUBE_RADIUS = .0119
EXPORTS = {}


def linear_channel(v):
    return v / 12.92 if v <= .04045 else ((v + .055) / 1.055) ** 2.4


def color(hex_color):
    return tuple(linear_channel(int(hex_color[i:i + 2], 16) / 255) for i in (1, 3, 5)) + (1,)


def make_material(name, hex_color, roughness, metal=0, alpha=1):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get('Principled BSDF')
    rgba = color(hex_color)
    bsdf.inputs['Base Color'].default_value = rgba
    bsdf.inputs['Roughness'].default_value = roughness
    bsdf.inputs['Metallic'].default_value = metal
    bsdf.inputs['Alpha'].default_value = alpha
    mat.diffuse_color = (*rgba[:3], alpha)
    # All surfaces are closed geometry. Front-face rendering avoids double-sided
    # transparent glass's extra draw pass and halves back-face fragment work.
    mat.use_backface_culling = True
    if alpha < 1:
        # Alpha blend avoids the render-target cost of transmission on coach hardware.
        mat.surface_render_method = 'DITHERED'
        mat.use_transparency_overlap = False
    return mat


def coords(x, y, z):
    """Runtime Y-up coordinates to Blender Z-up; glTF export reverses this."""
    return (x, -z, y)


def collection(name):
    result = bpy.data.collections.new(name)
    bpy.context.scene.collection.children.link(result)
    return result


def move_into(obj, coll):
    for parent in list(obj.users_collection):
        parent.objects.unlink(obj)
    coll.objects.link(obj)


def finish(obj, name, mat, coll, smooth=False):
    obj.name = name
    obj.data.materials.clear()
    obj.data.materials.append(mat)
    move_into(obj, coll)
    for polygon in obj.data.polygons:
        polygon.use_smooth = smooth
    return obj


def box(name, dimensions, at, mat, coll, bevel=0.008, segments=2):
    bpy.ops.mesh.primitive_cube_add(size=1, location=coords(*at))
    obj = bpy.context.object
    obj.dimensions = (dimensions[0], dimensions[2], dimensions[1])
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    finish(obj, name, mat, coll)
    if bevel:
        modifier = obj.modifiers.new('Manufactured edge radius', 'BEVEL')
        modifier.width = bevel
        modifier.segments = segments
        modifier.affect = 'EDGES'
        modifier.limit_method = 'ANGLE'
        modifier.harden_normals = True
        weighted = obj.modifiers.new('Weighted face normals', 'WEIGHTED_NORMAL')
        weighted.keep_sharp = True
        weighted.weight = 40
    return obj


def rod(name, a, b, radius, mat, coll, vertices=8):
    start, end = Vector(coords(*a)), Vector(coords(*b))
    delta = end - start
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=delta.length, location=(start + end) / 2)
    obj = bpy.context.object
    obj.rotation_euler = delta.to_track_quat('Z', 'Y').to_euler()
    return finish(obj, name, mat, coll, True)


def rectangular_strut(name, a, b, width, depth, mat, coll):
    start, end = Vector(coords(*a)), Vector(coords(*b))
    delta = end - start
    obj = box(name, (width, delta.length, depth), (0, 0, 0), mat, coll, .012, 2)
    # box's long dimension is Blender Z, aligned between the endpoints.
    obj.location = (start + end) / 2
    obj.rotation_euler = delta.to_track_quat('Z', 'Y').to_euler()
    return obj


def ring(name, at, major, minor, mat, coll, major_segments=64, minor_segments=8):
    bpy.ops.mesh.primitive_torus_add(major_segments=major_segments, minor_segments=minor_segments,
                                   location=coords(*at), major_radius=major, minor_radius=minor)
    return finish(bpy.context.object, name, mat, coll, True)


def bolt(name, at, mat, coll, axis='z', radius=.017):
    # Six-sided bolt heads are visible manufactured fittings, not tessellated spheres.
    bpy.ops.mesh.primitive_cylinder_add(vertices=6, radius=radius, depth=.012, location=coords(*at))
    obj = bpy.context.object
    if axis == 'z':
        obj.rotation_euler.x = math.pi / 2
    elif axis == 'x':
        obj.rotation_euler.y = math.pi / 2
    return finish(obj, name, mat, coll)


def make_hoop(mats):
    coll = collection('01 — Regulation basket · editable components')
    steel, navy, ivory, orange, glass = (mats[k] for k in ('steel', 'navy', 'ivory', 'orange', 'glass'))
    # Broad ballast chassis behind the baseline and tapered upholstered column.
    box('Ballast chassis · powder coated steel', (1.24, .25, 1.42), (0, .165, -1.08), steel, coll, .04, 3)
    box('Ballast upper upholstered shell', (1.16, .22, 1.35), (0, .37, -1.08), navy, coll, .052, 3)
    for x in (-.50, .50):
        for z in (-1.63, -.55):
            box('Rubber leveling shoe', (.17, .07, .18), (x, .045, z), navy, coll, .015)
    box('Rigid mast', (.23, 3.02, .24), (0, 1.95, -.86), steel, coll, .016)
    box('Front player safety pad', (.69, 1.73, .30), (0, 1.20, -.65), navy, coll, .055, 3)
    # Sewing lines use shallow physical relief in the same material, no texture budget.
    for x in (-.275, .275):
        rod('Upholstery piping', (x, .41, -.489), (x, 1.99, -.489), .006, navy, coll, 6)
    for y in (.41, 1.99):
        rod('Upholstery piping', (-.275, y, -.489), (.275, y, -.489), .006, navy, coll, 6)
    box('Pad crest · ivory inlay', (.12, .13, .009), (0, 1.79, -.493), ivory, coll, .012)
    # Parallel bent box-section spars and cross braces behind the backboard.
    for x in (-.115, .115):
        rectangular_strut('Rising support spar', (x, 2.98, -.86), (x, 3.79, .31), .09, .115, steel, coll)
        rectangular_strut('Level backboard spar', (x, 3.79, .31), (x, 3.72, 1.08), .09, .115, steel, coll)
        rectangular_strut('Triangulated brace', (x, 2.83, -.86), (x, 3.65, .70), .035, .045, steel, coll)
    box('Board structural yoke', (.72, .10, .095), (0, 3.70, 1.08), steel, coll, .012)
    for x in (-.30, .30):
        box('Board clamping rail', (.075, .60, .075), (x, 3.59, 1.103), steel, coll, .009)
        for y in (3.37, 3.81):
            bolt('Backboard clamp bolts', (x, y, 1.255), steel, coll, radius=.013)
    # Regulation 72 x 42 inch board. Thin glass blends in one surface pass.
    box('Tempered glass · regulation 72 × 42 inches', (1.8288, 1.0668, .027), (0, BOARD_CENTER, BOARD_Z), glass, coll, .003, 1)
    # Aluminum perimeter with ivory powder coat; front sighting rectangle is 24 × 18 inches.
    for x in (-.93, .93):
        box('Board perimeter aluminum', (.035, 1.10, .055), (x, BOARD_CENTER, BOARD_Z), ivory, coll, .006)
    for y in (BOARD_CENTER - .55, BOARD_CENTER + .55):
        box('Board perimeter aluminum', (1.89, .035, .055), (0, y, BOARD_Z), ivory, coll, .006)
    for x in (-.3048, .3048):
        box('Sighting rectangle enamel', (.017, .4572, .003), (x, 3.2766, 1.197), ivory, coll, 0)
    for y in (3.048, 3.5052):
        box('Sighting rectangle enamel', (.6266, .017, .003), (0, y, 1.197), ivory, coll, 0)
    # Bottom pads have a rounded face and corner returns rather than floating bars.
    box('Board bottom safety cushion', (1.91, .077, .095), (0, BOARD_BOTTOM - .04, 1.18), navy, coll, .022, 3)
    for x in (-.935, .935):
        box('Board corner safety cushion', (.077, .24, .095), (x, BOARD_BOTTOM + .056, 1.18), navy, coll, .022, 3)
    # Breakaway base with separate plate, spring housing, twin braces and bolt heads.
    box('Breakaway mounting plate', (.17, .19, .026), (0, 3.132, 1.214), orange, coll, .007)
    box('Breakaway spring enclosure', (.16, .080, .155), (0, 3.009, 1.311), orange, coll, .011)
    box('Rim attachment bridge', (.14, .030, .155), (0, 3.048, 1.312), orange, coll, .008)
    for x in (-.051, .051):
        bolt('Rim mount bolt', (x, 3.183, 1.240), steel, coll, radius=.011)
        rod('Under-rim brace', (x, 2.995, 1.275), (x, 3.044, 1.399), .009, orange, coll)
    ring('18 inch clear opening · 12 mm round steel', (0, RIM_HEIGHT, RIM_Z),
         RIM_INNER_RADIUS + RIM_TUBE_RADIUS, RIM_TUBE_RADIUS, orange, coll)
    # Twelve lacing hooks, modelled woven diamonds, five rows and a soft flared exit.
    count, rows = 12, 5
    for i in range(count):
        angle = i * math.tau / count
        x, z = math.cos(angle) * .236, RIM_Z + math.sin(angle) * .236
        rod('Welded net hook', (x, 3.044, z), (x, 3.026, z), .004, orange, coll, 6)
    heights = (3.027, 2.953, 2.879, 2.805, 2.731, 2.657)
    radii = (.236, .213, .183, .152, .127, .119)
    nodes = []
    for row in range(rows + 1):
        offset = (row % 2) * .5
        ring_nodes = []
        for i in range(count):
            angle = (i + offset) * math.tau / count
            ring_nodes.append((math.cos(angle) * radii[row], heights[row], RIM_Z + math.sin(angle) * radii[row]))
        nodes.append(ring_nodes)
    for row in range(rows):
        for i in range(count):
            for neighbor in (i, (i - 1 if row % 2 == 0 else i + 1) % count):
                rod('Braided nylon net · diamond weave', nodes[row][i], nodes[row + 1][neighbor], .0026, ivory, coll, 5)
    ring('Soft nylon exit braid', (0, heights[-1], RIM_Z), radii[-1], .0027, ivory, coll, 36, 5)
    return coll


def make_bench(mats):
    coll = collection('02 — Four-seat team bench · editable components')
    wood, steel, navy = (mats[k] for k in ('wood', 'steel', 'navy'))
    # Four joined maple slats, eased seat edges, visible gaps, contoured back support.
    for z in (-.20, -.065, .070, .205):
        box('Solid maple seat slat', (3.18, .075, .116), (0, .4625, z), wood, coll, .018, 3)
    for y in (.77, .965):
        slat = box('Solid maple backrest slat', (3.18, .15, .064), (0, y, -.302), wood, coll, .015, 3)
        slat.rotation_euler.x = math.radians(-8)
    for x in (-1.33, 0, 1.33):
        # Splayed bent steel legs and three back supports are basketball bench scale.
        rectangular_strut('Front splayed leg', (x, .08, .185), (x, .427, .135), .055, .065, steel, coll)
        rectangular_strut('Back splayed leg', (x, .08, -.305), (x, .427, -.18), .055, .065, steel, coll)
        rectangular_strut('Backrest upright', (x, .39, -.18), (x, 1.025, -.315), .048, .05, steel, coll)
        box('Seat cross saddle', (.075, .06, .53), (x, .402, -.005), steel, coll, .009)
        for z in (.185, -.305):
            box('Rubber nonmarking foot', (.10, .07, .115), (x, .037, z), navy, coll, .013)
        for z in (-.20, .205):
            bolt('Seat countersunk fixing', (x, .504, z), steel, coll, axis='y', radius=.009)
    box('Lower longitudinal brace', (2.72, .05, .05), (0, .23, -.04), steel, coll, .009)
    # Quiet endcaps prevent the bench looking like stacked frontend blocks.
    for x in (-1.60, 1.60):
        box('Maple rounded seat endcap', (.043, .075, .53), (x, .4625, .005), wood, coll, .014)
    return coll


def make_wall_pad(mats):
    coll = collection('03 — Upholstered wall pad module · editable components')
    navy = mats['navy']
    box('Pad backing', (.90, 1.40, .042), (0, .70, 0), navy, coll, .008)
    box('Impact foam upholstered front', (.884, 1.378, .104), (0, .70, .057), navy, coll, .024, 3)
    for x in (-.417, .417):
        rod('Sewn perimeter piping', (x, .045, .111), (x, 1.355, .111), .0042, navy, coll, 6)
    for y in (.045, 1.355):
        rod('Sewn perimeter piping', (-.417, y, .111), (.417, y, .111), .0042, navy, coll, 6)
    return coll


def export_collection(source_coll, filename):
    """Bake modifiers into disposable duplicates and join into one mesh/material."""
    export_coll = collection('Temporary export')
    by_material = {}
    depsgraph = bpy.context.evaluated_depsgraph_get()
    for original in source_coll.objects:
        if original.type != 'MESH':
            continue
        evaluated = original.evaluated_get(depsgraph)
        mesh = bpy.data.meshes.new_from_object(evaluated, depsgraph=depsgraph)
        copy = bpy.data.objects.new(original.name, mesh)
        copy.matrix_world = original.matrix_world.copy()
        # The saved source is arranged as a review sheet; preserve local origins
        # when re-exporting an artist's edits from that same source file.
        copy.location -= Vector(source_coll.get('asset_preview_offset', (0, 0, 0)))
        export_coll.objects.link(copy)
        by_material.setdefault(original.data.materials[0], []).append(copy)
    merged = []
    for mat, parts in by_material.items():
        bpy.ops.object.select_all(action='DESELECT')
        for obj in parts:
            obj.select_set(True)
        bpy.context.view_layer.objects.active = parts[0]
        if len(parts) > 1:
            bpy.ops.object.join()
        obj = bpy.context.object
        obj.name = filename.removesuffix('.glb') + ' — ' + mat.name
        bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
        # Disconnected components sharing a material become a single GPU draw.
        for poly in obj.data.polygons:
            poly.material_index = 0
        obj.data.materials.clear()
        obj.data.materials.append(mat)
        obj['origin'] = 'Original CourtIQ DCC authoring; CC0-1.0'
        obj['units'] = 'metres'
        obj['visual_only'] = True
        merged.append(obj)
    bpy.ops.object.select_all(action='DESELECT')
    for obj in merged:
        obj.select_set(True)
    bpy.ops.export_scene.gltf(filepath=str(PUBLIC / filename), export_format='GLB', use_selection=True,
                              export_apply=False, export_extras=True, export_yup=True,
                              export_texcoords=False, export_normals=True, export_materials='EXPORT',
                              export_animations=False, export_cameras=False, export_lights=False)
    for obj in merged:
        bpy.data.objects.remove(obj, do_unlink=True)
    bpy.data.collections.remove(export_coll)
    # Read the final GLB rather than guessing GPU cost from source polygons.
    data = (PUBLIC / filename).read_bytes()
    json_length = struct.unpack_from('<I', data, 12)[0]
    gltf = json.loads(data[20:20 + json_length])
    tris = sum(gltf['accessors'][p['indices']]['count'] // 3 for m in gltf['meshes'] for p in m['primitives'])
    vertices = sum(gltf['accessors'][p['attributes']['POSITION']]['count'] for m in gltf['meshes'] for p in m['primitives'])
    draws = sum(len(m['primitives']) for m in gltf['meshes'])
    bounds = []
    for mesh in gltf['meshes']:
        for primitive in mesh['primitives']:
            accessor = gltf['accessors'][primitive['attributes']['POSITION']]
            bounds.append((accessor['min'], accessor['max']))
    minimum = [min(b[0][i] for b in bounds) for i in range(3)]
    maximum = [max(b[1][i] for b in bounds) for i in range(3)]
    assert tris < 20000, f'{filename}: too many triangles: {tris}'
    assert len(data) < 500000, f'{filename}: budget exceeded: {len(data)} bytes'
    assert draws <= 5, f'{filename}: draw-call budget exceeded'
    EXPORTS[filename] = dict(bytes=len(data), triangles=tris, vertices=vertices,
                             drawCalls=draws, materials=len(gltf['materials']),
                             bounds=dict(min=minimum, max=maximum), textures=0)


def look_at(obj, target):
    obj.rotation_euler = (Vector(coords(*target)) - obj.location).to_track_quat('-Z', 'Y').to_euler()


def render_reference(hoop, bench, wall_pad, mats):
    stage = collection('04 — Offline studio reference · not exported')
    # Place the reusable bench and a wall-pad sample beside the regulation basket.
    for obj in bench.objects:
        obj.location += Vector(coords(2.8, 0, -.4))
    bench['asset_preview_offset'] = coords(2.8, 0, -.4)
    for obj in wall_pad.objects:
        obj.location += Vector(coords(-2.25, 0, -.85))
    wall_pad['asset_preview_offset'] = coords(-2.25, 0, -.85)
    ground = make_material('Reference only · warm neutral floor', '#d1b78c', .75)
    box('Reference ground', (200, .06, 200), (0, -.04, 0), ground, stage, 0)
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'CPU'
    scene.cycles.samples = 32
    scene.cycles.use_denoising = False
    scene.render.resolution_x = 1600
    scene.render.resolution_y = 1100
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = 'PNG'
    scene.world.color = (.22, .22, .22)
    scene.world.use_nodes = True
    background = scene.world.node_tree.nodes.get('Background')
    background.inputs['Color'].default_value = (.62, .68, .72, 1)
    background.inputs['Strength'].default_value = .45
    scene.view_settings.view_transform = 'AgX'
    for name, at, power, size in [('Large warm key', (-4, 7, 6), 1500, 5), ('Sky fill', (4, 6, 2), 1100, 4), ('Edge light', (1, 6, -4), 1500, 3)]:
        data = bpy.data.lights.new(name, type='AREA')
        data.energy, data.shape, data.size = power, 'DISK', size
        obj = bpy.data.objects.new(name, data)
        stage.objects.link(obj)
        obj.location = coords(*at)
        look_at(obj, (0, 2, 0))
    data = bpy.data.cameras.new('Art review camera')
    camera = bpy.data.objects.new('Art review camera', data)
    stage.objects.link(camera)
    camera.location = coords(8, 5.8, 11)
    data.type, data.ortho_scale, data.lens = 'ORTHO', 8.4, 45
    look_at(camera, (.85, 2.12, .0))
    scene.camera = camera
    scene.render.filepath = str(SOURCE / 'gym-equipment-reference.png')
    return scene


def write_manifest():
    manifest = dict(version=1, generator='Blender ' + bpy.app.version_string,
                    license='CC0-1.0', provenance='Original CourtIQ authored geometry; no external assets or textures',
                    units='metres', upAxis='Y', runtimeDirectory='/environment/', assets=EXPORTS,
                    placement=dict(hoop=dict(position=[0, 0, 0], rotationY=0,
                                            rimCenter=[0, RIM_HEIGHT, RIM_Z], boardPlaneZ=BOARD_Z,
                                            rimInnerDiameter=RIM_INNER_RADIUS * 2, boardBottomHeight=BOARD_BOTTOM,
                                            baselineZ=0, authoredInWorldSpace=True),
                                   bench=dict(localOrigin=[0, 0, 0], forwardAxis='+Z', seatHeight=.50,
                                              recommendedInstances=[dict(position=[-9.25, 0, 5.6], rotationY=math.pi / 2),
                                                                    dict(position=[9.25, 0, 5.6], rotationY=-math.pi / 2)]),
                                   wallPad=dict(localOrigin=[0, 0, 0], width=.90, height=1.40, forwardAxis='+Z',
                                                rearWallCenterZ=-3.94, rearWallRotationY=0)),
                    optimization=dict(mergedByMaterial=True, appliedBevels=True, normalMaps=False,
                                      textures=0, alphaBlendMaterials=1, compressionDecoderRequired=False,
                                      perAssetTriangleLimit=20000, perAssetByteLimit=500000,
                                      maxDrawCallsPerAsset=5))
    (PUBLIC / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--render', action='store_true', help='CPU Cycles offline art review PNG')
    args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else [])
    PUBLIC.mkdir(parents=True, exist_ok=True)
    SOURCE.mkdir(parents=True, exist_ok=True)
    bpy.context.preferences.filepaths.save_version = 0
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    for old in list(bpy.data.collections):
        if not old.objects:
            bpy.data.collections.remove(old)
    mats = dict(steel=make_material('Powder coated graphite steel', '#293d44', .50, .40),
                navy=make_material('Deep petrol upholstered padding', '#234650', .87),
                ivory=make_material('Warm ivory nylon and enamel', '#e8e9df', .72),
                orange=make_material('Burnt orange rim enamel', '#c75c32', .40, .24),
                glass=make_material('Pale neutral tempered glass', '#b8cdd2', .17, .04, .17),
                wood=make_material('Pale maple bench finish', '#bc956a', .53))
    hoop = make_hoop(mats)
    bench = make_bench(mats)
    wall_pad = make_wall_pad(mats)
    export_collection(hoop, 'courtiq-hoop.glb')
    export_collection(bench, 'courtiq-bench.glb')
    export_collection(wall_pad, 'courtiq-wall-pad.glb')
    write_manifest()
    scene = render_reference(hoop, bench, wall_pad, mats)
    scene['CourtIQ equipment license'] = 'CC0-1.0 — all geometry original; no external textures'
    scene['CourtIQ runtime coordinate contract'] = 'Y up metres; rim=(0,3.048,1.575); boardZ=1.18; baselineZ=0'
    bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE / 'courtiq-gym-equipment.blend'), compress=True)
    if args.render:
        bpy.ops.render.render(write_still=True)
    print(json.dumps(EXPORTS, indent=2))


if __name__ == '__main__':
    main()
