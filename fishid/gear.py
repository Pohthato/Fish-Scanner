"""Saved gear (things of known length the user often has in photos)."""
from __future__ import annotations

import json
import threading
import uuid
from pathlib import Path

from pydantic import BaseModel, Field

from fishid.config import USER_DIR


class GearIn(BaseModel):
    name: str = Field(min_length=1, max_length=60)
    length_in: float = Field(gt=0.5, lt=120)


class Gear(GearIn):
    id: str


class GearStore:
    def __init__(self, path: Path | None = None):
        self.path = path or USER_DIR / "gear.json"
        self._lock = threading.Lock()

    def _read(self) -> list[dict]:
        try:
            return json.loads(self.path.read_text(encoding="utf-8"))
        except FileNotFoundError:
            return []

    def _write(self, items: list[dict]) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        tmp = self.path.with_suffix(".tmp")
        tmp.write_text(json.dumps(items, indent=2), encoding="utf-8")
        tmp.replace(self.path)

    def list(self) -> list[Gear]:
        return [Gear(**g) for g in self._read()]

    def get_many(self, ids: list[str]) -> list[dict]:
        wanted = set(ids)
        return [g for g in self._read() if g["id"] in wanted]

    def add(self, item: GearIn) -> Gear:
        with self._lock:
            items = self._read()
            gear = Gear(id=uuid.uuid4().hex[:10], **item.model_dump())
            items.append(gear.model_dump())
            self._write(items)
            return gear

    def update(self, gear_id: str, item: GearIn) -> Gear:
        with self._lock:
            items = self._read()
            for g in items:
                if g["id"] == gear_id:
                    g.update(item.model_dump())
                    self._write(items)
                    return Gear(**g)
        raise KeyError(gear_id)

    def delete(self, gear_id: str) -> None:
        with self._lock:
            items = self._read()
            kept = [g for g in items if g["id"] != gear_id]
            if len(kept) == len(items):
                raise KeyError(gear_id)
            self._write(kept)
