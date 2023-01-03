import { isBytesLike } from "@ethersproject/bytes";
import { makeResponse } from "./helpers";
import makeImage from "./makeImage";

export interface Env {
  // Example binding to KV. Learn more at https://developers.cloudflare.com/workers/runtime-apis/kv/
  // MY_KV_NAMESPACE: KVNamespace;
  //
  // Example binding to Durable Object. Learn more at https://developers.cloudflare.com/workers/runtime-apis/durable-objects/
  // MY_DURABLE_OBJECT: DurableObjectNamespace;
  //
  // Example binding to R2. Learn more at https://developers.cloudflare.com/workers/runtime-apis/r2/
  GENERATED_AVATAR: R2Bucket;
  API_KEY: string;
}

export default {
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext
  ): Promise<Response> {
    const url = new URL(request.url);
    const node = url.searchParams.get("node");
    if (
      (request.method !== "GET" && request.method !== "HEAD") ||
      url.pathname !== "/" ||
      !node ||
      !isBytesLike(node) ||
      node.length !== 66 ||
      !node.startsWith("0x")
    ) {
      return makeResponse("Not supported", 405);
    }

    let file: R2ObjectBody | R2Object | null = await env.GENERATED_AVATAR.get(
      node
    );
    let body: ReadableStream | Uint8Array;

    if (!file) {
      const image = await makeImage(node, env.API_KEY);
      if (!image) {
        return makeResponse("An error occurred", 500);
      }
      file = await env.GENERATED_AVATAR.put(node, image, {
        httpMetadata: { contentType: "image/png" },
      });
      body = image;
    } else {
      body = (file as R2ObjectBody).body;
    }

    return makeResponse(request.method === "HEAD" ? undefined : body, 200, {
      "Content-Type": file.httpMetadata!.contentType!,
      "Content-Length": file.size,
    });
  },
};
