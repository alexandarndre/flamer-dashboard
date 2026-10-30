import ipaddress
import re
import unicodedata
from typing import Final

import idna

SPECIAL_SCHEMES: Final = frozenset({"ftp", "file", "http", "https", "ws", "wss"})
_FORBIDDEN_HOST: Final = frozenset("\x00\t\n\r #/:<>?@[\\]^|")
_FORBIDDEN_DOMAIN: Final = _FORBIDDEN_HOST | {chr(c) for c in range(0x20)} | {"%", "\x7f"}
_C0_OR_SPACE: Final = "".join(chr(c) for c in range(0x21))
_PERCENT: Final = re.compile(rb"%([0-9A-Fa-f]{2})")
_DRIVE_LETTER: Final = re.compile(r"[A-Za-z][:|]")
_PORT: Final = re.compile(r"[0-9]*")
_RTL: Final = frozenset({"R", "AL", "AN"})


def hostname(url: str) -> str | None:
    text = url.encode("utf-16", "surrogatepass").decode("utf-16", "replace").strip(_C0_OR_SPACE)
    text = text.replace("\t", "").replace("\n", "").replace("\r", "")
    scheme, _, rest = text.partition(":")
    scheme = scheme.lower()
    if scheme == "file":
        return _file_host(rest[2:])
    if scheme in SPECIAL_SCHEMES:
        return _authority_host(rest.lstrip("/\\"), "/\\?#", special=True)
    return _authority_host(rest[2:], "/?#", special=False)


def _until(text: str, delimiters: str) -> str:
    return text[: next((i for i, ch in enumerate(text) if ch in delimiters), len(text))]


def _authority_host(rest: str, delimiters: str, *, special: bool) -> str | None:
    authority = _until(rest, delimiters)
    if "@" in authority:
        authority = authority.rsplit("@", 1)[1]
        if authority == "":
            return None
    host, port = _split_port(authority)
    if host == "" and (special or port is not None):
        return None
    if port is not None and (_PORT.fullmatch(port) is None or (port != "" and int(port) > 65535)):
        return None
    return _parse_host(host, special=special)


def _split_port(authority: str) -> tuple[str, str | None]:
    inside_brackets = False
    for i, ch in enumerate(authority):
        if ch == ":" and not inside_brackets:
            return authority[:i], authority[i + 1 :]
        if ch == "[":
            inside_brackets = True
        elif ch == "]":
            inside_brackets = False
    return authority, None


def _file_host(rest: str) -> str | None:
    buffer = _until(rest, "/\\?#")
    if buffer == "" or _DRIVE_LETTER.fullmatch(buffer):
        return ""
    host = _parse_host(buffer, special=True)
    return "" if host == "localhost" else host


def _parse_host(text: str, *, special: bool) -> str | None:
    if text.startswith("["):
        return _ipv6(text[1:-1]) if text.endswith("]") else None
    if not special:
        return _opaque_host(text)
    raw = _PERCENT.sub(lambda m: bytes([int(m.group(1), 16)]), text.encode("utf-8"))
    ascii_domain = _domain_to_ascii(raw.decode("utf-8", "replace"))
    if ascii_domain is None or any(ch in _FORBIDDEN_DOMAIN for ch in ascii_domain):
        return None
    return _ipv4(ascii_domain) if _ends_in_number(ascii_domain) else ascii_domain


def _opaque_host(text: str) -> str | None:
    if any(ch in _FORBIDDEN_HOST for ch in text):
        return None
    return "".join(
        "".join(f"%{b:02X}" for b in ch.encode("utf-8")) if ord(ch) < 0x20 or ord(ch) > 0x7E else ch for ch in text
    )


def _ipv6(text: str) -> str | None:
    if "%" in text:
        return None
    try:
        return f"[{ipaddress.IPv6Address(text).compressed}]"
    except ValueError:
        return None


def _domain_to_ascii(domain: str) -> str | None:
    result = domain.lower() if domain.isascii() else _uts46_to_ascii(domain)
    return None if result == "" else result


def _uts46_to_ascii(domain: str) -> str | None:
    try:
        labels = idna.uts46_remap(domain, std3_rules=False).split(".")
        unicode_labels = [_decode_label(label) for label in labels]
        bidi = any(unicodedata.bidirectional(ch) in _RTL for label in unicode_labels for ch in label)
        for label in unicode_labels:
            if not label.isascii():
                _validate_label(label, bidi=bidi)
        return ".".join(
            label if label.isascii() else "xn--" + label.encode("punycode").decode("ascii") for label in labels
        )
    except UnicodeError:
        return None


def _decode_label(label: str) -> str:
    if not label.startswith("xn--"):
        return label
    decoded = label[4:].encode("ascii").decode("punycode")
    if decoded.isascii() or idna.uts46_remap(decoded, std3_rules=False) != decoded:
        raise idna.IDNAError("Invalid A-label")
    return decoded


def _validate_label(label: str, *, bidi: bool) -> None:
    if not unicodedata.is_normalized("NFC", label):
        raise idna.IDNAError("Invalid label")
    idna.check_initial_combiner(label)
    for pos, ch in enumerate(label):
        if ord(ch) in (0x200C, 0x200D) and not idna.valid_contextj(label, pos):
            raise idna.IDNAError("Invalid joiner")
    if bidi:
        idna.check_bidi(label, check_ltr=True)


def _ends_in_number(domain: str) -> bool:
    parts = domain.split(".")
    if parts[-1] == "":
        if len(parts) == 1:
            return False
        parts.pop()
    last = parts[-1]
    return (last != "" and last.isascii() and last.isdigit()) or _ipv4_number(last) is not None


def _ipv4_number(text: str) -> int | None:
    if text == "":
        return None
    radix, digits = 10, "0123456789"
    if len(text) >= 2 and text[:2] in ("0x", "0X"):
        text, radix, digits = text[2:], 16, "0123456789abcdefABCDEF"
    elif len(text) >= 2 and text[0] == "0":
        text, radix, digits = text[1:], 8, "01234567"
    if text == "":
        return 0
    if any(ch not in digits for ch in text):
        return None
    return int(text, radix)


def _ipv4(domain: str) -> str | None:
    parts = domain.split(".")
    if parts[-1] == "" and len(parts) > 1:
        parts.pop()
    if len(parts) > 4:
        return None
    numbers: list[int] = []
    for part in parts:
        number = _ipv4_number(part)
        if number is None:
            return None
        numbers.append(number)
    if any(n > 255 for n in numbers[:-1]) or numbers[-1] >= 256 ** (5 - len(numbers)):
        return None
    address = numbers[-1] + sum(n * 256 ** (3 - i) for i, n in enumerate(numbers[:-1]))
    return str(ipaddress.IPv4Address(address))
