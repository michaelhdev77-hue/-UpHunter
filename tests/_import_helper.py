"""Helper for importing modules from specific services.

Each service uses `app` as its package name, so they conflict in sys.modules.
This helper clears stale `app.*` entries and adjusts sys.path before import.
"""
from __future__ import annotations

import importlib
import sys
from pathlib import Path

SERVICES_ROOT = Path(__file__).resolve().parent.parent / "services"


def import_from_service(service_name: str, module_path: str):
    """Import a module from a specific service, clearing cached `app` modules.

    Usage::

        scorer = import_from_service("ai-scoring", "app.scorer")
        _build_prompt = scorer._build_prompt

    Args:
        service_name: Directory name under services/ (e.g. "jobs", "ai-scoring").
        module_path: Dotted module path (e.g. "app.scorer", "app.models").

    Returns:
        The imported module object.
    """
    service_dir = str(SERVICES_ROOT / service_name)

    # Remove cached app.* modules from other services
    to_remove = [key for key in sys.modules if key == "app" or key.startswith("app.")]
    for key in to_remove:
        del sys.modules[key]

    # Ensure service dir is at the front of sys.path
    if service_dir in sys.path:
        sys.path.remove(service_dir)
    sys.path.insert(0, service_dir)

    return importlib.import_module(module_path)
