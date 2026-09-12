// Project-wide CSS module declarations.
//
// OperationsMap.tsx imports third-party stylesheets side-effect style:
//   import "leaflet/dist/leaflet.css";
//   import "leaflet.markercluster/dist/MarkerCluster.css";
//
// Next.js normally resolves *.css imports through the globals pulled in by
// next-env.d.ts. Declaring them here explicitly keeps the TypeScript
// language server (VS Code etc.) from ever showing
// "Cannot find module '*.css' or its corresponding type declarations",
// even before running `next dev`/`next build` on a fresh install.
declare module "*.css";