/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false,
  // Exclude heavy server-only packages from being traced/bundled unnecessarily
  experimental: {
    serverComponentsExternalPackages: [
      "firebase-admin",
      "@langchain/core",
      "@langchain/google-genai",
      "@langchain/langgraph",
      "langchain",
    ],
  },
};

export default nextConfig;
