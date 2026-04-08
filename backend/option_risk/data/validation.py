"""Общие структуры для журналов валидации и предупреждений."""
from __future__ import annotations

from dataclasses import dataclass


@dataclass
class ValidationMessage:
    """Сообщение в журнале проверки данных."""

    severity: str  # INFO | WARNING | ERROR
    message: str
    row: int | None = None
    field: str | None = None


__all__ = ["ValidationMessage"]
