from __future__ import annotations

from pathlib import Path
from typing import Any

import requests

from common.config import Config


class WorkerApiError(RuntimeError):
    pass


def _headers(config: Config) -> dict[str, str]:
    return {"Authorization": f"Bearer {config.worker_api_key}"}


def _json(response: requests.Response) -> dict[str, Any]:
    try:
        payload = response.json()
    except ValueError:
        payload = {"detail": response.text}
    if not response.ok:
        raise WorkerApiError(str(payload.get("detail") or payload))
    return payload


def claim_oldest(config: Config, order_id: str | None = None, redo: bool = False) -> dict[str, Any]:
    if order_id:
        url = f"{config.backend_url}/api/worker/orders/{order_id}/claim"
        payload = {"workerId": config.worker_id, "redo": redo}
    else:
        url = f"{config.backend_url}/api/worker/orders/claim-oldest"
        payload = {"workerId": config.worker_id}
    return _json(requests.post(url, headers={**_headers(config), "Content-Type": "application/json"}, json=payload, timeout=30))


def fetch_order_read_only(config: Config, order_id: str) -> dict[str, Any]:
    """Read an order for local/offline generation without changing backend state."""
    return _json(requests.get(f"{config.backend_url}/api/worker/orders/{order_id}", headers=_headers(config), timeout=30))


def heartbeat(config: Config, order_id: str, notes: str) -> dict[str, Any]:
    url = f"{config.backend_url}/api/worker/orders/{order_id}/start"
    return _json(requests.post(url, headers={**_headers(config), "Content-Type": "application/json"}, json={"workerId": config.worker_id, "notes": notes}, timeout=30))


def download_file(config: Config, url: str, target: Path) -> None:
    response = requests.get(f"{config.backend_url}{url}", headers=_headers(config), timeout=120)
    response.raise_for_status()
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(response.content)


def submit_sample(config: Config, order_id: str, path: Path, pdf: Path, notes: str) -> dict[str, Any]:
    with path.open("rb") as handle, pdf.open("rb") as pdf_handle:
        return _json(requests.post(
            f"{config.backend_url}/api/worker/orders/{order_id}/submit-sample",
            headers=_headers(config),
            data={"worker_id": config.worker_id, "notes": notes},
            files={"sample_file": (path.name, handle, "application/vnd.openxmlformats-officedocument.wordprocessingml.document"), "sample_pdf_file": (pdf.name, pdf_handle, "application/pdf")},
            timeout=600,
        ))


def submit_final(config: Config, order_id: str, files: dict[str, Path], notes: str, sample_status: bool = False) -> dict[str, Any]:
    opened = {field: path.open("rb") for field, path in files.items()}
    try:
        upload = {field: (path.name, opened[field], "application/json" if field == "image_sources_file" else "application/octet-stream") for field, path in files.items()}
        return _json(requests.post(
            f"{config.backend_url}/api/worker/orders/{order_id}/submit-final",
            headers=_headers(config),
            data={"worker_id": config.worker_id, "notes": notes, "replace_existing": "true", "sample_status": str(sample_status).lower()},
            files=upload,
            timeout=600,
        ))
    finally:
        for handle in opened.values():
            handle.close()


def fail_order(config: Config, order_id: str, notes: str) -> None:
    response = requests.post(
        f"{config.backend_url}/api/worker/orders/{order_id}/fail",
        headers={**_headers(config), "Content-Type": "application/json"},
        json={"workerId": config.worker_id, "notes": notes[:1000]},
        timeout=30,
    )
    _json(response)

def record_run(config: Config, order_id: str, payload: dict[str, Any]) -> None:
    _json(requests.post(f"{config.backend_url}/api/worker/orders/{order_id}/runs", headers={**_headers(config), "Content-Type": "application/json"}, json=payload, timeout=30))
