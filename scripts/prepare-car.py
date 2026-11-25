"""Remove the trademarked license plate from an upstream Car Concept GLB."""
import json
from pathlib import Path
import struct
import sys
import zlib

source, target = map(Path, sys.argv[1:])
data = source.read_bytes()
size, = struct.unpack_from('<I', data, 12)
doc = json.loads(data[20:20 + size])
offset = 20 + size
binary = bytearray(data[offset + 8:])
plate = next(i for i, node in enumerate(doc['nodes']) if node.get('name') == 'License Plate')
for node in doc['nodes']:
    if plate in node.get('children', []):
        node['children'].remove(plate)

material = next(m for m in doc['materials'] if m.get('name') == 'License')
texture = doc['textures'][material['pbrMetallicRoughness'].pop('baseColorTexture')['index']]
image = doc['images'][texture['source']]
view = doc['bufferViews'][image['bufferView']]

def png_chunk(kind, payload):
    return struct.pack('>I', len(payload)) + kind + payload + struct.pack('>I', zlib.crc32(kind + payload))

png = (b'\x89PNG\r\n\x1a\n' + png_chunk(b'IHDR', struct.pack('>IIBBBBB', 1, 1, 8, 2, 0, 0, 0))
       + png_chunk(b'IDAT', zlib.compress(b'\0\x30\x33\x38')) + png_chunk(b'IEND', b''))
start, length = view.get('byteOffset', 0), view['byteLength']
assert length > len(png)
binary[start:start + length] = png + bytes(length - len(png))
view['byteLength'] = len(png)
image['mimeType'] = 'image/png'

metadata = json.dumps(doc, separators=(',', ':')).encode()
metadata += b' ' * (-len(metadata) % 4)
target.write_bytes(struct.pack('<4sII', b'glTF', 2, 28 + len(metadata) + len(binary))
                   + struct.pack('<I4s', len(metadata), b'JSON') + metadata
                   + struct.pack('<I4s', len(binary), b'BIN\0') + binary)
