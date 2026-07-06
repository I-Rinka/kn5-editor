import struct
from .kn5_model import KN5File, Texture, Material, MaterialProperty, TextureMapping, Node

KN5_MAGIC = b"sc6969"


class KN5Reader:
    def __init__(self, f):
        self.f = f
        self._node_counter = 0

    def read_bytes(self, n):
        data = self.f.read(n)
        if len(data) != n:
            raise EOFError(f"Expected {n} bytes, got {len(data)}")
        return data

    def read_uint(self):
        return struct.unpack("<I", self.read_bytes(4))[0]

    def read_int(self):
        return struct.unpack("<i", self.read_bytes(4))[0]

    def read_ushort(self):
        return struct.unpack("<H", self.read_bytes(2))[0]

    def read_byte(self):
        return struct.unpack("<B", self.read_bytes(1))[0]

    def read_bool(self):
        return struct.unpack("<?", self.read_bytes(1))[0]

    def read_float(self):
        return struct.unpack("<f", self.read_bytes(4))[0]

    def read_vector3(self):
        return struct.unpack("<3f", self.read_bytes(12))

    def read_string(self):
        length = self.read_uint()
        return self.read_bytes(length).decode("utf-8")

    def read_matrix(self):
        return list(struct.unpack("<16f", self.read_bytes(64)))

    def _next_node_id(self):
        nid = self._node_counter
        self._node_counter += 1
        return nid

    def read_header(self):
        magic = self.read_bytes(6)
        if magic != KN5_MAGIC:
            raise ValueError(f"Not a KN5 file: magic={magic!r}")
        version = self.read_uint()
        return version

    def read_textures(self):
        count = self.read_int()
        textures = []
        for _ in range(count):
            _active = self.read_int()
            name = self.read_string()
            data_len = self.read_uint()
            data = self.read_bytes(data_len)
            textures.append(Texture(name=name, data=data))
        return textures

    def read_material_property(self):
        name = self.read_string()
        value_a = self.read_float()
        value_b = struct.unpack("<2f", self.read_bytes(8))
        value_c = struct.unpack("<3f", self.read_bytes(12))
        value_d = struct.unpack("<4f", self.read_bytes(16))
        return MaterialProperty(
            name=name, value_a=value_a,
            value_b=value_b, value_c=value_c, value_d=value_d
        )

    def read_texture_mapping(self):
        mapping_name = self.read_string()
        slot = self.read_uint()
        texture_name = self.read_string()
        return TextureMapping(
            mapping_name=mapping_name, slot=slot, texture_name=texture_name
        )

    def read_materials(self):
        count = self.read_int()
        materials = []
        for _ in range(count):
            name = self.read_string()
            shader = self.read_string()
            blend_mode = self.read_byte()
            alpha_tested = self.read_bool()
            depth_mode = self.read_int()
            prop_count = self.read_uint()
            properties = [self.read_material_property() for _ in range(prop_count)]
            tex_count = self.read_uint()
            tex_mappings = [self.read_texture_mapping() for _ in range(tex_count)]
            materials.append(Material(
                name=name, shader=shader, blend_mode=blend_mode,
                alpha_tested=alpha_tested, depth_mode=depth_mode,
                properties=properties, texture_mappings=tex_mappings
            ))
        return materials

    def read_node(self):
        node_type = self.read_uint()
        if node_type == 1:
            return self._read_group_node()
        elif node_type == 2:
            return self._read_mesh_node()
        else:
            raise ValueError(f"Unknown node type: {node_type}")

    def _read_group_node(self):
        name = self.read_string()
        child_count = self.read_uint()
        active = self.read_bool()
        matrix = self.read_matrix()
        node = Node(
            node_id=self._next_node_id(),
            node_type=1,
            name=name,
            active=active,
            matrix=matrix,
        )
        node.children = [self.read_node() for _ in range(child_count)]
        return node

    def _read_mesh_node(self):
        name = self.read_string()
        child_count = self.read_uint()
        active = self.read_bool()
        cast_shadows = self.read_bool()
        visible = self.read_bool()
        transparent = self.read_bool()

        vertex_count = self.read_uint()
        vertex_data = self.read_bytes(vertex_count * 44)

        index_count = self.read_uint()
        index_data = self.read_bytes(index_count * 2)

        material_id = self.read_uint()
        layer = self.read_uint()
        lod_in = self.read_float()
        lod_out = self.read_float()
        bsphere_center = self.read_vector3()
        bsphere_radius = self.read_float()
        renderable = self.read_bool()

        node = Node(
            node_id=self._next_node_id(),
            node_type=2,
            name=name,
            active=active,
            matrix=[1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
            cast_shadows=cast_shadows,
            visible=visible,
            transparent=transparent,
            vertex_data=vertex_data,
            vertex_count=vertex_count,
            index_data=index_data,
            index_count=index_count,
            material_id=material_id,
            layer=layer,
            lod_in=lod_in,
            lod_out=lod_out,
            bsphere_center=bsphere_center,
            bsphere_radius=bsphere_radius,
            renderable=renderable,
        )
        for _ in range(child_count):
            node.children.append(self.read_node())
        return node


def parse_kn5(source, source_path=''):
    if isinstance(source, (str, bytes)) and not hasattr(source, 'read'):
        with open(source, "rb") as f:
            return _parse_from_file(f, source)
    return _parse_from_file(source, source_path)


def _parse_from_file(f, source_path):
    reader = KN5Reader(f)
    version = reader.read_header()
    textures = reader.read_textures()
    materials = reader.read_materials()
    root_node = reader.read_node()

    model = KN5File(
        version=version,
        textures=textures,
        materials=materials,
        root_node=root_node,
        source_path=str(source_path),
    )

    node_index = {}
    _build_index(root_node, node_index)
    return model, node_index


def _build_index(node, index):
    index[node.node_id] = node
    for child in node.children:
        _build_index(child, index)
