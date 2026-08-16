/** @type {import('next').NextConfig} */
const nextConfig = {
  // `typescript.ignoreBuildErrors` used to be true here, which meant a type
  // error anywhere — including in a security-relevant path like the session
  // filters in lib/workflow-store.ts — deployed silently. Type checking is
  // part of the build again.
  images: {
    unoptimized: true,
  },
}

export default nextConfig
