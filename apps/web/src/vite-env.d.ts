/// <reference types="vite/client" />

declare module "*.module.css" {
  const classes: Record<string, string>;
  export default classes;
}

declare module "pptx2tikz" {
  const content: any;
  export default content;
  export function pptx2tikz(...args: any[]): any;
}
