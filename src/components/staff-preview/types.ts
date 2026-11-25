export type PreviewScreen =
    | 'candidates'
    | 'applications'
    | 'candidate'
    | 'import'
    | 'privacy'
    | 'overview'
    | 'clients'
    | 'client'
    | 'clientEditor'
    | 'jobs'
    | 'job'
    | 'jobEditor';

export type CandidateSource = 'Application' | 'Referral' | 'CSV import' | 'Manual';
export type DocumentState = 'Available' | 'Scanning' | 'Restricted' | 'Unavailable';
export type ApplicationStage = 'New' | 'Reviewing' | 'Interview';
export type Availability = 'Open to opportunities' | 'Not specified';
export type BadgeTone =
    | 'default'
    | 'secondary'
    | 'accent'
    | 'success'
    | 'warning'
    | 'restriction'
    | 'outline';

export interface CandidateDocument {
    id: string;
    name: string;
    state: DocumentState;
    version: number;
}

export interface CandidateApplication {
    id: string;
    jobId: string;
    clientId: string;
    job: string;
    client: string;
    stage: ApplicationStage;
    receivedAt: string;
    owner?: string;
    source?: CandidateSource;
}

export type SocialPlatform = 'linkedin' | 'x' | 'github' | 'other';
export type EmploymentType = 'full_time' | 'part_time' | 'contract' | 'internship';
export type WorkplaceMode = 'onsite' | 'hybrid' | 'remote';
export type PayPeriod = 'year' | 'month' | 'day' | 'hour';
export type BonusType = 'cash' | 'equity' | 'options' | 'stock' | 'token' | 'other';

export interface SocialLink {
    platform: SocialPlatform;
    url: string;
}

export interface JobBonus {
    type: BonusType;
    details: string;
}

export interface JobDocumentNode {
    type: string;
    text?: string;
    attrs?: Record<string, unknown>;
    marks?: { type: string; attrs?: Record<string, unknown> }[];
    content?: JobDocumentNode[];
}

export interface JobDocument {
    type: 'doc';
    content: JobDocumentNode[];
}

export interface DemoClient {
    id: string;
    name: string;
    industry: string;
    location: string;
    owner: string;
    status: 'draft' | 'active';
    contactName: string | null;
    contactEmail: string | null;
    telegramUsername: string | null;
    website: string | null;
    socialLinks: SocialLink[];
    isStealth: boolean;
    anonymousDescription: string | null;
}

export interface JobFields {
    title: string;
    employmentType: EmploymentType | null;
    workplaceMode: WorkplaceMode | null;
    locations: string[];
    remoteRegions: string[];
    compensationMin: string | null;
    compensationMax: string | null;
    currency: string | null;
    payPeriod: PayPeriod | null;
    bonuses: JobBonus[];
    descriptionDocument: JobDocument;
}

export interface JobRevision extends JobFields {
    clientId: string;
    revisionId: string;
    revisionVersion: string;
}

export interface DemoJob extends JobFields {
    id: string;
    clientId: string;
    publicationState: 'draft' | 'published';
    applicationState: 'open' | 'closed';
    jobVersion: string;
    revisionId: string;
    revisionVersion: string;
    draft: JobRevision | null;
    summary: string;
    responsibilities: string[];
    requirements: string[];
}

export interface CandidateExperience {
    role: string;
    company: string;
    period: string;
    description: string;
}

export interface CandidateNote {
    id: string;
    body: string;
    author: string;
    createdLabel: string;
}

export interface Candidate {
    id: string;
    name: string;
    headline: string;
    location: string;
    email: string;
    owner: string;
    source: CandidateSource;
    tags: string[];
    availability: Availability;
    restricted: boolean;
    summary: string;
    experience?: CandidateExperience[];
    skills?: string[];
    addedDaysAgo: number;
    documents: CandidateDocument[];
    applications: CandidateApplication[];
    notes: CandidateNote[];
}

export interface PrivacyStep {
    label: string;
    state: 'done' | 'current' | 'pending';
}

export interface PrivacyCase {
    id: string;
    reference: string;
    kind: 'Restriction' | 'Access';
    status: 'In progress' | 'Received';
    due: string;
    subjectId: string;
    steps: PrivacyStep[];
    timeline: { label: string; detail: string }[];
    pendingBlocks: { title: string; detail: string }[];
    reviewedRecords: string[];
}
