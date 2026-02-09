/** @type {import('next').NextConfig} */
const supabaseHost = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname
  : "placeholder.supabase.co";

const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "static.wikia.nocookie.net",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: supabaseHost,
        pathname: "/storage/v1/object/**",
      },
    ],
    // Serve modern formats — AVIF is ~50 % smaller than WebP
    formats: ["image/avif", "image/webp"],
    // Wiki images rarely change — cache optimised versions for 7 days
    minimumCacheTTL: 604800,
    // Tailored device sizes for the card grid + detail hero
    deviceSizes: [640, 750, 828, 1080, 1200, 1920],
    imageSizes: [64, 128, 256, 384],
  },
};

export default nextConfig;
