"""Refit the licensed Car Concept bumper returns. Run after prepare-car.py with Blender's Python (NumPy)."""
import json
import struct
import sys
from pathlib import Path

import numpy as np

source, target = map(Path, sys.argv[1:])
raw = source.read_bytes()
size = struct.unpack_from('<I', raw, 12)[0]
doc = json.loads(raw[20:20 + size])
binary = bytearray(raw[28 + size:])

def attribute(index):
    a = doc['accessors'][index]
    view = doc['bufferViews'][a['bufferView']]
    dim = {'VEC3': 3, 'VEC4': 4}[a['type']]
    assert a['componentType'] == 5126
    return np.ndarray((a['count'], dim), '<f4', binary,
                      view.get('byteOffset', 0) + a.get('byteOffset', 0),
                      strides=(view.get('byteStride', 4 * dim), 4))

def smooth(x):
    x = np.clip(x, 0, 1)
    return x * x * (3 - 2 * x)

def reshape(p):
    x, y, z = p.T
    # Lift the underside of the overhang and narrow its returns behind the tires.
    rear = smooth((z - 1.32) / .48)
    front = smooth((-z - 1.74) / .52)
    low = smooth((.82 - y) / .72)
    return np.stack([x * (1 - low * (.105 * rear + .044 * front)),
                     y + low * (.33 * rear + .13 * front), z], axis=1)

def unit(v):
    return v / np.maximum(1e-10, np.linalg.norm(v, axis=1, keepdims=True))

edited = set()
def visit(index, parent):
    node = doc['nodes'][index]
    if node.get('name', '').startswith('Wheel'):
        return
    local = np.array(node.get('matrix', np.eye(4).T.flatten())).reshape(4, 4).T
    if 'translation' in node:
        assert abs(node.get('rotation', [0,0,0,1])[3]) == 1 and node.get('scale', [1,1,1]) == [1,1,1]
        local[:3,3] = node['translation']
    world = parent @ local
    axes, origin = world[:3,:3], world[:3,3]
    for primitive in doc['meshes'][node['mesh']]['primitives'] if 'mesh' in node else []:
        attrs = primitive['attributes']
        if attrs['POSITION'] in edited:
            continue
        points = attribute(attrs['POSITION'])
        p = np.einsum('ij,kj->ki', axes, points) + origin
        result = reshape(p)
        if np.max(abs(result - p)) < 1e-7:
            continue
        edited.add(attrs['POSITION'])
        points[:] = np.einsum('ij,kj->ki', np.linalg.inv(axes), result - origin)
        accessor = doc['accessors'][attrs['POSITION']]
        accessor.update(min=points.min(axis=0).tolist(), max=points.max(axis=0).tolist())
        J = np.stack([(reshape(p + delta) - reshape(p - delta)) / .0002 for delta in np.eye(3)*.0001], axis=2)
        local_j = np.einsum('ab,kbc,cd->kad', np.linalg.inv(axes), J, axes)
        normals = attribute(attrs['NORMAL'])
        normals[:] = unit(np.linalg.solve(local_j.transpose(0,2,1), normals[...,None])[...,0])
        if 'TANGENT' in attrs:
            tangents = attribute(attrs['TANGENT'])[:,:3]
            tangents[:] = unit(np.einsum('ijk,ik->ij', local_j, tangents))
    for child in node.get('children', []):
        visit(child, world)

visit(doc['scenes'][0]['nodes'][0], np.diag([-1.,1.,-1.,1.]))
doc['asset']['extras'] = {'apexRevision': 'Clubsport rear valance and front returns, metres'}
meta = json.dumps(doc, separators=(',', ':')).encode()
meta += b' ' * (-len(meta) % 4)
target.write_bytes(struct.pack('<4sII', b'glTF', 2, 28 + len(meta) + len(binary))
                   + struct.pack('<I4s', len(meta), b'JSON') + meta
                   + struct.pack('<I4s', len(binary), b'BIN\0') + binary)
print('Refit position accessors:', len(edited))
