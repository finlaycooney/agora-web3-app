export function jobStatusLabel(job) {
    if (job.publicationState === 'draft') return 'Draft';
    if (job.publicationState === 'archived') return 'Archived';
    if (job.publicationState === 'withdrawn') return 'Withdrawn';
    if (typeof job.publiclyListed !== 'boolean') return 'Visibility unavailable';
    return job.publiclyListed ? 'Listed' : 'Unlisted';
}
