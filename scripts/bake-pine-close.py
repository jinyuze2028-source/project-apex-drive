"""Blender -b -P bake-pine-close.py -- original_CC0_tree.gltf pine-close.glb"""
import sys
from pathlib import Path
import bpy
from mathutils import Matrix,Vector

args=sys.argv[sys.argv.index('--')+1:]
source,target=map(Path,args[:2])
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(source.resolve()))
tree=bpy.data.objects['pine_sapling_small_b']
bpy.ops.object.select_all(action='DESELECT')
tree.select_set(True)
bpy.context.view_layer.objects.active=tree
tree.location=(0,0,0)
bpy.context.view_layer.update()
# Keep the bark and primary limbs intact, and simplify the fine needle sprays.
group=tree.vertex_groups.new(name='Structural wood')
wood=next(i for i,m in enumerate(tree.material_slots) if 'bark' in m.name)
verts={v for poly in tree.data.polygons if poly.material_index==wood for v in poly.vertices}
group.add(list(verts),1.,'REPLACE')
modifier=tree.modifiers.new('Needle cluster LOD','DECIMATE')
modifier.ratio=float(args[2]) if len(args)>2 else .062
modifier.vertex_group=group.name
modifier.vertex_group_factor=65
modifier.invert_vertex_group=True
bpy.ops.object.modifier_apply(modifier=modifier.name)
points=[tree.matrix_world@v.co for v in tree.data.vertices]
base=min(p.z for p in points);height=max(p.z for p in points)-base
for v,p in zip(tree.data.vertices,points):v.co=Vector((p.x,p.y,p.z-base))/height
tree.matrix_world=Matrix.Identity(4)
for slot in tree.material_slots:
    slot.material.use_nodes=False
bpy.ops.export_scene.gltf(filepath=str(target.resolve()),use_selection=True,export_format='GLB',export_animations=False,export_cameras=False,export_lights=False,export_image_format='NONE')
