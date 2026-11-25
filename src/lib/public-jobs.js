export const titleCase = (value) => String(value ?? '')
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');

export const salaryText = (compensation) => {
    const { min, max, currency, payPeriod } = compensation ?? {};
    if (min || max) {
        const range = min && max ? `${min} – ${max}` : (min ?? max);
        const period = payPeriod ? `/${titleCase(payPeriod).toLowerCase()}` : '';
        return `${range} ${currency ?? ''}${period}`.trim();
    }
    return 'Competitive';
};

export const locationText = ({ locations, remoteRegions, workplaceMode }) => {
    const places = [
        ...(Array.isArray(locations) ? locations : []),
        ...(Array.isArray(remoteRegions) ? remoteRegions : []),
    ];
    const mode = workplaceMode ? `(${titleCase(workplaceMode)})` : '';
    if (places.length === 0) {
        return mode ? `${titleCase(workplaceMode)}` : 'Flexible';
    }
    return `${places.join(' · ')} ${mode}`.trim();
};

// Maps a published-revision projection onto the shape the board components
// already render. The projection is stealth-safe by construction.
export const mapPublicJob = (row) => ({
    id: row.slug,
    title: row.title,
    salary: salaryText(row.compensation),
    location: locationText(row),
    type: titleCase(row.employmentType),
    description: row.descriptionText ?? '',
    descriptionDocument: row.descriptionDocument ?? null,
    publishedAt: row.publishedAt ?? null,
    responsibilities: null,
    tags: [],
    className: 'md:col-span-1',
    company: row.company?.name ?? null,
    applicationOpen: row.applicationOpen,
});
