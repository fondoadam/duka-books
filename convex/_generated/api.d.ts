/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as http from "../http.js";
import type * as inbound from "../inbound.js";
import type * as ledger from "../ledger.js";
import type * as lib_ai from "../lib/ai.js";
import type * as lib_extract from "../lib/extract.js";
import type * as lib_posting from "../lib/posting.js";
import type * as lib_whatsapp from "../lib/whatsapp.js";
import type * as process from "../process.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  http: typeof http;
  inbound: typeof inbound;
  ledger: typeof ledger;
  "lib/ai": typeof lib_ai;
  "lib/extract": typeof lib_extract;
  "lib/posting": typeof lib_posting;
  "lib/whatsapp": typeof lib_whatsapp;
  process: typeof process;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
