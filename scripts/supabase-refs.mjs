// Supabase project refs — not secrets (refs are public in project URLs), safe to commit.
// Used by scripts/guard-not-production.mjs and npm run supabase:* scripts to make sure
// staging-only operations (db push, RPC tests, inventory snapshot migration) can never
// accidentally target the production project.
export const PRODUCTION_PROJECT_REF = 'ylvebibsevesazntalos' // lab-manager (production)
export const STAGING_PROJECT_REF = 'vvafhcqypvejvsuksooi' // lab-manager-staging (South Asia / Mumbai)
