type Json = bool | int | float | str | list[Json] | dict[str, Json] | None


def json_differences(expected: Json, actual: Json, path: str = "$") -> list[str]:
    if isinstance(expected, dict) and isinstance(actual, dict):
        diffs = (
            [f"{path}: keys differ {sorted(expected.keys() ^ actual.keys())}"]
            if expected.keys() != actual.keys()
            else []
        )
        for key in expected.keys() & actual.keys():
            diffs += json_differences(expected[key], actual[key], f"{path}.{key}")
        return diffs
    if isinstance(expected, list) and isinstance(actual, list):
        if len(expected) != len(actual):
            return [f"{path}: length {len(expected)} != {len(actual)}"]
        return [
            d
            for i, (e, a) in enumerate(zip(expected, actual, strict=True))
            for d in json_differences(e, a, f"{path}[{i}]")
        ]
    if type(expected) is not type(actual) or expected != actual:
        return [f"{path}: expected {expected!r}, got {actual!r}"]
    return []
