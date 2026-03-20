/// <reference types="vite/client" />

declare module "*.geojson" {
  const value: {
    type: string;
    features: Array<unknown>;
  };

  export default value;
}
