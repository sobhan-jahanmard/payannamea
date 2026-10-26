"""Keep file identity separate from source passages that support factual claims."""
from copy import deepcopy


def metadata_values(sources):
    return {f"{source['id']}:metadata:original_name": source.get("original_name") or source["name"]
            for source in sources["sources"]}


def normalize_metadata_evidence(spec, sources):
    """Migrate only exact, verified file-name references; never discard bad quotes."""
    result = deepcopy(spec)
    values = metadata_values(sources)
    aliases = {}
    for source in sources["sources"]:
        canonical = f"{source['id']}:metadata:original_name"
        for alias in (canonical, f"{source['id']}.original_name", f"{source['id']}:original_name"):
            aliases[alias] = canonical
    for slide in result.get("slides", []):
        factual, metadata = [], list(slide.get("metadata_evidence", []))
        for item in slide.get("evidence", []):
            canonical = aliases.get(item.get("locator"))
            if canonical and item.get("quote") == values[canonical]:
                reference = {"locator": canonical, "quote": values[canonical]}
                if reference not in metadata:
                    metadata.append(reference)
            else:
                factual.append(item)
        if "evidence" in slide:
            slide["evidence"] = factual
        if metadata:
            slide["metadata_evidence"] = metadata
    return result


def validate_metadata_evidence(slide, sources, number):
    values = metadata_values(sources)
    references = slide.get("metadata_evidence", [])
    if not isinstance(references, list):
        raise ValueError(f"Slide {number}: metadata_evidence must be an array")
    for item in references:
        if not isinstance(item, dict) or item.get("locator") not in values or item.get("quote") != values[item["locator"]]:
            raise ValueError(f"Slide {number}: file metadata reference does not match the original source name")
