def diff_workspaces(source_docs: list[dict], target_docs: list[dict]) -> dict:
    """Compare documents from two workspaces, keyed by (collection_id, document_id).

    source_docs/target_docs: [{"collection_id", "document_id", "data"}, ...]
    """
    source_by_key = {(d["collection_id"], d["document_id"]): d["data"] for d in source_docs}
    target_by_key = {(d["collection_id"], d["document_id"]): d["data"] for d in target_docs}

    result: dict[str, dict[str, list]] = {}

    def bucket(collection_id: str) -> dict[str, list]:
        return result.setdefault(
            collection_id, {"source_only": [], "target_only": [], "modified": []}
        )

    for key in source_by_key.keys() | target_by_key.keys():
        collection_id, document_id = key
        source_data = source_by_key.get(key)
        target_data = target_by_key.get(key)

        if source_data is not None and target_data is None:
            bucket(collection_id)["source_only"].append(
                {"document_id": document_id, "data": source_data}
            )
        elif source_data is None and target_data is not None:
            bucket(collection_id)["target_only"].append(
                {"document_id": document_id, "data": target_data}
            )
        elif source_data != target_data:
            changed_fields = sorted(
                k
                for k in source_data.keys() | target_data.keys()
                if source_data.get(k) != target_data.get(k)
            )
            bucket(collection_id)["modified"].append(
                {
                    "document_id": document_id,
                    "source_data": source_data,
                    "target_data": target_data,
                    "changed_fields": changed_fields,
                }
            )

    return result
