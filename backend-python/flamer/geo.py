from dataclasses import dataclass
from typing import Final

from flamer.contract import GeoPlace, OrgInfo, OrgType


@dataclass(frozen=True, slots=True)
class City:
    name: str
    lat: float
    lon: float


@dataclass(frozen=True, slots=True)
class Country:
    name: str
    iso: str
    capital: City


@dataclass(frozen=True, slots=True)
class KnownOrg:
    name: str
    type: OrgType
    city: str


COUNTRIES: Final[dict[str, Country]] = {
    "AE": Country("United Arab Emirates", "784", City("Abu Dhabi", 24.45, 54.38)),
    "AR": Country("Argentina", "032", City("Buenos Aires", -34.6, -58.38)),
    "AT": Country("Austria", "040", City("Vienna", 48.21, 16.37)),
    "AU": Country("Australia", "036", City("Canberra", -35.28, 149.13)),
    "BE": Country("Belgium", "056", City("Brussels", 50.85, 4.35)),
    "BR": Country("Brazil", "076", City("Brasília", -15.79, -47.88)),
    "CA": Country("Canada", "124", City("Ottawa", 45.42, -75.7)),
    "CH": Country("Switzerland", "756", City("Bern", 46.95, 7.45)),
    "CI": Country("Côte d’Ivoire", "384", City("Abidjan", 5.36, -4.01)),
    "CN": Country("China", "156", City("Beijing", 39.9, 116.4)),
    "CZ": Country("Czechia", "203", City("Prague", 50.08, 14.44)),
    "DE": Country("Germany", "276", City("Berlin", 52.52, 13.4)),
    "DK": Country("Denmark", "208", City("Copenhagen", 55.68, 12.57)),
    "EG": Country("Egypt", "818", City("Cairo", 30.04, 31.24)),
    "ES": Country("Spain", "724", City("Madrid", 40.42, -3.7)),
    "FI": Country("Finland", "246", City("Helsinki", 60.17, 24.94)),
    "FR": Country("France", "250", City("Paris", 48.86, 2.35)),
    "GB": Country("United Kingdom", "826", City("London", 51.51, -0.13)),
    "GR": Country("Greece", "300", City("Athens", 37.98, 23.73)),
    "ID": Country("Indonesia", "360", City("Jakarta", -6.21, 106.85)),
    "IE": Country("Ireland", "372", City("Dublin", 53.35, -6.26)),
    "IN": Country("India", "356", City("New Delhi", 28.61, 77.21)),
    "IT": Country("Italy", "380", City("Rome", 41.9, 12.5)),
    "JP": Country("Japan", "392", City("Tokyo", 35.68, 139.69)),
    "KE": Country("Kenya", "404", City("Nairobi", -1.29, 36.82)),
    "KR": Country("South Korea", "410", City("Seoul", 37.57, 126.98)),
    "MX": Country("Mexico", "484", City("Mexico City", 19.43, -99.13)),
    "MY": Country("Malaysia", "458", City("Kuala Lumpur", 3.14, 101.69)),
    "NG": Country("Nigeria", "566", City("Abuja", 9.08, 7.4)),
    "NL": Country("Netherlands", "528", City("Amsterdam", 52.37, 4.9)),
    "NO": Country("Norway", "578", City("Oslo", 59.91, 10.75)),
    "NZ": Country("New Zealand", "554", City("Wellington", -41.29, 174.78)),
    "PH": Country("Philippines", "608", City("Manila", 14.6, 120.98)),
    "PL": Country("Poland", "616", City("Warsaw", 52.23, 21.01)),
    "PT": Country("Portugal", "620", City("Lisbon", 38.72, -9.14)),
    "SA": Country("Saudi Arabia", "682", City("Riyadh", 24.71, 46.68)),
    "SE": Country("Sweden", "752", City("Stockholm", 59.33, 18.07)),
    "SG": Country("Singapore", "702", City("Singapore", 1.35, 103.82)),
    "TR": Country("Türkiye", "792", City("Ankara", 39.93, 32.85)),
    "UA": Country("Ukraine", "804", City("Kyiv", 50.45, 30.52)),
    "US": Country("United States", "840", City("Washington, D.C.", 38.9, -77.04)),
    "ZA": Country("South Africa", "710", City("Pretoria", -25.75, 28.19)),
}

CITIES: Final[dict[str, tuple[City, str]]] = {
    "washington": (City("Washington, D.C.", 38.9, -77.04), "US"),
    "newYork": (City("New York", 40.71, -74.01), "US"),
    "santaMonica": (City("Santa Monica", 34.02, -118.49), "US"),
    "seattle": (City("Seattle", 47.61, -122.33), "US"),
    "atlanta": (City("Atlanta", 33.75, -84.39), "US"),
    "basalt": (City("Basalt", 39.37, -107.03), "US"),
    "suitland": (City("Suitland", 38.85, -76.92), "US"),
    "geneva": (City("Geneva", 46.2, 6.15), "CH"),
    "basel": (City("Basel", 47.56, 7.59), "CH"),
    "paris": (City("Paris", 48.86, 2.35), "FR"),
    "rome": (City("Rome", 41.9, 12.5), "IT"),
    "parma": (City("Parma", 44.8, 10.33), "IT"),
    "vienna": (City("Vienna", 48.21, 16.37), "AT"),
    "manila": (City("Manila", 14.58, 121.06), "PH"),
    "abidjan": (City("Abidjan", 5.36, -4.01), "CI"),
    "london": (City("London", 51.51, -0.13), "GB"),
    "woking": (City("Woking", 51.32, -0.56), "GB"),
    "newport": (City("Newport", 51.58, -3.0), "GB"),
    "frankfurt": (City("Frankfurt", 50.11, 8.68), "DE"),
    "wiesbaden": (City("Wiesbaden", 50.08, 8.24), "DE"),
    "berlin": (City("Berlin", 52.52, 13.4), "DE"),
    "nairobi": (City("Nairobi", -1.29, 36.82), "KE"),
    "brussels": (City("Brussels", 50.85, 4.35), "BE"),
    "stockholm": (City("Stockholm", 59.33, 18.07), "SE"),
    "canberra": (City("Canberra", -35.28, 149.13), "AU"),
    "ottawa": (City("Ottawa", 45.42, -75.7), "CA"),
    "abuDhabi": (City("Abu Dhabi", 24.45, 54.38), "AE"),
    "copenhagen": (City("Copenhagen", 55.68, 12.57), "DK"),
    "dublin": (City("Dublin", 53.35, -6.26), "IE"),
    "amsterdam": (City("Amsterdam", 52.37, 4.9), "NL"),
    "thessaloniki": (City("Thessaloniki", 40.64, 22.94), "GR"),
}

KNOWN: Final[dict[str, KnownOrg]] = {
    "worldbank.org": KnownOrg("World Bank", "intergovernmental", "washington"),
    "imf.org": KnownOrg("International Monetary Fund", "intergovernmental", "washington"),
    "oecd.org": KnownOrg("OECD", "intergovernmental", "paris"),
    "who.int": KnownOrg("World Health Organization", "intergovernmental", "geneva"),
    "unesco.org": KnownOrg("UNESCO", "intergovernmental", "paris"),
    "undp.org": KnownOrg("UN Development Programme", "intergovernmental", "newYork"),
    "unicef.org": KnownOrg("UNICEF", "intergovernmental", "newYork"),
    "ilo.org": KnownOrg("International Labour Organization", "intergovernmental", "geneva"),
    "fao.org": KnownOrg("Food and Agriculture Organization", "intergovernmental", "rome"),
    "wto.org": KnownOrg("World Trade Organization", "intergovernmental", "geneva"),
    "unhcr.org": KnownOrg("UNHCR", "intergovernmental", "geneva"),
    "iaea.org": KnownOrg("International Atomic Energy Agency", "intergovernmental", "vienna"),
    "wipo.int": KnownOrg("World Intellectual Property Organization", "intergovernmental", "geneva"),
    "adb.org": KnownOrg("Asian Development Bank", "intergovernmental", "manila"),
    "afdb.org": KnownOrg("African Development Bank", "intergovernmental", "abidjan"),
    "iadb.org": KnownOrg("Inter-American Development Bank", "intergovernmental", "washington"),
    "ebrd.com": KnownOrg("EBRD", "intergovernmental", "london"),
    "ecb.europa.eu": KnownOrg("European Central Bank", "government", "frankfurt"),
    "bis.org": KnownOrg("Bank for International Settlements", "intergovernmental", "basel"),
    "unep.org": KnownOrg("UN Environment Programme", "intergovernmental", "nairobi"),
    "brookings.edu": KnownOrg("Brookings Institution", "think_tank", "washington"),
    "rand.org": KnownOrg("RAND Corporation", "think_tank", "santaMonica"),
    "chathamhouse.org": KnownOrg("Chatham House", "think_tank", "london"),
    "carnegieendowment.org": KnownOrg("Carnegie Endowment", "think_tank", "washington"),
    "csis.org": KnownOrg("CSIS", "think_tank", "washington"),
    "cfr.org": KnownOrg("Council on Foreign Relations", "think_tank", "newYork"),
    "urban.org": KnownOrg("Urban Institute", "think_tank", "washington"),
    "pewresearch.org": KnownOrg("Pew Research Center", "think_tank", "washington"),
    "odi.org": KnownOrg("ODI", "think_tank", "london"),
    "iied.org": KnownOrg("IIED", "think_tank", "london"),
    "wri.org": KnownOrg("World Resources Institute", "think_tank", "washington"),
    "ifpri.org": KnownOrg("IFPRI", "think_tank", "washington"),
    "cgdev.org": KnownOrg("Center for Global Development", "think_tank", "washington"),
    "piie.com": KnownOrg("Peterson Institute", "think_tank", "washington"),
    "bruegel.org": KnownOrg("Bruegel", "think_tank", "brussels"),
    "sipri.org": KnownOrg("SIPRI", "think_tank", "stockholm"),
    "e3g.org": KnownOrg("E3G", "think_tank", "london"),
    "iea.org": KnownOrg("International Energy Agency", "intergovernmental", "paris"),
    "irena.org": KnownOrg("IRENA", "intergovernmental", "abuDhabi"),
    "ember-energy.org": KnownOrg("Ember", "think_tank", "london"),
    "rmi.org": KnownOrg("RMI", "think_tank", "basalt"),
    "climateanalytics.org": KnownOrg("Climate Analytics", "think_tank", "berlin"),
    "msf.org": KnownOrg("Médecins Sans Frontières", "ngo", "geneva"),
    "path.org": KnownOrg("PATH", "ngo", "seattle"),
    "gavi.org": KnownOrg("Gavi", "ngo", "geneva"),
    "theglobalfund.org": KnownOrg("The Global Fund", "ngo", "geneva"),
    "ippf.org": KnownOrg("IPPF", "ngo", "london"),
    "icrc.org": KnownOrg("ICRC", "ngo", "geneva"),
    "ifrc.org": KnownOrg("IFRC", "ngo", "geneva"),
    "savethechildren.net": KnownOrg("Save the Children International", "ngo", "london"),
    "oxfam.org": KnownOrg("Oxfam International", "ngo", "nairobi"),
    "care.org": KnownOrg("CARE USA", "ngo", "atlanta"),
    "plan-international.org": KnownOrg("Plan International", "ngo", "woking"),
    "wateraid.org": KnownOrg("WaterAid", "ngo", "london"),
    "ons.gov.uk": KnownOrg("Office for National Statistics", "government", "newport"),
    "census.gov": KnownOrg("US Census Bureau", "government", "suitland"),
    "abs.gov.au": KnownOrg("Australian Bureau of Statistics", "government", "canberra"),
    "statcan.gc.ca": KnownOrg("Statistics Canada", "government", "ottawa"),
    "destatis.de": KnownOrg("Destatis", "government", "wiesbaden"),
    "insee.fr": KnownOrg("INSEE", "government", "paris"),
    "eea.europa.eu": KnownOrg("European Environment Agency", "government", "copenhagen"),
    "eurofound.europa.eu": KnownOrg("Eurofound", "government", "dublin"),
    "efsa.europa.eu": KnownOrg("European Food Safety Authority", "government", "parma"),
    "ema.europa.eu": KnownOrg("European Medicines Agency", "government", "amsterdam"),
    "ecdc.europa.eu": KnownOrg("ECDC", "government", "stockholm"),
    "cedefop.europa.eu": KnownOrg("Cedefop", "government", "thessaloniki"),
}

SUFFIXES: Final[tuple[tuple[str, str | None, OrgType], ...]] = (
    (".europa.eu", "BE", "government"),
    (".gov.uk", "GB", "government"),
    (".ac.uk", "GB", "academic"),
    (".gouv.fr", "FR", "government"),
    (".gc.ca", "CA", "government"),
    (".gov.au", "AU", "government"),
    (".edu.au", "AU", "academic"),
    (".govt.nz", "NZ", "government"),
    (".gov", "US", "government"),
    (".mil", "US", "government"),
    (".edu", "US", "academic"),
    (".int", None, "intergovernmental"),
)

TLD_COUNTRY: Final[dict[str, str]] = {"uk": "GB"}

ORG_TYPE_LABEL: Final[dict[OrgType, str]] = {
    "intergovernmental": "Intergovernmental",
    "think_tank": "Think tank",
    "ngo": "Non-profit",
    "government": "Public agency",
    "academic": "Academic",
    "unknown": "Other",
}


def _place(code: str, city: City | None) -> GeoPlace:
    country = COUNTRIES[code]
    spot = country.capital if city is None else city
    return GeoPlace(
        city=None if city is None else spot.name,
        country=code,
        country_name=country.name,
        iso=country.iso,
        lat=spot.lat,
        lon=spot.lon,
    )


def org_of(domain: str) -> OrgInfo:
    known = KNOWN.get(domain)
    if known is not None:
        city, code = CITIES[known.city]
        return OrgInfo(name=known.name, type=known.type, place=_place(code, city))
    for suffix, code_or_none, org_type in SUFFIXES:
        if domain.endswith(suffix):
            return OrgInfo(name=None, type=org_type, place=None if code_or_none is None else _place(code_or_none, None))
    tld = domain.rsplit(".", maxsplit=1)[-1].upper()
    code = TLD_COUNTRY.get(tld.lower(), tld)
    return OrgInfo(name=None, type="unknown", place=_place(code, None) if code in COUNTRIES else None)
