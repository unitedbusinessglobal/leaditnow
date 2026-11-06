/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Prisma's Rust-free client loads its query compiler from a .wasm file that file tracing misses.
  serverExternalPackages: ["@prisma/client", ".prisma/client"],
  outputFileTracingIncludes: {
    "/**": ["./node_modules/.prisma/client/**/*", "./node_modules/@prisma/client/runtime/**/*"],
  },
};

export default nextConfig;
