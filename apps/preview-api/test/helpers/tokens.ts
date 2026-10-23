import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT, type JWK } from "jose";

const SUPABASE_URL = "http://127.0.0.1:54321";
export const issuer = `${SUPABASE_URL}/auth/v1`;

const { publicKey, privateKey } = await generateKeyPair("ES256");
const kid = "test-key";
const publicJwk: JWK = await exportJWK(publicKey);
publicJwk.alg = "ES256";
publicJwk.kid = kid;
publicJwk.use = "sig";

export const jwks = createLocalJWKSet({ keys: [publicJwk] });

export async function signToken(overrides: Record<string, unknown> = {}): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const builder = new SignJWT({})
    .setProtectedHeader({ alg: "ES256", kid })
    .setIssuer(typeof overrides.iss === "string" ? overrides.iss : issuer)
    .setAudience(typeof overrides.aud === "string" ? overrides.aud : "authenticated")
    .setExpirationTime(typeof overrides.exp === "number" ? overrides.exp : now + 3600);

  if (overrides.sub === false) {
    // omit sub claim
  } else {
    builder.setSubject(typeof overrides.sub === "string" ? overrides.sub : "user-1");
  }

  return builder.sign(privateKey);
}
