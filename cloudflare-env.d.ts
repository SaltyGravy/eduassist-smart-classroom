type Fetcher = {
  fetch(input: Request | URL | string, init?: RequestInit): Promise<Response>;
};

type D1Database = any;

declare module "cloudflare:workers" {
  export const env: {
    DB?: D1Database;
  };
}
