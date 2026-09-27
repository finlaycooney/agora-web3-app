import 'server-only';
import pg from 'pg';

let intakePool;

// Lazily creates the public-intake pool. Returns null when intake is not
// configured, so callers can fail closed rather than crash.
export function getIntakePool() {
    const connectionString = process.env.INTAKE_DATABASE_URL;
    if (!connectionString) {
        return null;
    }
    if (!intakePool) {
        intakePool = new pg.Pool({
            connectionString,
            max: 2,
            idleTimeoutMillis: 10_000,
        });
    }
    return intakePool;
}
