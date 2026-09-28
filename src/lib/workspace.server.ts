import 'server-only';
import { cache } from 'react';
import type { StaffWorkspaceSummary } from './workspace-types';
import { getStaffWorkspace } from './workspace-operations';
import { staffGate } from './staff-gate.server';

export const loadStaffWorkspace = cache(async () => {
    const gate = await staffGate();
    if (gate.stage !== 'verified') {
        return { gate, summary: null as StaffWorkspaceSummary | null };
    }
    try {
        const summary = await getStaffWorkspace(
            gate.pool, gate.identity, gate.organizationId);
        return { gate, summary: summary as StaffWorkspaceSummary | null };
    } catch (error) {
        console.error(
            'staff workspace summary failed',
            (error as { code?: string })?.code ?? 'UNKNOWN',
        );
        return { gate, summary: null };
    }
});
