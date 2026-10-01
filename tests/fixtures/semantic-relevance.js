// Synthetic profiles and relevance judgments, never real recruiting records.
// Five independently searchable profiles per discipline include nearby careers
// that share vocabulary. Queries deliberately paraphrase rather than copy titles.
const disciplines = [
  ['solidity', 'Solidity protocol engineer', 'Builds lending pools, staking contracts and automated market makers on Ethereum. Ships production Solidity with Foundry tests and manages gas costs.', 'engineer to implement on-chain decentralized lending', 'desarrollador de protocolos de préstamos descentralizados en Ethereum'],
  ['audit', 'Smart contract security auditor', 'Reviews existing EVM contracts for reentrancy, access-control vulnerabilities and economic exploits. Produces audit reports and fuzzing proofs; prefers security review engagements.', 'specialist to find exploitable bugs in existing blockchain contracts', 'especialista en detectar vulnerabilidades y ataques en contratos inteligentes'],
  ['rust', 'Rust systems engineer', 'Develops low-latency trading infrastructure and concurrent network services in Rust. Profiles memory allocation, optimizes execution latency and maintains exchange connectivity.', 'systems programmer for fast exchange connectivity and execution', 'programador de sistemas Rust para ejecución de operaciones de baja latencia'],
  ['python', 'Python backend engineer', 'Builds Django and FastAPI services backed by PostgreSQL. Designs REST APIs, database migrations and background jobs for business applications.', 'backend developer for a Python web API with a relational database', 'ingeniero backend con Django, APIs y bases de datos relacionales'],
  ['typescript', 'TypeScript backend engineer', 'Builds Node.js services with NestJS and TypeScript. Designs event-driven APIs, queue consumers and integrations for subscription products.', 'server-side JavaScript developer for asynchronous business services', 'desarrollador de servicios backend con Node y TypeScript'],
  ['frontend', 'React frontend engineer', 'Develops accessible browser interfaces with React and TypeScript. Implements design systems, keyboard navigation and responsive user interfaces while reducing rendering time.', 'developer for accessible interactive web interfaces', 'desarrollador frontend React para interfaces web accesibles'],
  ['design', 'Product designer', 'Conducts user interviews and usability studies. Produces Figma prototypes and visual interaction designs, then tests product flows with customers. Does not implement production code.', 'designer to research users and prototype product experiences', 'diseñador de producto que hace entrevistas y prototipos en Figma'],
  ['data', 'Data engineer', 'Builds batch and streaming data pipelines with Spark, Airflow and Kafka. Maintains warehouse transformations, data quality checks and reliable ingestion.', 'engineer for reliable streaming ingestion and warehouse pipelines', 'ingeniero de datos para pipelines de ingesta con Kafka y Spark'],
  ['analytics', 'Product data analyst', 'Uses SQL and Python to investigate activation, conversion and retention. Designs A/B tests, explains business metrics and builds decision-support dashboards.', 'analyst to measure product conversion and experiment outcomes', 'analista para medir conversión, retención y experimentos de producto'],
  ['recommendation', 'Machine learning engineer', 'Trains and deploys recommendation and ranking models using user-item interactions. Works on retrieval, personalization, offline evaluation and inference services.', 'engineer to personalize recommendations and rank relevant items', 'ingeniero de aprendizaje automático para sistemas de recomendación personalizados'],
  ['vision', 'Computer vision engineer', 'Trains object detection and image segmentation models for industrial inspection. Curates annotated image datasets and deploys neural networks on edge devices.', 'machine learning specialist for detecting defects in camera images', 'especialista en visión artificial para detectar defectos en imágenes'],
  ['sre', 'Site reliability engineer', 'Operates Kubernetes services and automates incident response. Builds observability, service-level objectives and infrastructure with Terraform while improving uptime.', 'engineer to improve service reliability and production incident response', 'ingeniero de fiabilidad para Kubernetes, observabilidad e incidentes'],
  ['ios', 'iOS engineer', 'Builds native iPhone applications with Swift and SwiftUI. Handles offline synchronization, accessibility and App Store releases.', 'native Apple mobile application developer', 'desarrollador de aplicaciones nativas para iPhone con Swift'],
  ['android', 'Android engineer', 'Builds native Android applications with Kotlin and Jetpack Compose. Handles background work, device compatibility and Google Play releases.', 'native Google mobile platform developer using Kotlin', 'desarrollador de aplicaciones nativas Android con Kotlin'],
  ['qa', 'Quality automation engineer', 'Builds browser and API test suites with Playwright. Investigates flaky tests, designs regression coverage and integrates test execution into continuous delivery.', 'engineer to automate browser regression testing and reduce flaky tests', 'ingeniero de calidad para automatizar pruebas de navegador y regresiones'],
  ['recruiter', 'Technical recruiter', 'Sources and interviews Solidity, Rust and Python engineers. Manages candidate pipelines, negotiates offers and works with hiring managers; does not develop software.', 'recruiter to source engineering candidates and manage hiring pipelines', 'reclutador técnico para buscar candidatos y gestionar contrataciones'],
  ['sales', 'Enterprise account executive', 'Sells B2B software to enterprise customers. Runs discovery calls, negotiates annual contracts and manages complex sales cycles with procurement teams.', 'salesperson to close enterprise software contracts', 'ejecutivo comercial para cerrar contratos de software con grandes empresas'],
  ['success', 'Customer success manager', 'Onboards existing enterprise accounts, tracks adoption and manages renewal risks. Coordinates support escalations and builds customer success plans.', 'person to improve existing customer adoption and retention after purchase', 'responsable de éxito del cliente para adopción y renovaciones'],
  ['finance', 'Financial controller', 'Owns month-end close, financial statements and cash-flow planning. Reconciles accounts, coordinates audits and implements accounting controls.', 'finance professional to own accounting close and financial reporting', 'responsable financiero de cierres contables y estados financieros'],
  ['product', 'Product manager', 'Sets product priorities using customer discovery and business goals. Writes requirements, aligns engineering and design teams, and measures feature outcomes.', 'product leader to prioritize a roadmap and coordinate delivery', 'responsable de producto para priorizar la hoja de ruta y coordinar equipos'],
];

const contexts = [
  ['Madrid', 'Remote within Europe; EUR 90–110k annual salary.', 'Six years of experience in growth-stage products.'],
  ['London', 'Hybrid two days per week; GBP 85–100k annual salary.', 'Eight years of experience, including mentoring a small team.'],
  ['Berlin', 'Remote or hybrid; EUR 100–120k annual salary.', 'Five years of experience working on international teams.'],
  ['Barcelona', 'Remote only; available after a two-month notice period.', 'Seven years of experience in regulated business environments.'],
  ['Lisbon', 'Open to permanent work or a six-month contract.', 'Four years of experience at early-stage startups.'],
];

export const relevanceProfiles = disciplines.flatMap(([key, headline, summary], index) =>
  contexts.map(([location, compensationPreference, context], variant) => ({
    key: `${key}-${variant}`, discipline: key,
    fields: { firstName: `Synthetic${index + 1}`, lastName: `Profile${variant + 1}`,
      primaryEmail: `${key}-${variant}@example.invalid`, secondaryEmails: [],
      headline, location, compensationPreference, professionalSummary: `${summary} ${context}` },
  })));

export const relevanceQueries = disciplines.flatMap(([key, , , english, spanish]) =>
  [english, spanish].map((query, language) => ({ id: `${key}-${language ? 'es' : 'en'}`, query,
    language: language ? 'es' : 'en', relevantKeys: contexts.map((_, i) => `${key}-${i}`) })));

// Negation and hard constraints are diagnostic: cosine similarity is ranking,
// not a promise that every sentence in a query becomes an exact filter.
export const diagnosticQueries = [
  { id: 'not-recruiter', query: 'Solidity programmer who builds contracts, not someone who recruits developers', preferredDiscipline: 'solidity' },
  { id: 'not-auditor', query: 'Implement new DeFi lending contracts, not security auditing engagements', preferredDiscipline: 'solidity' },
  { id: 'not-designer', query: 'Write React production code rather than only designing prototypes', preferredDiscipline: 'frontend' },
  { id: 'not-sales', query: 'Support existing customers after they buy rather than acquire new customers', preferredDiscipline: 'success' },
];

export function syntheticProjection(profile) {
  const f = profile.fields;
  return `Name: ${f.firstName} ${f.lastName}\nHeadline: ${f.headline}\nLocation: ${f.location}\nSummary: ${f.professionalSummary}\nPreferences: ${f.compensationPreference}`;
}
