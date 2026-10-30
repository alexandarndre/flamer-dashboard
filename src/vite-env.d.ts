/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_BACKEND?: 'sw'
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

declare module 'world-atlas/countries-110m.json' {
  import type { GeometryCollection, Topology } from 'topojson-specification'
  const topology: Topology<{ countries: GeometryCollection<{ name: string }>; land: GeometryCollection }>
  export default topology
}
