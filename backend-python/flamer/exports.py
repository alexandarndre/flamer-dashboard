from collections.abc import Iterable, Sequence

from flamer import js
from flamer.catalog import BLOCKER_INFO, STATUS_INFO
from flamer.contract import Issue, RegistryEntry
from flamer.geo import ORG_TYPE_LABEL

type Cell = str | int | None

ISSUE_COLUMNS = [
    "domain",
    "run",
    "blocker",
    "blocked_since",
    "attempt",
    "owner",
    "notes",
    "progress",
    "publisher_declined",
]
DOMAIN_COLUMNS = [
    "domain",
    "organisation",
    "type",
    "city",
    "country",
    "latest_status",
    "latest_run",
    "runs",
    "published",
    "duplicates",
    "rejected",
    "blockers",
    "next_recrawl",
]


def to_csv(rows: Iterable[Sequence[Cell]]) -> str:
    return "".join(",".join(_cell(cell) for cell in row) + "\n" for row in rows)


def _cell(cell: Cell) -> str:
    if cell is None:
        return ""
    text = str(cell)
    return f'"{text.replace('"', '""')}"' if any(ch in text for ch in '",\n') else text


def _iso(t: float | None) -> str | None:
    return None if t is None else js.iso_string(t)


def issues_csv(issues: Iterable[Issue]) -> str:
    return to_csv(
        [
            ISSUE_COLUMNS,
            *(
                [
                    i.domain,
                    i.run_name,
                    BLOCKER_INFO[i.blocker].title,
                    _iso(i.since),
                    i.attempt,
                    i.owner,
                    i.notes,
                    js.js_round(i.progress * 100),
                    "yes" if i.owner_declined else "no",
                ]
                for i in issues
            ),
        ]
    )


def domains_csv(entries: Iterable[RegistryEntry]) -> str:
    return to_csv(
        [
            DOMAIN_COLUMNS,
            *(
                [
                    d.domain,
                    d.org.name,
                    ORG_TYPE_LABEL[d.org.type],
                    None if d.org.place is None else d.org.place.city,
                    None if d.org.place is None else d.org.place.country_name,
                    STATUS_INFO[d.last_status].label,
                    d.last_run_name,
                    d.runs,
                    d.published,
                    d.duplicates,
                    d.rejected,
                    "; ".join(BLOCKER_INFO[b].title for b in d.blockers),
                    _iso(d.next_recrawl_at),
                ]
                for d in entries
            ),
        ]
    )
