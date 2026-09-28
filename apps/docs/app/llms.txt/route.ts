import { llms } from "fumadocs-core/source";
import { prefixMagicDocsLlmLinks } from "magic-docs/llms";

import { site } from "@/lib/site";
import { source } from "@/lib/source";

export const revalidate = false;

export const GET = async () =>
  new Response(prefixMagicDocsLlmLinks(site, await llms(source).index()), {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
