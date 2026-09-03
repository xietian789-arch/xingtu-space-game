"""Print raw mesh POSITION spans from local GLB files (read-only diagnostic)."""
from __future__ import annotations

import glob
import json
import os
import struct


for filename in glob.glob(os.path.join("models", "*.glb")):
    with open(filename, "rb") as file:
        blob = file.read()
    json_length = struct.unpack_from("<I", blob, 12)[0]
    document = json.loads(blob[20 : 20 + json_length])
    accessors = [
        document["accessors"][primitive["attributes"]["POSITION"]]
        for mesh in document.get("meshes", [])
        for primitive in mesh.get("primitives", [])
        if "POSITION" in primitive.get("attributes", {})
    ]
    minimum = [min(accessor.get("min", [0, 0, 0])[axis] for accessor in accessors) for axis in range(3)]
    maximum = [max(accessor.get("max", [0, 0, 0])[axis] for accessor in accessors) for axis in range(3)]
    span = [round(maximum[axis] - minimum[axis], 4) for axis in range(3)]
    mesh_nodes = [
        {
            "scale": node.get("scale"),
            "translation": node.get("translation"),
            "matrix": node.get("matrix"),
        }
        for node in document.get("nodes", [])
        if "mesh" in node
    ]
    print(
        f"{os.path.basename(filename):30} span={span!s:32} "
        f"meshes={len(document.get('meshes', []))} transforms={mesh_nodes}"
    )
