import countries from 'i18n-iso-countries';
import englishCountries from 'i18n-iso-countries/langs/en.json' with { type: 'json' };

countries.registerLocale(englishCountries);

const CUSTOM_REGIONS = [
    'Worldwide',
    'Africa',
    'ANZ',
    'APAC',
    'Asia',
    'Asia-Pacific',
    'Benelux',
    'DACH',
    'EMEA',
    'EU',
    'Europe',
    'European Union',
    'LATAM',
    'Latin America',
    'Middle East',
    'Nordics',
    'North America',
    'Oceania',
    'South America',
    'UK & Ireland',
    'United Kingdom',
    'United States',
    'US & Canada',
];

const COMMON_CITIES = [
    'Amsterdam',
    'Austin',
    'Bangalore',
    'Barcelona',
    'Bengaluru',
    'Berlin',
    'Birmingham',
    'Boston',
    'Bristol',
    'Brussels',
    'Cambridge',
    'Cardiff',
    'Chicago',
    'Copenhagen',
    'Delhi',
    'Dubai',
    'Dublin',
    'Edinburgh',
    'Glasgow',
    'Hong Kong',
    'Leeds',
    'Lisbon',
    'London',
    'Los Angeles',
    'Madrid',
    'Manchester',
    'Melbourne',
    'Milan',
    'Munich',
    'New York',
    'Oxford',
    'Paris',
    'Prague',
    'San Francisco',
    'Seattle',
    'Singapore',
    'Stockholm',
    'Sydney',
    'Tel Aviv',
    'Tokyo',
    'Toronto',
    'Vancouver',
    'Vienna',
    'Warsaw',
    'Zurich',
];

const timezoneLabels = Intl.supportedValuesOf('timeZone')
    .map((zone) => zone.split('/').at(-1)?.replaceAll('_', ' '))
    .filter((label) => label && !/^(GMT|UTC)[+-]?\d*$/.test(label));

const uniqueLabels = [
    ...new Set([
        ...CUSTOM_REGIONS,
        ...COMMON_CITIES,
        ...Object.values(countries.getNames('en', { select: 'all' })).flat(),
        ...timezoneLabels,
    ]),
].sort((left, right) => left.localeCompare(right));

export const LOCATION_OPTIONS = Object.freeze(uniqueLabels);
export const LOCATION_LABELS = new Map(
    LOCATION_OPTIONS.map((label) => [label.toLowerCase(), label]),
);

export function canonicalLocationLabel(value) {
    if (typeof value !== 'string') return null;
    return LOCATION_LABELS.get(value.trim().toLowerCase()) ?? null;
}
