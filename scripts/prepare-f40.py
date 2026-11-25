"""Convert the Black Snow F40 material-batched GLB into metre-scale animated assemblies.
Usage: python prepare-f40.py source.glb f40-road.glb (NumPy required).
Part numbers refer to this particular author export. See public/assets/F40-CREDITS.txt.
"""
import json
from pathlib import Path
import struct
import sys

import numpy as np

source_path, target_path = map(Path, sys.argv[1:])
source = source_path.read_bytes()
json_size = struct.unpack_from('<I', source, 12)[0]
model = json.loads(source[20:20 + json_size])
binary = source[28 + json_size:]
assert len(model['meshes']) == 42 and any(m['name'] == 'F40_Rrims' for m in model['materials']), 'Unexpected model revision'

def read(index):
    accessor = model['accessors'][index]
    view = model['bufferViews'][accessor['bufferView']]
    dtype = np.dtype({5123: '<u2', 5125: '<u4', 5126: '<f4'}[accessor['componentType']])
    channels = {'VEC3': 3, 'VEC2': 2, 'SCALAR': 1}[accessor['type']]
    offset = view.get('byteOffset', 0) + accessor.get('byteOffset', 0)
    stride = view.get('byteStride', channels * dtype.itemsize)
    return np.ndarray((accessor['count'], channels), dtype, binary, offset=offset,
                      strides=(stride, dtype.itemsize))

def islands(vertices, triangles):
    # Weld coincident positions for connectivity only. Preserve hard edges in the exported normals.
    _, point = np.unique(vertices.round(5), axis=0, return_inverse=True)
    parent = list(range(len(vertices)))
    def root(i):
        while i != parent[i]:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i
    for a, b, c in point[triangles]:
        parent[root(a)] = root(b)
        parent[root(c)] = root(b)
    labels = np.array([root(i) for i in point[triangles[:, 0]]])
    return [np.where(labels == label)[0] for label in np.unique(labels)]

def partition(index, vertices, faces):
    groups = {}
    if index in (9, 28, 29, 35, 36, 37, 38, 41):
        for i, (x,y,_) in enumerate(vertices[faces].mean(axis=1)):
            side = 'L' if x > 0 else 'R'
            part = 'disc' if index == 9 else 'rim' if index in (28, 29) else 'tire'
            axle = 'F' if y < 0 else 'R'
            name = 'signal' + side if index == 41 else part + axle + side
            groups.setdefault(name, []).append(i)
        return groups
    if index == 12:
        for ids in islands(vertices, faces):
            x,_,z = vertices[faces[ids]].mean(axis=(0, 1))
            name = ('mirrorLeft' if x > 0 else 'mirrorRight') if z > .76 else 'part12pin'
            groups.setdefault(name, []).extend(ids)
        return groups
    keep = np.ones(len(faces), bool)
    if index in (4, 7, 10, 13, 14, 15, 17, 21, 23, 24, 30, 34, 40):
        for ids in islands(vertices, faces):
            points = vertices[faces[ids]]
            low, high = points.min(axis=(0, 1)), points.max(axis=(0, 1))
            x,y,z = (low + high) / 2
            if index == 10 and -.10 < low[0] < -.08 and 1.02 < low[2] < 1.03 and -.29 < low[1] < -.28:
                groups['mirrorCabin'] = ids
                keep[ids] = False
            if index in (4, 7, 10, 40):
                xyz = points[:, :, [0, 2, 1]] * [-1, 1, 2.45 / 2.522]
                xyz[:, :, 1] -= .01
                lo, hi = xyz.min(axis=(0, 1)), xyz.max(axis=(0, 1))
                side = 'L' if hi[0] < 0 else 'R'
                if lo[2] > -1.9 and hi[2] < -1.59 and (lo[0] > .53 or hi[0] < -.53):
                    part = {7:(158, 'PopupCover'), 10:(20, 'PopupTrim'),
                            4:(34,'PopupLens'), 40:(46,'PopupInsert')}[index]
                    if len(ids) == part[0]:
                        groups[part[1]+side] = ids
                        keep[ids] = False
            if index in (10, 34):
                xyz = points[:, :, [0, 2, 1]] * [-1, 1, 2.45 / 2.522]
                xyz[:, :, 1] -= .01
                lo, hi = xyz.min(axis=(0, 1)), xyz.max(axis=(0, 1))
                if index == 34 and len(ids) == 276 and lo[2] < -.99:
                    groups['windscreen'] = ids
                    keep[ids] = False
                if (index == 10 and lo[2] > -1.12 and hi[2] < -.74 and
                        lo[1] > .75 and hi[1] < .90 and lo[0] > -.025 and hi[0] < .67 and len(ids) != 20):
                    part = {134: 'wiperArm', 26: 'wiperRubber'}.get(len(ids), 'wiperFrame')
                    groups.setdefault(part, []).extend(ids)
                    keep[ids] = False
            column = index == 14 and len(ids) == 746 and .30 < x < .35 and -.63 < y < -.57
            wheel = .12 < low[0] and high[0] < .57 and -.59 < y < -.40 and .53 < z < .90
            lever = abs(x-.015) < .033 and -.49 < y < -.42 and .26 < z < .58 and max(high-low) < .38
            if column or wheel or lever:
                keep[ids] = False
    groups['part' + str(index)] = np.where(keep)[0]
    return groups

result = {'asset': model['asset'], 'scene': 0, 'scenes': [{'nodes': []}], 'nodes': [], 'meshes': [],
          'materials': model['materials'], 'extensionsUsed': model['extensionsUsed'], 'accessors': [], 'bufferViews': []}
data = bytearray()
def accessor(array, kind):
    data.extend(bytes(-len(data) % 4))
    view = {'buffer': 0, 'byteOffset': len(data), 'byteLength': array.nbytes}
    result['bufferViews'].append(view)
    info = {'bufferView': len(result['bufferViews'])-1, 'count': len(array),
            'componentType': 5126 if array.dtype.kind == 'f' else 5125, 'type': kind}
    if kind == 'VEC3':
        info.update(min=array.min(0).tolist(), max=array.max(0).tolist())
    result['accessors'].append(info)
    data.extend(array.tobytes())
    return len(result['accessors']) - 1

for index, mesh in enumerate(model['meshes']):
    if index in (3, 18, 31, 39):  # Replaced cockpit hardware and marker geometry.
        continue
    primitive = mesh['primitives'][0]
    vertices = read(primitive['attributes']['POSITION'])
    normals = read(primitive['attributes']['NORMAL'])
    faces = read(primitive['indices']).reshape(-1, 3)
    for name, face_ids in partition(index, vertices, faces).items():
        if not len(face_ids):
            continue
        used, indices = np.unique(faces[face_ids], return_inverse=True)
        v = vertices[used][:, [0,2,1]] * [-1, 1, 2.45 / 2.522]
        v[:,1] -= .01
        n = normals[used][:, [0,2,1]] * [-1, 1, 2.522 / 2.45]
        n /= np.maximum(1e-9, np.linalg.norm(n, axis=1)[:,None])
        part = {'attributes': {'POSITION': accessor(v.astype('<f4'), 'VEC3'), 'NORMAL': accessor(n.astype('<f4'), 'VEC3')},
                'indices': accessor(indices.astype('<u4').reshape(-1), 'SCALAR'), 'material': primitive['material']}
        i = len(result['meshes'])
        result['meshes'].append({'primitives': [part]})
        result['nodes'].append({'name': name, 'mesh': i})
        result['scenes'][0]['nodes'].append(i)
result['buffers'] = [{'byteLength': len(data)}]
header = json.dumps(result, separators=(',', ':')).encode()
header += b' ' * (-len(header) % 4)
target_path.write_bytes(struct.pack('<4sII', b'glTF', 2, 28 + len(header) + len(data))
                        + struct.pack('<I4s', len(header), b'JSON') + header
                        + struct.pack('<I4s', len(data), b'BIN\0') + data)
