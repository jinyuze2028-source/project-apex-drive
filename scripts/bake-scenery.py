import bpy, numpy as np
from pathlib import Path
from mathutils import Vector
import sys
# blender -b -P scripts/bake-scenery.py -- alps_field_4k.hdr extracted-pine-source output-directory
sky_path,source,out=map(lambda p:Path(p).resolve(),sys.argv[sys.argv.index('--')+1:])
bpy.ops.wm.read_factory_settings(use_empty=True)
sky=bpy.data.images.load(str(sky_path))
scene=bpy.context.scene
scene.render.image_settings.file_format='JPEG';scene.render.image_settings.quality=92;scene.view_settings.view_transform='AgX'
sky.save_render(str(out/'alps-background.jpg'),scene=scene)
bpy.data.images.remove(sky)
bpy.ops.import_scene.gltf(filepath=str(source/'tree.gltf'))
obj=bpy.data.objects['pine_sapling_small_b']
bpy.ops.object.select_all(action='DESELECT');obj.select_set(True);bpy.context.view_layer.objects.active=obj
obj.location=(0,0,0)
mod=obj.modifiers.new('Trackside silhouette LOD','DECIMATE');mod.ratio=.020
bpy.ops.object.modifier_apply(modifier=mod.name)
for slot in obj.material_slots:
 mat=slot.material;pbr=next(n for n in mat.node_tree.nodes if n.type=='BSDF_PRINCIPLED')
 # Avoid shipping auxiliary normal and metal maps for subpixel twigs.
 links=mat.node_tree.links
 for name in ['Normal','Metallic','Roughness']:
  for link in list(pbr.inputs[name].links):links.remove(link)
 pbr.inputs['Roughness'].default_value=.94;pbr.inputs['Metallic'].default_value=0
 tex=next(n for n in mat.node_tree.nodes if n.type=='TEX_IMAGE' and 'diff' in n.image.name)
 if 'twig' in mat.name:
  alpha=bpy.data.images.load(str(source/'alpha.jpg'));alpha.colorspace_settings.name='Non-Color'
  pix=np.empty(len(tex.image.pixels),dtype='f');tex.image.pixels.foreach_get(pix)
  mask=np.empty(len(alpha.pixels),dtype='f');alpha.pixels.foreach_get(mask)
  pix[3::4]=mask[0::4]
  image=bpy.data.images.new('Pine branches',width=1024,height=1024,alpha=True)
  image.pixels.foreach_set(pix);image.file_format='PNG';image.pack();tex.image=image
  links.new(tex.outputs['Alpha'],pbr.inputs['Alpha']);mat.use_backface_culling=False
 links.new(tex.outputs['Color'],pbr.inputs['Base Color'])
# Bake orientation and normalize height for instancing in metres.
pts=[obj.matrix_world@v.co for v in obj.data.vertices]
lo=min(p.z for p in pts); hi=max(p.z for p in pts)
for v,p in zip(obj.data.vertices,pts):v.co=Vector((p.x,p.y,p.z-lo))/(hi-lo)
from mathutils import Matrix
obj.matrix_world=Matrix.Identity(4)
bpy.ops.export_scene.gltf(filepath=str(out/'trackside-pine.glb'),use_selection=True,export_format='GLB',export_animations=False,export_cameras=False,export_lights=False)
print('triangle count',len(obj.data.polygons))
