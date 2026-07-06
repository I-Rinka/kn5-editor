from dataclasses import dataclass, field


@dataclass
class Texture:
    name: str
    data: bytes


@dataclass
class MaterialProperty:
    name: str
    value_a: float
    value_b: tuple
    value_c: tuple
    value_d: tuple


@dataclass
class TextureMapping:
    mapping_name: str
    slot: int
    texture_name: str


@dataclass
class Material:
    name: str
    shader: str
    blend_mode: int
    alpha_tested: bool
    depth_mode: int
    properties: list = field(default_factory=list)
    texture_mappings: list = field(default_factory=list)


@dataclass
class Node:
    node_id: int
    node_type: int  # 1=Group, 2=Mesh
    name: str
    active: bool
    matrix: list = field(default_factory=lambda: [
        1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1
    ])
    children: list = field(default_factory=list)
    # Mesh-only fields
    cast_shadows: bool = True
    visible: bool = True
    transparent: bool = False
    vertex_data: bytes = b''
    vertex_count: int = 0
    index_data: bytes = b''
    index_count: int = 0
    material_id: int = 0
    layer: int = 0
    lod_in: float = 0.0
    lod_out: float = 0.0
    bsphere_center: tuple = (0.0, 0.0, 0.0)
    bsphere_radius: float = 0.0
    renderable: bool = True


@dataclass
class KN5File:
    version: int
    textures: list = field(default_factory=list)
    materials: list = field(default_factory=list)
    root_node: Node = None
    source_path: str = ''
