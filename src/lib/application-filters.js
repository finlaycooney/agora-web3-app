// Stage cards are facets of the current search/client/job/review scope. Selecting
// a stage narrows the table without hiding the counts for the other stages.
export function filterApplicationRows(applications, filters, { includeStage = true } = {}) {
    const needle = filters.query.trim().toLowerCase();
    const reviewSupported = applications.every((row) => typeof row.stageIsInitial === 'boolean');
    return applications.filter((row) => {
        if (filters.jobId !== 'all' && row.jobId !== filters.jobId) return false;
        if (filters.clientId !== 'all' && row.clientId !== filters.clientId) return false;
        if (includeStage && filters.stage !== 'all'
            && row.stageKey !== filters.stage && row.stageId !== filters.stage) return false;
        if (filters.review && reviewSupported && row.stageIsInitial !== true) return false;
        return !needle || `${row.candidateName ?? ''} ${row.jobTitle} ${row.clientName} ${row.publicReference}`
            .toLowerCase().includes(needle);
    });
}
