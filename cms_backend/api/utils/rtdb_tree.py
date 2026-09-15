"""Pure, backend-agnostic tree operations for the Realtime Database (RTDB).

Both SqliteData and PostgresData used to carry an identical copy of this
logic — same functions, same bugs, two places to fix. It now lives here
once; each backend's `*_rtdb_path` methods do only the DB round-trip
(fetch whole tree, call into this module, save whole tree back).

Path segments address a dict by key or a list by numeric index, same as
before. What's different from the original duplicated version:

- A segment/node type mismatch (e.g. a non-numeric key against a list node)
  now raises `RtdbPathConflictError` instead of silently discarding the
  intended key and appending at the wrong index.
- `push` is new: generates a sortable, (near-certainly) unique key and adds
  a child under a dict node, so ordered collections can be built without
  index-addressed children — deleting one push-keyed entry never shifts any
  other entry's address, unlike a plain JSON-array child.
- `validate_tree_size` is a coarse cap on the whole tree's serialized size,
  called by each backend right before saving, since every write — even one
  that touches a single leaf — currently pays the cost of the whole tree on
  every future read/write.
"""

import secrets
import time

RTDB_MAX_TREE_BYTES = 5_000_000  # ~5MB serialized JSON per project's RTDB tree
RTDB_MAX_VALUE_DEPTH = 32  # depth cap on a single written value, not the whole tree


class RtdbPathConflictError(ValueError):
    """A path segment's expected container type (dict vs list) doesn't match
    what's already stored there — e.g. a named key against a list node."""


class RtdbSizeLimitError(ValueError):
    """The resulting tree, or a single written value, exceeds a size/depth cap."""


def rtdb_segments(path: str) -> list[str]:
    return [seg for seg in path.split("/") if seg]


def rtdb_get_child(node, seg: str):
    """Reads `seg` off a dict (by key) or list (by numeric index); None if absent."""
    if isinstance(node, dict):
        return node.get(seg)
    if isinstance(node, list):
        return node[int(seg)] if seg.isdigit() and int(seg) < len(node) else None
    return None


def rtdb_set_child(node, seg: str, value) -> None:
    """Writes `seg` into a dict (by key) or list (by index; appends when
    seg == len(node)). Raises RtdbPathConflictError rather than silently
    discarding a non-numeric key against a list node."""
    if isinstance(node, list):
        if not seg.isdigit():
            raise RtdbPathConflictError(
                f"'{seg}' is not a valid index — this path is a list, not a dict."
            )
        idx = int(seg)
        if idx < len(node):
            node[idx] = value
        else:
            node.extend([None] * (idx - len(node)))
            node.append(value)
    else:
        node[seg] = value


def _value_depth(value, _depth: int = 0) -> int:
    if _depth > RTDB_MAX_VALUE_DEPTH:
        return _depth
    if isinstance(value, dict):
        return max((_value_depth(v, _depth + 1) for v in value.values()), default=_depth)
    if isinstance(value, list):
        return max((_value_depth(v, _depth + 1) for v in value), default=_depth)
    return _depth


def validate_value_depth(value) -> None:
    if _value_depth(value) > RTDB_MAX_VALUE_DEPTH:
        raise RtdbSizeLimitError(f"Value nesting exceeds the {RTDB_MAX_VALUE_DEPTH}-level limit.")


def validate_tree_size(serialized_len: int) -> None:
    if serialized_len > RTDB_MAX_TREE_BYTES:
        raise RtdbSizeLimitError(
            f"This project's Realtime Database tree would exceed the "
            f"{RTDB_MAX_TREE_BYTES // 1_000_000}MB limit."
        )


def generate_push_key() -> str:
    """A Firebase-push-ID-style key: hex-timestamp prefix (fixed-width, so
    lexicographic sort == chronological order) plus a random suffix for
    uniqueness within the same millisecond. Not a cryptographic id — it's an
    ordering-friendly key for tree children, same spirit as Firebase's
    push(), not an exact reimplementation of its 64-char alphabet/algorithm."""
    return f"{int(time.time() * 1000):013x}{secrets.token_hex(4)}"


def rtdb_apply_set(tree: dict, segments: list[str], value) -> dict:
    validate_value_depth(value)
    if not segments:
        return value if isinstance(value, dict) else _reject_non_dict_root(value)
    node = tree
    for seg in segments[:-1]:
        nxt = rtdb_get_child(node, seg)
        if not isinstance(nxt, (dict, list)):
            nxt = {}
            rtdb_set_child(node, seg, nxt)
        node = nxt
    rtdb_set_child(node, segments[-1], value)
    return tree


def _reject_non_dict_root(value):
    raise RtdbPathConflictError(
        "Writing to the root path requires a JSON object — "
        f"got {type(value).__name__}. Write to a sub-path instead."
    )


def rtdb_apply_update(tree: dict, segments: list[str], value: dict) -> dict:
    validate_value_depth(value)
    node = tree
    for seg in segments:
        nxt = rtdb_get_child(node, seg)
        if not isinstance(nxt, (dict, list)):
            nxt = {}
            rtdb_set_child(node, seg, nxt)
        node = nxt
    if not isinstance(node, dict):
        raise RtdbPathConflictError("Can only PATCH-merge into an object, not a list.")
    node.update(value)
    return tree


def rtdb_apply_push(tree: dict, segments: list[str], value) -> tuple[dict, str]:
    """Like rtdb_apply_set, but appends `value` as a new child under a
    generated key instead of an explicit path segment. The target must
    already be a dict, missing, or an empty list (coerced to a dict) —
    pushing into a non-empty list is rejected rather than silently mixing
    index- and key-addressed children in the same node."""
    validate_value_depth(value)
    node = tree
    for seg in segments:
        nxt = rtdb_get_child(node, seg)
        if nxt is None or (isinstance(nxt, list) and not nxt):
            nxt = {}
            rtdb_set_child(node, seg, nxt)
        elif not isinstance(nxt, dict):
            raise RtdbPathConflictError(
                "Can only push into an object (or an empty/missing path) — "
                "this path already holds a non-empty list or a scalar."
            )
        node = nxt
    key = generate_push_key()
    node[key] = value
    return tree, key


def rtdb_apply_delete(tree: dict, segments: list[str]) -> dict:
    if not segments:
        return {}
    node = tree
    for seg in segments[:-1]:
        nxt = rtdb_get_child(node, seg)
        if nxt is None:
            return tree
        node = nxt
    last = segments[-1]
    if isinstance(node, list):
        if last.isdigit() and int(last) < len(node):
            node.pop(int(last))
    elif isinstance(node, dict):
        node.pop(last, None)
    return tree
