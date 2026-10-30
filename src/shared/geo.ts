import type { GeoPlace, OrgInfo, OrgType } from './contract'

type Country = { name: string; iso: string; capital: [string, number, number] }

const COUNTRIES: Record<string, Country> = {
  AE: { name: 'United Arab Emirates', iso: '784', capital: ['Abu Dhabi', 24.45, 54.38] },
  AR: { name: 'Argentina', iso: '032', capital: ['Buenos Aires', -34.6, -58.38] },
  AT: { name: 'Austria', iso: '040', capital: ['Vienna', 48.21, 16.37] },
  AU: { name: 'Australia', iso: '036', capital: ['Canberra', -35.28, 149.13] },
  BE: { name: 'Belgium', iso: '056', capital: ['Brussels', 50.85, 4.35] },
  BR: { name: 'Brazil', iso: '076', capital: ['Brasília', -15.79, -47.88] },
  CA: { name: 'Canada', iso: '124', capital: ['Ottawa', 45.42, -75.7] },
  CH: { name: 'Switzerland', iso: '756', capital: ['Bern', 46.95, 7.45] },
  CI: { name: 'Côte d’Ivoire', iso: '384', capital: ['Abidjan', 5.36, -4.01] },
  CN: { name: 'China', iso: '156', capital: ['Beijing', 39.9, 116.4] },
  CZ: { name: 'Czechia', iso: '203', capital: ['Prague', 50.08, 14.44] },
  DE: { name: 'Germany', iso: '276', capital: ['Berlin', 52.52, 13.4] },
  DK: { name: 'Denmark', iso: '208', capital: ['Copenhagen', 55.68, 12.57] },
  EG: { name: 'Egypt', iso: '818', capital: ['Cairo', 30.04, 31.24] },
  ES: { name: 'Spain', iso: '724', capital: ['Madrid', 40.42, -3.7] },
  FI: { name: 'Finland', iso: '246', capital: ['Helsinki', 60.17, 24.94] },
  FR: { name: 'France', iso: '250', capital: ['Paris', 48.86, 2.35] },
  GB: { name: 'United Kingdom', iso: '826', capital: ['London', 51.51, -0.13] },
  GR: { name: 'Greece', iso: '300', capital: ['Athens', 37.98, 23.73] },
  ID: { name: 'Indonesia', iso: '360', capital: ['Jakarta', -6.21, 106.85] },
  IE: { name: 'Ireland', iso: '372', capital: ['Dublin', 53.35, -6.26] },
  IN: { name: 'India', iso: '356', capital: ['New Delhi', 28.61, 77.21] },
  IT: { name: 'Italy', iso: '380', capital: ['Rome', 41.9, 12.5] },
  JP: { name: 'Japan', iso: '392', capital: ['Tokyo', 35.68, 139.69] },
  KE: { name: 'Kenya', iso: '404', capital: ['Nairobi', -1.29, 36.82] },
  KR: { name: 'South Korea', iso: '410', capital: ['Seoul', 37.57, 126.98] },
  MX: { name: 'Mexico', iso: '484', capital: ['Mexico City', 19.43, -99.13] },
  MY: { name: 'Malaysia', iso: '458', capital: ['Kuala Lumpur', 3.14, 101.69] },
  NG: { name: 'Nigeria', iso: '566', capital: ['Abuja', 9.08, 7.4] },
  NL: { name: 'Netherlands', iso: '528', capital: ['Amsterdam', 52.37, 4.9] },
  NO: { name: 'Norway', iso: '578', capital: ['Oslo', 59.91, 10.75] },
  NZ: { name: 'New Zealand', iso: '554', capital: ['Wellington', -41.29, 174.78] },
  PH: { name: 'Philippines', iso: '608', capital: ['Manila', 14.6, 120.98] },
  PL: { name: 'Poland', iso: '616', capital: ['Warsaw', 52.23, 21.01] },
  PT: { name: 'Portugal', iso: '620', capital: ['Lisbon', 38.72, -9.14] },
  SA: { name: 'Saudi Arabia', iso: '682', capital: ['Riyadh', 24.71, 46.68] },
  SE: { name: 'Sweden', iso: '752', capital: ['Stockholm', 59.33, 18.07] },
  SG: { name: 'Singapore', iso: '702', capital: ['Singapore', 1.35, 103.82] },
  TR: { name: 'Türkiye', iso: '792', capital: ['Ankara', 39.93, 32.85] },
  UA: { name: 'Ukraine', iso: '804', capital: ['Kyiv', 50.45, 30.52] },
  US: { name: 'United States', iso: '840', capital: ['Washington, D.C.', 38.9, -77.04] },
  ZA: { name: 'South Africa', iso: '710', capital: ['Pretoria', -25.75, 28.19] },
}

const CITIES: Record<string, [string, string, number, number]> = {
  washington: ['Washington, D.C.', 'US', 38.9, -77.04],
  newYork: ['New York', 'US', 40.71, -74.01],
  santaMonica: ['Santa Monica', 'US', 34.02, -118.49],
  seattle: ['Seattle', 'US', 47.61, -122.33],
  atlanta: ['Atlanta', 'US', 33.75, -84.39],
  basalt: ['Basalt', 'US', 39.37, -107.03],
  suitland: ['Suitland', 'US', 38.85, -76.92],
  geneva: ['Geneva', 'CH', 46.2, 6.15],
  basel: ['Basel', 'CH', 47.56, 7.59],
  paris: ['Paris', 'FR', 48.86, 2.35],
  rome: ['Rome', 'IT', 41.9, 12.5],
  parma: ['Parma', 'IT', 44.8, 10.33],
  vienna: ['Vienna', 'AT', 48.21, 16.37],
  manila: ['Manila', 'PH', 14.58, 121.06],
  abidjan: ['Abidjan', 'CI', 5.36, -4.01],
  london: ['London', 'GB', 51.51, -0.13],
  woking: ['Woking', 'GB', 51.32, -0.56],
  newport: ['Newport', 'GB', 51.58, -3.0],
  frankfurt: ['Frankfurt', 'DE', 50.11, 8.68],
  wiesbaden: ['Wiesbaden', 'DE', 50.08, 8.24],
  berlin: ['Berlin', 'DE', 52.52, 13.4],
  nairobi: ['Nairobi', 'KE', -1.29, 36.82],
  brussels: ['Brussels', 'BE', 50.85, 4.35],
  stockholm: ['Stockholm', 'SE', 59.33, 18.07],
  canberra: ['Canberra', 'AU', -35.28, 149.13],
  ottawa: ['Ottawa', 'CA', 45.42, -75.7],
  abuDhabi: ['Abu Dhabi', 'AE', 24.45, 54.38],
  copenhagen: ['Copenhagen', 'DK', 55.68, 12.57],
  dublin: ['Dublin', 'IE', 53.35, -6.26],
  amsterdam: ['Amsterdam', 'NL', 52.37, 4.9],
  thessaloniki: ['Thessaloniki', 'GR', 40.64, 22.94],
}

const KNOWN: Record<string, [string, OrgType, keyof typeof CITIES]> = {
  'worldbank.org': ['World Bank', 'intergovernmental', 'washington'],
  'imf.org': ['International Monetary Fund', 'intergovernmental', 'washington'],
  'oecd.org': ['OECD', 'intergovernmental', 'paris'],
  'who.int': ['World Health Organization', 'intergovernmental', 'geneva'],
  'unesco.org': ['UNESCO', 'intergovernmental', 'paris'],
  'undp.org': ['UN Development Programme', 'intergovernmental', 'newYork'],
  'unicef.org': ['UNICEF', 'intergovernmental', 'newYork'],
  'ilo.org': ['International Labour Organization', 'intergovernmental', 'geneva'],
  'fao.org': ['Food and Agriculture Organization', 'intergovernmental', 'rome'],
  'wto.org': ['World Trade Organization', 'intergovernmental', 'geneva'],
  'unhcr.org': ['UNHCR', 'intergovernmental', 'geneva'],
  'iaea.org': ['International Atomic Energy Agency', 'intergovernmental', 'vienna'],
  'wipo.int': ['World Intellectual Property Organization', 'intergovernmental', 'geneva'],
  'adb.org': ['Asian Development Bank', 'intergovernmental', 'manila'],
  'afdb.org': ['African Development Bank', 'intergovernmental', 'abidjan'],
  'iadb.org': ['Inter-American Development Bank', 'intergovernmental', 'washington'],
  'ebrd.com': ['EBRD', 'intergovernmental', 'london'],
  'ecb.europa.eu': ['European Central Bank', 'government', 'frankfurt'],
  'bis.org': ['Bank for International Settlements', 'intergovernmental', 'basel'],
  'unep.org': ['UN Environment Programme', 'intergovernmental', 'nairobi'],
  'brookings.edu': ['Brookings Institution', 'think_tank', 'washington'],
  'rand.org': ['RAND Corporation', 'think_tank', 'santaMonica'],
  'chathamhouse.org': ['Chatham House', 'think_tank', 'london'],
  'carnegieendowment.org': ['Carnegie Endowment', 'think_tank', 'washington'],
  'csis.org': ['CSIS', 'think_tank', 'washington'],
  'cfr.org': ['Council on Foreign Relations', 'think_tank', 'newYork'],
  'urban.org': ['Urban Institute', 'think_tank', 'washington'],
  'pewresearch.org': ['Pew Research Center', 'think_tank', 'washington'],
  'odi.org': ['ODI', 'think_tank', 'london'],
  'iied.org': ['IIED', 'think_tank', 'london'],
  'wri.org': ['World Resources Institute', 'think_tank', 'washington'],
  'ifpri.org': ['IFPRI', 'think_tank', 'washington'],
  'cgdev.org': ['Center for Global Development', 'think_tank', 'washington'],
  'piie.com': ['Peterson Institute', 'think_tank', 'washington'],
  'bruegel.org': ['Bruegel', 'think_tank', 'brussels'],
  'sipri.org': ['SIPRI', 'think_tank', 'stockholm'],
  'e3g.org': ['E3G', 'think_tank', 'london'],
  'iea.org': ['International Energy Agency', 'intergovernmental', 'paris'],
  'irena.org': ['IRENA', 'intergovernmental', 'abuDhabi'],
  'ember-energy.org': ['Ember', 'think_tank', 'london'],
  'rmi.org': ['RMI', 'think_tank', 'basalt'],
  'climateanalytics.org': ['Climate Analytics', 'think_tank', 'berlin'],
  'msf.org': ['Médecins Sans Frontières', 'ngo', 'geneva'],
  'path.org': ['PATH', 'ngo', 'seattle'],
  'gavi.org': ['Gavi', 'ngo', 'geneva'],
  'theglobalfund.org': ['The Global Fund', 'ngo', 'geneva'],
  'ippf.org': ['IPPF', 'ngo', 'london'],
  'icrc.org': ['ICRC', 'ngo', 'geneva'],
  'ifrc.org': ['IFRC', 'ngo', 'geneva'],
  'savethechildren.net': ['Save the Children International', 'ngo', 'london'],
  'oxfam.org': ['Oxfam International', 'ngo', 'nairobi'],
  'care.org': ['CARE USA', 'ngo', 'atlanta'],
  'plan-international.org': ['Plan International', 'ngo', 'woking'],
  'wateraid.org': ['WaterAid', 'ngo', 'london'],
  'ons.gov.uk': ['Office for National Statistics', 'government', 'newport'],
  'census.gov': ['US Census Bureau', 'government', 'suitland'],
  'abs.gov.au': ['Australian Bureau of Statistics', 'government', 'canberra'],
  'statcan.gc.ca': ['Statistics Canada', 'government', 'ottawa'],
  'destatis.de': ['Destatis', 'government', 'wiesbaden'],
  'insee.fr': ['INSEE', 'government', 'paris'],
  'eea.europa.eu': ['European Environment Agency', 'government', 'copenhagen'],
  'eurofound.europa.eu': ['Eurofound', 'government', 'dublin'],
  'efsa.europa.eu': ['European Food Safety Authority', 'government', 'parma'],
  'ema.europa.eu': ['European Medicines Agency', 'government', 'amsterdam'],
  'ecdc.europa.eu': ['ECDC', 'government', 'stockholm'],
  'cedefop.europa.eu': ['Cedefop', 'government', 'thessaloniki'],
}

const SUFFIXES: [string, string | null, OrgType][] = [
  ['.europa.eu', 'BE', 'government'],
  ['.gov.uk', 'GB', 'government'],
  ['.ac.uk', 'GB', 'academic'],
  ['.gouv.fr', 'FR', 'government'],
  ['.gc.ca', 'CA', 'government'],
  ['.gov.au', 'AU', 'government'],
  ['.edu.au', 'AU', 'academic'],
  ['.govt.nz', 'NZ', 'government'],
  ['.gov', 'US', 'government'],
  ['.mil', 'US', 'government'],
  ['.edu', 'US', 'academic'],
  ['.int', null, 'intergovernmental'],
]

const TLD_COUNTRY: Record<string, string> = { uk: 'GB' }

export const ORG_TYPE_LABEL: Record<OrgType, string> = {
  intergovernmental: 'Intergovernmental',
  think_tank: 'Think tank',
  ngo: 'Non-profit',
  government: 'Public agency',
  academic: 'Academic',
  unknown: 'Other',
}

const placeOf = (cc: string, city: [string, number, number] | null): GeoPlace => {
  const country = COUNTRIES[cc]!
  const [name, lat, lon] = city ?? country.capital
  return { city: city === null ? null : name, country: cc, countryName: country.name, iso: country.iso, lat, lon }
}

export function orgOf(domain: string): OrgInfo {
  const known = KNOWN[domain]
  if (known !== undefined) {
    const [name, type, cityKey] = known
    const [city, cc, lat, lon] = CITIES[cityKey]!
    return { name, type, place: placeOf(cc, [city, lat, lon]) }
  }
  const suffix = SUFFIXES.find(([s]) => domain.endsWith(s))
  if (suffix !== undefined) {
    const [, cc, type] = suffix
    return { name: null, type, place: cc === null ? null : placeOf(cc, null) }
  }
  const tld = domain.split('.').at(-1)!.toUpperCase()
  const cc = TLD_COUNTRY[tld.toLowerCase()] ?? tld
  return { name: null, type: 'unknown', place: COUNTRIES[cc] === undefined ? null : placeOf(cc, null) }
}

export const countryName = (cc: string) => COUNTRIES[cc]?.name ?? cc
