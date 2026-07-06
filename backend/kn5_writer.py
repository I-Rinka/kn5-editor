import struct

KN5_MAGIC = b"sc6969"


class KN5Writer:
    def __init__(self, f):
        self.f = f

    def write_bytes(self, data):
        self.f.write(data)

    def write_uint(self, v):
        self.f.write(struct.pack("<I", v))

    def write_int(self, v):
        self.f.write(struct.pack("<i", v))

    def write_ushort(self, v):
        self.f.write(struct.pack("<H", v))

    def write_byte(self, v):
        self.f.write(struct.pack("<B", v))

    def write_bool(self, v):
        self.f.write(struct.pack("<?", v))

    def write_float(self, v):
        self.f.write(struct.pack("<f", v))

    def write_vector3(self, v):
        self.f.write(struct.pack("<3f", *v))

    def write_string(self, s):
        encoded = s.encode("utf-8")
        self.write_uint(len(encoded))
        self.write_bytes(encoded)

    def write_matrix(self, m):
        self.f.write(struct.pack("<16f", *m))


def write_kn5(model, path_or_file):
    if hasattr(path_or_file, 'write'):
        _write_to(model, path_or_file)
        return
    with open(path_or_file, "wb") as f:
        _write_to(model, f)


def _write_to(model, f):
    w = KN5Writer(f)

    w.write_bytes(KN5_MAGIC)
    w.write_uint(model.version)

    w.write_int(len(model.textures))
    for tex in model.textures:
        w.write_int(1)
        w.write_string(tex.name)
        w.write_uint(len(tex.data))
        w.write_bytes(tex.data)

    w.write_int(len(model.materials))
    for mat in model.materials:
        w.write_string(mat.name)
        w.write_string(mat.shader)
        w.write_byte(mat.blend_mode)
        w.write_bool(mat.alpha_tested)
        w.write_int(mat.depth_mode)
        w.write_uint(len(mat.properties))
        for prop in mat.properties:
            w.write_string(prop.name)
            w.write_float(prop.value_a)
            w.write_bytes(struct.pack("<2f", *prop.value_b))
            w.write_bytes(struct.pack("<3f", *prop.value_c))
            w.write_bytes(struct.pack("<4f", *prop.value_d))
        w.write_uint(len(mat.texture_mappings))
        for tm in mat.texture_mappings:
            w.write_string(tm.mapping_name)
            w.write_uint(tm.slot)
            w.write_string(tm.texture_name)

    _write_node(w, model.root_node)


def _write_node(w, node):
    w.write_uint(node.node_type)
    if node.node_type == 1:
        _write_group_node(w, node)
    elif node.node_type == 2:
        _write_mesh_node(w, node)


def _write_group_node(w, node):
    w.write_string(node.name)
    w.write_uint(len(node.children))
    w.write_bool(node.active)
    w.write_matrix(node.matrix)
    for child in node.children:
        _write_node(w, child)


def _write_mesh_node(w, node):
    w.write_string(node.name)
    w.write_uint(len(node.children))
    w.write_bool(node.active)
    w.write_bool(node.cast_shadows)
    w.write_bool(node.visible)
    w.write_bool(node.transparent)

    w.write_uint(node.vertex_count)
    w.write_bytes(node.vertex_data)

    w.write_uint(node.index_count)
    w.write_bytes(node.index_data)

    w.write_uint(node.material_id)
    w.write_uint(node.layer)
    w.write_float(node.lod_in)
    w.write_float(node.lod_out)
    w.write_vector3(node.bsphere_center)
    w.write_float(node.bsphere_radius)
    w.write_bool(node.renderable)

    for child in node.children:
        _write_node(w, child)
