/**
 * SolarAssist Phase 8: Scale & Hardening Safety Guard
 * 
 * Enforces strict isolation rules:
 * 1. Prohibits execution against the production Supabase database.
 * 2. Requires explicit ISOLATED_TEST_ENV=true flag.
 * 3. Enforces synthetic labeling on all generated records.
 */

const PRODUCTION_PROJECT_REF = "ylnmjvgnjootrkywbcsj";

export interface TestEnvironmentConfig {
  isIsolated: boolean;
  targetUrl: string;
  isMockServer: boolean;
}

export function verifyTestEnvironmentSafety(customUrl?: string): TestEnvironmentConfig {
  const targetUrl = customUrl || process.env.TEST_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const isIsolatedEnv = process.env.ISOLATED_TEST_ENV === "true";

  // Check 1: Explicit isolation flag must be set
  if (!isIsolatedEnv) {
    throw new Error(
      "CRITICAL SAFETY VIOLATION: ISOLATED_TEST_ENV is not set to 'true'. " +
      "Scale tests are strictly forbidden from running without explicit isolated test environment confirmation."
    );
  }

  // Check 2: Must not target production Supabase project ref
  if (targetUrl.includes(PRODUCTION_PROJECT_REF)) {
    throw new Error(
      `CRITICAL SAFETY VIOLATION: Target URL (${targetUrl}) matches the production Supabase project (${PRODUCTION_PROJECT_REF}). ` +
      "Never seed, mutate, or stress-test against the production fleet!"
    );
  }

  // Check 3: Allowed targets are local mock/embedded databases or explicitly isolated test projects
  const isLocal = targetUrl.startsWith("http://127.0.0.1") || 
                  targetUrl.startsWith("http://localhost") ||
                  targetUrl.startsWith("mock://");

  const isIsolatedTestProject = targetUrl.includes("test") || isLocal;

  if (!isIsolatedTestProject) {
    throw new Error(
      `CRITICAL SAFETY VIOLATION: Target URL (${targetUrl}) is not recognized as an isolated test project or local mock.`
    );
  }

  console.log(`[Safety Guard] PASSED. Operating in verified isolated test environment: ${targetUrl}`);

  return {
    isIsolated: true,
    targetUrl,
    isMockServer: isLocal,
  };
}
