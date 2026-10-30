from dataclasses import dataclass
from typing import Final

from flamer.contract import Blocker, DomainActionType, DomainStatus, Pace, Remedy, RunStatus, Tone


@dataclass(frozen=True, slots=True)
class BlockerInfo:
    title: str
    remedies: tuple[Remedy, ...]


@dataclass(frozen=True, slots=True)
class StatusInfo:
    label: str
    tone: Tone


BLOCKER_INFO: Final[dict[Blocker, BlockerInfo]] = {
    "captcha": BlockerInfo("CAPTCHA challenge", ("solved_session", "request_allowlist", "retry")),
    "waf": BlockerInfo("Blocked by firewall", ("slow_down", "request_allowlist", "retry")),
    "robots": BlockerInfo("Disallowed by robots.txt", ("request_permission",)),
    "login": BlockerInfo("Login required", ("add_credentials", "request_allowlist")),
    "dns": BlockerInfo("Domain not found", ("retry",)),
    "tls": BlockerInfo("Certificate problem", ("allow_insecure", "retry")),
    "no_pdfs": BlockerInfo("No PDFs found", ("add_entry_point",)),
    "unstable": BlockerInfo("Site keeps timing out", ("slow_down", "retry")),
}

REMEDY_LABEL: Final[dict[Remedy, str]] = {
    "retry": "Retry now",
    "slow_down": "Retry slower",
    "solved_session": "Solve once & retry",
    "request_allowlist": "Ask publisher to allow us",
    "request_permission": "Request permission",
    "add_credentials": "Use partner login",
    "allow_insecure": "Accept certificate",
    "add_entry_point": "Add publications path",
}

STATUS_INFO: Final[dict[DomainStatus, StatusInfo]] = {
    "queued": StatusInfo("Queued", "muted"),
    "discovering": StatusInfo("Mapping site", "info"),
    "downloading": StatusInfo("Downloading", "info"),
    "processing": StatusInfo("Processing", "info"),
    "backing_off": StatusInfo("Auto-retrying", "warn"),
    "waiting_owner": StatusInfo("Waiting on publisher", "warn"),
    "needs_attention": StatusInfo("Needs you", "danger"),
    "paused": StatusInfo("Paused", "muted"),
    "completed": StatusInfo("Done", "success"),
    "skipped": StatusInfo("Skipped", "muted"),
    "cancelled": StatusInfo("Cancelled", "muted"),
}

RUN_STATUS_LABEL: Final[dict[RunStatus, str]] = {
    "running": "Running",
    "paused": "Paused",
    "blocked": "Waiting for you",
    "completed": "Completed",
    "cancelled": "Cancelled",
}

PACE_FACTOR: Final[dict[Pace, float]] = {"gentle": 0.6, "standard": 1, "aggressive": 1.6}

ACTIVE_STATUSES: Final[tuple[DomainStatus, ...]] = ("discovering", "downloading", "processing", "backing_off")
TERMINAL_STATUSES: Final[tuple[DomainStatus, ...]] = ("completed", "skipped", "cancelled")


def available_actions(status: DomainStatus) -> tuple[DomainActionType, ...]:
    return (*_state_actions(status), "assign", "note")


def _state_actions(status: DomainStatus) -> tuple[DomainActionType, ...]:
    match status:
        case "queued" | "discovering" | "downloading" | "processing" | "backing_off":
            return ("pause", "skip")
        case "paused":
            return ("resume", "skip")
        case "needs_attention":
            return ("resolve", "retry", "skip")
        case "waiting_owner":
            return ("skip",)
        case "skipped":
            return ("retry",)
        case _:
            return ()
