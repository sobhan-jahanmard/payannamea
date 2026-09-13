from __future__ import annotations

import importlib
from types import ModuleType


_PROFILE_MODULES = {
    "پایان‌نامه کارشناسی": "bachelor_thesis.profile",
    "پایان‌نامه کارشناسی ارشد": "master_thesis.profile",
    "پروپوزال پایان‌نامه": "thesis_proposal.profile",
    "تحقیق دانشگاهی": "university_research.profile",
    "ارائه و پاورپوینت": "presentation.profile",
}


def profile_for(order: dict[str, object]) -> ModuleType:
    order_type = str(order.get("order_type") or "").strip()
    module_name = _PROFILE_MODULES.get(order_type)
    if not module_name:
        supported = "، ".join(_PROFILE_MODULES)
        raise RuntimeError(f"Unsupported order type: {order_type or 'missing'}. Supported types: {supported}.")
    return importlib.import_module(module_name)
