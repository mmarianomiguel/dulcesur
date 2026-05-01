import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  productionBrowserSourceMaps: false,
  poweredByHeader: false,
  compress: true,
  experimental: {
    optimizePackageImports: ["lucide-react", "recharts", "@base-ui/react", "date-fns"],
    // optimizeCss + critters tiene bugs conocidos que pueden romper la medición de LCP.
    // Lo dejamos desactivado hasta que sea estable. critters queda instalado por si se reactiva.
    // optimizeCss: true,
  },
  images: {
    loader: "custom",
    loaderFile: "./src/lib/image-loader.ts",
    formats: ["image/avif", "image/webp"],
    minimumCacheTTL: 3600,
    deviceSizes: [256, 384, 640, 750, 828, 1080, 1200],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 320],
    remotePatterns: [
      {
        protocol: "https",
        hostname: "www.dulcesur.com",
      },
      {
        protocol: "https",
        hostname: "*.supabase.co",
      },
      {
        protocol: "https",
        hostname: "res.cloudinary.com",
      },
    ],
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-XSS-Protection", value: "1; mode=block" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
      // Cache agresivo para chunks de Next con hash en el nombre (cambian en cada deploy).
      {
        source: "/_next/static/:path*",
        headers: [
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
        ],
      },
      // Cache largo para assets de imágenes optimizadas.
      {
        source: "/_next/image(.*)",
        headers: [
          { key: "Cache-Control", value: "public, max-age=86400, stale-while-revalidate=604800" },
        ],
      },
    ];
  },
};

// Target modern browsers only — elimina polyfills innecesarios
process.env.BROWSERSLIST = "chrome >= 90, firefox >= 90, safari >= 14, edge >= 90";

export default nextConfig;
 
// reconnected
